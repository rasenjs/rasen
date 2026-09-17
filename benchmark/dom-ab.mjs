/**
 * Interleaved A/B runner for the DOM benchmark targets.
 *
 * Why this exists: on a laptop whose display/lock state changes, the absolute
 * numbers from a sequential harness run are not reproducible — the SAME
 * unchanged vanilla build measured 19.5ms, 30.9ms and 41.9ms for 03_update
 * across three sessions (within-run spread ±1ms). Sequential runs also measure
 * each target minutes apart, so a drifting machine silently invents or hides
 * differences between frameworks.
 *
 * This runner instead:
 *   - starts every target's preview server up front,
 *   - uses ONE browser for the whole run,
 *   - measures iterations ROUND-ROBIN across targets (order rotated each round
 *     so no target is systematically first),
 *   - reports min + median per target/benchmark (min is the most robust
 *     estimator when the noise is one-sided slowdown, which is what lock/screen
 *     interference produces),
 * so comparisons are same-session and drift-tolerant.
 *
 * It reuses bench.js's `measureIteration` — the official protocol (fresh page,
 * untraced init, CPU throttle, trace click→commit) lives in exactly one place.
 *
 * Usage (write to a log and run it in the background):
 *   node dom-ab.mjs --iters 9 > /tmp/dom-ab.log 2>&1
 *   node dom-ab.mjs --targets rasen,vanillajs --bench 01_run1k,03_update --iters 7
 *
 * Runs headless by default. That is not just politeness: a visible window can
 * be occluded or backgrounded while the user works, and Chrome throttles rAF /
 * compositing for hidden pages, which makes the numbers drift with whatever the
 * operator is doing. Pass --headful to watch the run instead.
 */
import puppeteer from 'puppeteer'
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const bench = require(path.join(__dirname, 'bench.js'))

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (i === -1) return dflt
  const a = argv[i]
  return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]
}
const TARGETS = String(argOf('targets', 'rasen,vanillajs,rasen-alien,vapor'))
  .split(',')
  .filter(Boolean)
const WANTED_BENCH = String(argOf('bench', '01_run1k,03_update,05_swap,06_remove,07_clear'))
  .split(',')
  .filter(Boolean)
const ITERS = Number(argOf('iters', 9))
const OUT_JSON = argOf('json', null)
const BASELINE = String(argOf('baseline', 'vanillajs'))
const HEADLESS = !argv.includes('--headful')

const BENCHMARKS = bench.BENCHMARKS.filter((b) => WANTED_BENCH.includes(b.id))
const TRACE_ROOT = path.join(__dirname, 'traces-ab')

// ---------------------------------------------------------------- servers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const findFreePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })

async function waitForServer(url, ms) {
  const start = Date.now()
  for (;;) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > ms) return false
    await new Promise((r) => setTimeout(r, 200))
  }
}

function startPreview(dir, outDir, port) {
  const vite = path.join(__dirname, '..', 'node_modules', '.bin', 'vite')
  const child = spawn(
    vite,
    ['preview', '--port', String(port), '--strictPort', '--outDir', outDir],
    { cwd: path.join(__dirname, dir), stdio: ['ignore', 'pipe', 'pipe'] }
  )
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  return child
}

// A target spec is "<dir>" or "<dir>#<outDir>". The two-build form lets a
// single session A/B a framework flag (build the same app twice and let them
// race), which is the only way to compare variants without cross-session drift.
const targetDir = (spec) => spec.split('#')[0]
const targetOutDir = (spec) => spec.split('#')[1] || 'dist'
const targetLabel = (spec) => spec.split('#')[0] + (spec.split('#')[1] ? `[${spec.split('#')[1]}]` : '')

// ---------------------------------------------------------------- stats
function stats(times) {
  if (!times.length) return null
  const s = [...times].sort((a, b) => a - b)
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  return {
    n: s.length,
    min: s[0],
    median,
    max: s[s.length - 1],
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  }
}

const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? '   -  ' : v.toFixed(d).padStart(6))
const fmtMult = (v) => (v == null || !Number.isFinite(v) ? '   -  ' : v.toFixed(3).padStart(6))

// ---------------------------------------------------------------- main
async function main() {
  console.log('=== interleaved A/B (same browser, round-robin targets) ===')
  console.log(`targets : ${TARGETS.map(targetLabel).join(', ')}`)
  console.log(`benches : ${BENCHMARKS.map((b) => b.id).join(', ')}`)
  console.log(`iters   : ${ITERS}   baseline for ratios: ${BASELINE}`)
  console.log(`browser : ${HEADLESS ? 'headless (default)' : 'HEADFUL — expect rAF/compositor drift'}\n`)

  const servers = []
  const urls = {}
  for (const spec of TARGETS) {
    const port = await findFreePort()
    servers.push(startPreview(targetDir(spec), targetOutDir(spec), port))
    urls[targetLabel(spec)] = `http://localhost:${port}/`
  }
  try {
    for (const [dir, url] of Object.entries(urls)) {
      if (!(await waitForServer(url, 30000))) throw new Error(`preview for ${dir} never came up`)
      console.log(`server up: ${dir} → ${url}`)
    }

    const browser = await bench.launchBrowser(HEADLESS)
    // samples[label][benchId] = [ms, ...]
    const samples = {}
    const failures = {}
    for (const spec of TARGETS) {
      const dir = targetLabel(spec)
      samples[dir] = {}
      failures[dir] = {}
      for (const b of BENCHMARKS) samples[dir][b.id] = []
    }

    try {
      for (let it = 0; it < ITERS; it++) {
        // rotate the order each round so no target is always first
        const off = it % TARGETS.length
        const order = TARGETS.slice(off).concat(TARGETS.slice(0, off))
        for (const spec of order) {
          const dir = targetLabel(spec)
          for (const b of BENCHMARKS) {
            if ((failures[dir][b.id] || 0) >= 2) continue // unsupported combo
            const dirTraces = path.join(TRACE_ROOT, dir)
            fs.mkdirSync(dirTraces, { recursive: true })
            const tracePath = path.join(dirTraces, `${b.id}_${it}.json`)
            bench.CONFIG.serverUrl = urls[dir]
            let t = null
            for (let attempt = 1; attempt <= 2 && t === null; attempt++) {
              try {
                t = await bench.measureIteration(browser, b, tracePath)
              } catch (e) {
                if (attempt === 2) {
                  failures[dir][b.id] = (failures[dir][b.id] || 0) + 1
                  process.stdout.write(
                    `  ! ${dir}/${b.id} failed: ${String(e.message || e).slice(0, 90)}\n`
                  )
                }
              }
            }
            if (t !== null) {
              samples[dir][b.id].push(t)
              process.stdout.write(`  · ${dir} ${b.id} it${it + 1}: ${t.toFixed(2)}ms\n`)
            }
          }
        }
        process.stdout.write(`round ${it + 1}/${ITERS} done\n`)
      }
    } finally {
      await browser.close()
    }

    // ---- report
    console.log(`\n\n${'='.repeat(96)}`)
    console.log('min / median per target (ms), and multipliers vs ' + BASELINE)
    console.log('='.repeat(96))
    const header = ['bench'.padEnd(12), ...TARGETS.map((t) => `${targetLabel(t)} min/med`.padStart(24))]
    console.log(header.join(' '))
    const report = {}
    for (const b of BENCHMARKS) {
      const row = []
      const base = stats(samples[BASELINE]?.[b.id] || [])
      report[b.id] = { label: b.label, targets: {} }
      for (const spec of TARGETS) {
        const dir = targetLabel(spec)
        const st = stats(samples[dir][b.id] || [])
        report[b.id].targets[dir] = {
          ...(st || {}),
          ratioMin: st && base ? st.min / base.min : null,
          ratioMedian: st && base ? st.median / base.median : null,
        }
        row.push(
          st
            ? `${fmt(st.min)}/${fmt(st.median)} ${fmtMult(st.ratioMin)}×`.padStart(24)
            : 'n/a'.padStart(24)
        )
      }
      console.log([b.id.padEnd(12), ...row].join(' '))
    }

    console.log(`\n── per-benchmark detail ──`)
    for (const b of BENCHMARKS) {
      console.log(`\n${b.id}  (${b.label})`)
      for (const spec of TARGETS) {
        const dir = targetLabel(spec)
        const r = report[b.id].targets[dir]
        if (r.n == null) {
          console.log(`   ${dir.padEnd(20)} n/a (assertions fail / not measured)`)
          continue
        }
        console.log(
          `   ${dir.padEnd(20)} n=${String(r.n).padStart(2)}  min ${fmt(r.min)}  median ${fmt(r.median)}  mean ${fmt(r.mean)}  max ${fmt(r.max)}` +
            `   vs ${BASELINE}: ${fmtMult(r.ratioMin)}× (min) / ${fmtMult(r.ratioMedian)}× (med)`
        )
      }
    }

    if (OUT_JSON) {
      fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), iters: ITERS, samples, report }, null, 1))
      console.log(`\n(json → ${OUT_JSON})`)
    }
  } finally {
    for (const s of servers) s.kill('SIGKILL')
    await sleep(300)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
