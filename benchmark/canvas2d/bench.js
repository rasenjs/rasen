#!/usr/bin/env node
/* eslint-disable */

/**
 * Canvas 2D benchmark runner.
 *
 * Drives the four target pages (vanilla / konva / fabric / rasen) through the
 * identical scenario protocol and reports medians + multipliers against the
 * vanilla baseline. Browser configuration mirrors the official
 * js-framework-benchmark runner (system Chrome, official args, headless via
 * `--headless=new`, never `--disable-gpu`).
 *
 * Usage:
 *   node bench.js                     # headless (default)
 *   node bench.js --no-headless       # headed
 *   node bench.js --count 5           # recorded op iterations (default 9)
 *   node bench.js --anim-runs 3       # animation runs per target (default 3)
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CONFIG = {
  serverUrl: 'http://localhost:5175',
  shapeCount: 1000,
  opIterations: 15, // recorded iterations per op (official default)
  animRuns: 3,
  animMs: 4000,
  // Animation scale sweep: sustained-throughput curve. At small counts every
  // library fits the frame budget (all "120fps"); differences become
  // user-visible only past each library's budget knee.
  animCounts: [1000, 5000, 10000],
  cpuThrottle: 1 // CDP Emulation.setCPUThrottlingRate for op pages (--throttle 4)
}

const TARGETS = [
  { name: 'Vanilla Canvas', page: 'vanilla.html' },
  { name: 'Konva', page: 'konva.html' },
  { name: 'Konva (tuned)', page: 'konva-fast.html' },
  { name: 'Fabric', page: 'fabric.html' },
  { name: 'Fabric (tuned)', page: 'fabric-fast.html' },
  { name: 'Rasen canvas-2d', page: 'rasen.html' }
]

// --- CLI --------------------------------------------------------------------
const argv = process.argv.slice(2)
const HEADLESS = !argv.includes('--no-headless')
function numFlag(name, fallback) {
  const i = argv.indexOf(name)
  return i >= 0 ? Number(argv[i + 1]) : fallback
}
CONFIG.opIterations = numFlag('--count', CONFIG.opIterations)
CONFIG.animRuns = numFlag('--anim-runs', CONFIG.animRuns)
CONFIG.cpuThrottle = numFlag('--throttle', CONFIG.cpuThrottle)
if (argv.includes('--anim-counts')) {
  const i = argv.indexOf('--anim-counts')
  CONFIG.animCounts = argv[i + 1].split(',').map(Number)
}

// --- Browser configuration, parity with the DOM benchmark / official runner ---
function browserExecutablePath() {
  switch (process.platform) {
    case 'darwin':
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    case 'win32':
      return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    default:
      return 'chrome'
  }
}

const CHROME_ARGS = [
  '--window-size=1280,800',
  '--js-flags=--expose-gc',
  '--no-default-browser-check',
  '--disable-sync',
  '--no-first-run',
  '--ash-no-nudges',
  '--disable-extensions',
  '--disable-features=Translate,PrivacySandboxSettings4,IPH_SidePanelGenericMenuFeature'
]

async function launchBrowser() {
  const args = [...CHROME_ARGS]
  if (HEADLESS) args.push('--headless=new')
  const options = {
    headless: false, // expressed purely through --headless=new, as official
    dumpio: false,
    defaultViewport: { width: 1280, height: 800 },
    args
  }
  const chromePath = browserExecutablePath()
  if (process.platform === 'linux' || fs.existsSync(chromePath)) {
    options.executablePath = chromePath
  } else {
    console.warn(`⚠️ system Chrome not found (${chromePath}), falling back to bundled Chromium`)
  }
  return puppeteer.launch(options)
}

// --- Server lifecycle (start-server.mjs contract: PORT env + ready signal) ---
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

function startServer(port, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['start'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(port), BENCH_READY_SIGNAL: signal },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve(child)
    }
    child.stdout.on('data', (d) => {
      process.stdout.write(`[server] ${d}`)
      if (!resolved && d.toString().includes(signal)) finish()
    })
    child.stderr.on('data', (d) => process.stdout.write(`[server] ${d}`))
    const timer = setTimeout(() => {
      if (!resolved) {
        child.kill('SIGKILL')
        reject(new Error('server did not become ready'))
      }
    }, 45000)
    child.on('exit', (code) => {
      if (!resolved) reject(new Error(`server exited early (${code})`))
    })
  })
}

async function stopServer(child, port) {
  if (!child) return
  await new Promise((resolve) => {
    child.on('exit', resolve)
    try {
      child.kill('SIGKILL')
    } catch {}
    setTimeout(resolve, 1500)
  })
  try {
    spawn('sh', ['-c', `lsof -ti tcp:${port} -sTCP:LISTEN | xargs -r kill -9`], {
      stdio: 'ignore'
    })
  } catch {}
}

// --- Stats -------------------------------------------------------------------
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
function mean(values) {
  return values.reduce((s, v) => s + v, 0) / values.length
}

// --- Measurement protocol ------------------------------------------------------
// One fresh page per iteration (official methodology). Ops sequence:
// create -> updateEvery10th -> clear, each timed inside the page including the
// library's draw pass (single-rAF wait). Optional official-style CPU
// throttling for op pages makes sub-frame work dominate frame-boundary jitter.
async function measureOps(browser, url, shapeCount) {
  const page = await browser.newPage()
  if (CONFIG.cpuThrottle > 1) {
    const cdp = await page.createCDPSession()
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CONFIG.cpuThrottle })
  }
  await page.goto(url, { waitUntil: 'networkidle0' })
  const results = await page.evaluate(async (n) => {
    const b = window.__bench
    const out = {}
    out.create = await b.create(n)
    out.update = await b.updateEvery10th()
    out.clear = await b.clear()
    return out
  }, shapeCount)
  await page.close()
  return results
}

async function measureAnim(browser, url, animMs, count) {
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle0' })
  const result = await page.evaluate(
    (ms, n) => window.__bench.animate(ms, n),
    animMs,
    count
  )
  await page.close()
  return result
}

// --- Main ----------------------------------------------------------------------
async function main() {
  console.log(`Canvas 2D benchmark — ${HEADLESS ? 'headless' : 'headed'} mode`)
  console.log(
    `  shapes: ${CONFIG.shapeCount}, op iterations: ${CONFIG.opIterations} (+1 warmup), anim: ${CONFIG.animRuns} × ${CONFIG.animMs}ms, cpu throttle: ${CONFIG.cpuThrottle}×\n`
  )

  const port = await findFreePort()
  const serverUrl = `http://localhost:${port}`
  const child = await startServer(port, '__BENCH_READY__')
  const browser = await launchBrowser()

  const report = {
    meta: {
      date: new Date().toISOString(),
      headless: HEADLESS,
      shapeCount: CONFIG.shapeCount,
      opIterations: CONFIG.opIterations,
      animRuns: CONFIG.animRuns,
      animMs: CONFIG.animMs,
      animCounts: CONFIG.animCounts,
      cpuThrottle: CONFIG.cpuThrottle,
      userAgent: null
    },
    targets: {}
  }

  try {
    for (const target of TARGETS) {
      const url = `${serverUrl}/${target.page}`
      console.log(`▶ ${target.name} (${target.page})`)

      // Warmup iteration (unrecorded) — JIT + font/GPU warm-up.
      await measureOps(browser, url, CONFIG.shapeCount)

      const ops = { create: [], update: [], clear: [] }
      for (let i = 0; i < CONFIG.opIterations; i++) {
        const r = await measureOps(browser, url, CONFIG.shapeCount)
        ops.create.push(r.create)
        ops.update.push(r.update)
        ops.clear.push(r.clear)
      }

      const animByCount = {}
      for (const count of CONFIG.animCounts) {
        const anims = []
        for (let i = 0; i < CONFIG.animRuns; i++) {
          anims.push(await measureAnim(browser, url, CONFIG.animMs, count))
        }
        animByCount[count] = {
          runs: anims,
          avgFps: mean(anims.map((a) => a.avgFps)),
          p95FrameMs: median(anims.map((a) => a.p95FrameMs)),
          maxFrameMs: median(anims.map((a) => a.maxFrameMs)),
          jankPct: mean(anims.map((a) => a.jankPct))
        }
      }

      // Interaction scenario: 1000 deterministic point queries (pure CPU).
      const hitPage = await browser.newPage()
      await hitPage.goto(url, { waitUntil: 'networkidle0' })
      await hitPage.evaluate((n) => window.__bench.create(n), CONFIG.shapeCount)
      const hasHit = await hitPage.evaluate(() => typeof window.__bench.hitQuery === 'function')
      let hitResult = null
      if (hasHit) {
        const runs = []
        for (let i = 0; i < 5; i++) {
          runs.push(await hitPage.evaluate((n) => window.__bench.hitQuery(n), 1000))
        }
        hitResult = {
          msMedian: median(runs.map((r) => r.ms)),
          hits: runs[0].hits
        }
      }
      await hitPage.close()

      report.targets[target.name] = {
        create: ops.create,
        update: ops.update,
        clear: ops.clear,
        animByCount,
        hitQuery: hitResult,
        summary: {
          createMedian: median(ops.create),
          updateMedian: median(ops.update),
          clearMedian: median(ops.clear),
          createMin: Math.min(...ops.create),
          updateMin: Math.min(...ops.update),
          clearMin: Math.min(...ops.clear),
          anim: Object.fromEntries(
            Object.entries(animByCount).map(([count, a]) => [
              count,
              { avgFps: a.avgFps, p95FrameMs: a.p95FrameMs, jankPct: a.jankPct }
            ])
          )
        }
      }

      const s = report.targets[target.name].summary
      console.log(
        `  create ${s.createMedian.toFixed(2)}ms (min ${s.createMin.toFixed(2)}) | update ${s.updateMedian.toFixed(2)}ms (min ${s.updateMin.toFixed(2)}) | clear ${s.clearMedian.toFixed(2)}ms (min ${s.clearMin.toFixed(2)})`
      )
      for (const [count, a] of Object.entries(s.anim)) {
        console.log(
          `    anim @${count} shapes: ${a.avgFps.toFixed(1)}fps | p95 ${a.p95FrameMs.toFixed(2)}ms | jank ${a.jankPct.toFixed(1)}%`
        )
      }
      if (hitResult) {
        console.log(
          `    hitQuery 1000 pts: ${hitResult.msMedian.toFixed(2)}ms (${hitResult.hits} hits)`
        )
      } else {
        console.log('    hitQuery: n/a (tuning sacrifices built-in hit support)')
      }
    }

    // User agent once, for the record.
    const uaPage = await browser.newPage()
    report.meta.userAgent = await uaPage.evaluate(() => navigator.userAgent)
    await uaPage.close()
  } finally {
    await browser.close()
    await stopServer(child, port)
  }

  // --- Save + print comparison table -----------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = path.join(__dirname, 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `canvas2d-${stamp}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2))
  console.log(`\n📄 saved: ${path.relative(process.cwd(), outFile)}`)

  const nameWidth = Math.max(...TARGETS.map((t) => t.name.length)) + 4

  console.log(`\n=== Results (${CONFIG.opIterations} iterations; median / min-of-N) ===`)
  for (const { medKey, minKey, label } of [
    { medKey: 'createMedian', minKey: 'createMin', label: 'create1000 ms' },
    { medKey: 'updateMedian', minKey: 'updateMin', label: 'update100 ms' },
    { medKey: 'clearMedian', minKey: 'clearMin', label: 'clear ms' }
  ]) {
    console.log(`\n${label}:`)
    const base = report.targets['Vanilla Canvas'].summary[minKey]
    for (const t of TARGETS) {
      const s = report.targets[t.name].summary
      const ratio = s[minKey] / base
      const marker = t.name === 'Vanilla Canvas' ? ' (baseline)' : ''
      console.log(
        `  ${t.name.padEnd(nameWidth)}${s[medKey].toFixed(2).padStart(9)} / ${s[minKey].toFixed(2).padStart(5)}ms   ${ratio.toFixed(2)}× (min)${marker}`
      )
    }
  }
  console.log('\nanimation scale sweep (avg fps / p95 ms / jank% over runs):')
  for (const count of CONFIG.animCounts) {
    console.log(`  ${String(count).padStart(6)} shapes:`)
    for (const t of TARGETS) {
      const a = report.targets[t.name].summary.anim[count]
      if (!a) continue
      console.log(
        `    ${t.name.padEnd(nameWidth)}${a.avgFps.toFixed(1).padStart(8)}fps   ${a.p95FrameMs.toFixed(2).padStart(7)}ms   ${a.jankPct.toFixed(1).padStart(5)}%`
      )
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
