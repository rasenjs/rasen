#!/usr/bin/env node
/* eslint-disable */

/**
 * Spine rendering benchmark runner.
 *
 * Drives the five target pages (official-webgl / pixi / rasen-webgl /
 * official-canvas / rasen-canvas) through the identical scenario protocol and
 * reports medians + multipliers against the official baseline per group.
 * Browser configuration mirrors the official js-framework-benchmark runner
 * (system Chrome, official args, headless via `--headless=new`, never
 * `--disable-gpu`).
 *
 * Prerequisite: visual variance test (`npm run verify`) must pass first.
 *
 * Usage:
 *   node bench.js                     # headless (default)
 *   node bench.js --no-headless       # headed
 *   node bench.js --count 9           # recorded op iterations (default 9)
 *   node bench.js --anim-runs 3       # animation runs per target (default 3)
 *   node bench.js --instances 1,10,25,50
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CONFIG = {
  opIterations: 9,
  animRuns: 3,
  animMs: 4000,
  poseTicks: 600,
  instanceCounts: [1, 10, 25, 50],
  loadIterations: 7
}

const GROUPS = [
  {
    name: 'WebGL',
    baseline: 'official-webgl',
    targets: [
      { name: 'Official spine-ts', page: 'official-webgl.html' },
      { name: 'pixi-spine', page: 'pixi.html' },
      { name: 'Rasen webgl', page: 'rasen-webgl.html' }
    ]
  },
  {
    name: 'Canvas2D',
    baseline: 'official-canvas',
    targets: [
      { name: 'Official spine-ts', page: 'official-canvas.html' },
      { name: 'Rasen canvas-2d', page: 'rasen-canvas.html' }
    ]
  }
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
CONFIG.loadIterations = numFlag('--load-count', CONFIG.loadIterations)
if (argv.includes('--instances')) {
  const i = argv.indexOf('--instances')
  CONFIG.instanceCounts = argv[i + 1].split(',').map(Number)
}

// --- Browser / server infra (same contract as canvas2d bench) ----------------
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
  '--window-size=1360,1360',
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
    headless: false,
    dumpio: false,
    defaultViewport: { width: 1360, height: 1360 },
    args
  }
  const chromePath = browserExecutablePath()
  if (process.platform === 'linux' || fs.existsSync(chromePath)) {
    options.executablePath = chromePath
  }
  return puppeteer.launch(options)
}

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

// --- Measurement ---------------------------------------------------------------
// One fresh page per iteration (official methodology).
async function measureLoad(browser, url) {
  const page = await browser.newPage()
  await page.goto(url + '?bench=1', { waitUntil: 'networkidle0', timeout: 60000 })
  const r = await page.evaluate(async () => {
    return await Promise.race([
      window.__bench.load(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('load timeout')), 30000))
    ])
  })
  await page.close()
  return r
}

async function measureInstances(browser, url, n) {
  const page = await browser.newPage()
  await page.goto(url + '?bench=1', { waitUntil: 'networkidle0', timeout: 60000 })
  const r = await page.evaluate(async (n) => {
    await window.__bench.load()
    return await Promise.race([
      window.__bench.createInstances(n),
      new Promise((_, rej) => setTimeout(() => rej(new Error('create timeout')), 30000))
    ])
  }, n)
  await page.close()
  return r
}

async function measurePose(browser, url, n, ticks) {
  const page = await browser.newPage()
  await page.goto(url + '?bench=1', { waitUntil: 'networkidle0', timeout: 60000 })
  const r = await page.evaluate(async (n, ticks) => {
    await window.__bench.load()
    if (n > 1) await window.__bench.createInstances(n)
    return await Promise.race([
      window.__bench.poseOnly(ticks),
      new Promise((_, rej) => setTimeout(() => rej(new Error('pose timeout')), 60000))
    ])
  }, n, ticks)
  await page.close()
  return r
}

async function measureAnim(browser, url, n) {
  const page = await browser.newPage()
  await page.goto(url + '?bench=1', { waitUntil: 'networkidle0', timeout: 60000 })
  const r = await page.evaluate(async (n, ms) => {
    await window.__bench.load()
    if (n > 1) await window.__bench.createInstances(n)
    return await Promise.race([
      window.__bench.animate(ms, n),
      new Promise((_, rej) => setTimeout(() => rej(new Error('anim timeout')), ms + 30000))
    ])
  }, n, CONFIG.animMs)
  await page.close()
  return r
}

// --- Main ----------------------------------------------------------------------
async function main() {
  console.log(`Spine benchmark — ${HEADLESS ? 'headless' : 'headed'} mode`)
  console.log(
    `  instances: [${CONFIG.instanceCounts}], ops: ${CONFIG.opIterations} (+1 warmup), anim: ${CONFIG.animRuns} × ${CONFIG.animMs}ms\n`
  )

  const port = await findFreePort()
  const serverUrl = `http://localhost:${port}`
  const child = await startServer(port, '__BENCH_READY__')
  const browser = await launchBrowser()

  const report = {
    meta: {
      date: new Date().toISOString(),
      headless: HEADLESS,
      opIterations: CONFIG.opIterations,
      animRuns: CONFIG.animRuns,
      animMs: CONFIG.animMs,
      poseTicks: CONFIG.poseTicks,
      instanceCounts: CONFIG.instanceCounts,
      userAgent: null
    },
    targets: {}
  }

  try {
    for (const group of GROUPS) {
      for (const target of group.targets) {
        const url = `${serverUrl}/${target.page}`
        console.log(`▶ ${target.name} (${group.name})`)
        const key = `${group.name}/${target.name}`

        // load (fresh page per iteration)
        await measureLoad(browser, url).catch(() => {})
        const loads = []
        for (let i = 0; i < CONFIG.loadIterations; i++) {
          loads.push(await measureLoad(browser, url))
        }

        const res = { load: loads, create: {}, pose: {}, anim: {} }
        for (const n of CONFIG.instanceCounts) {
          // create
          await measureInstances(browser, url, n).catch(() => {})
          const creates = []
          for (let i = 0; i < CONFIG.opIterations; i++) {
            creates.push(await measureInstances(browser, url, n))
          }
          res.create[n] = creates

          // pose-only per frame
          const poses = []
          for (let i = 0; i < 5; i++) {
            poses.push(await measurePose(browser, url, n, CONFIG.poseTicks))
          }
          res.pose[n] = poses

          // animate
          const anims = []
          for (let i = 0; i < CONFIG.animRuns; i++) {
            anims.push(await measureAnim(browser, url, n).catch((e) => {
              console.log(`    [warn] anim@${n} run failed: ${e.message}`)
              return null
            }))
          }
          const ok = anims.filter(Boolean)
          res.anim[n] = ok.length
            ? {
                runs: ok,
                avgFps: mean(ok.map((a) => a.avgFps)),
                p95FrameMs: median(ok.map((a) => a.p95FrameMs)),
                maxFrameMs: median(ok.map((a) => a.maxFrameMs)),
                jankPct: mean(ok.map((a) => a.jankPct))
              }
            : null
        }

        const loadMedian = median(loads)
        console.log(
          `  load ${loadMedian.toFixed(1)}ms (min ${Math.min(...loads).toFixed(1)})`
        )
        for (const n of CONFIG.instanceCounts) {
          const cm = median(res.create[n])
          const pm = median(res.pose[n])
          const a = res.anim[n]
          const animStr = a
            ? `${a.avgFps.toFixed(1)}fps (p95 ${a.p95FrameMs.toFixed(1)}ms, jank ${a.jankPct.toFixed(0)}%)`
            : 'FAILED'
          console.log(
            `    @${String(n).padStart(3)}: create ${cm.toFixed(1)}ms | pose ${pm.toFixed(3)}ms/frame | ${animStr}`
          )
        }

        report.targets[key] = { group: group.name, ...res, summary: {
          loadMedian,
          loadMin: Math.min(...loads)
        } }
      }
    }

    const uaPage = await browser.newPage()
    report.meta.userAgent = await uaPage.evaluate(() => navigator.userAgent)
    await uaPage.close()
  } finally {
    await browser.close()
    await stopServer(child, port)
  }

  // --- Save + comparison table -------------------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = path.join(__dirname, 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `spine-${stamp}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2))
  console.log(`\n📄 saved: ${path.relative(process.cwd(), outFile)}`)

  for (const group of GROUPS) {
    console.log(`\n=== ${group.name} group (baseline: ${group.baseline}) ===`)
    const baselineTarget =
      group.targets.find((t) => t.page === group.baseline + '.html') ??
      group.targets.find((t) => t.name === group.baseline)
    const base = report.targets[`${group.name}/${baselineTarget.name}`]
    console.log(`\nload ms (median):`)
    for (const t of group.targets) {
      const s = report.targets[`${group.name}/${t.name}`]
      const ratio = s.summary.loadMedian / base.summary.loadMedian
      console.log(
        `  ${t.name.padEnd(20)}${s.summary.loadMedian.toFixed(1).padStart(9)}ms  ${ratio.toFixed(2)}×${t.name === group.baseline ? ' (baseline)' : ''}`
      )
    }
    console.log(`\nanimation fps (avg of ${CONFIG.animRuns} runs):`)
    for (const n of CONFIG.instanceCounts) {
      console.log(`  ${String(n).padStart(3)} instances:`)
      for (const t of group.targets) {
        const a = report.targets[`${group.name}/${t.name}`].anim[n]
        const baseA = base.anim[n]
        const fpsRatio = baseA.avgFps / a.avgFps
        console.log(
          `    ${t.name.padEnd(20)}${a.avgFps.toFixed(1).padStart(8)}fps  p95 ${a.p95FrameMs.toFixed(2).padStart(7)}ms  jank ${a.jankPct.toFixed(1).padStart(5)}%  ${fpsRatio.toFixed(2)}× slower${t.name === group.baseline ? ' (baseline)' : ''}`
        )
      }
    }
    console.log(`\npose-only solve (ms/frame, median of 5):`)
    for (const n of CONFIG.instanceCounts) {
      console.log(`  ${String(n).padStart(3)} instances:`)
      for (const t of group.targets) {
        const p = median(report.targets[`${group.name}/${t.name}`].pose[n])
        const bp = median(base.pose[n])
        console.log(
          `    ${t.name.padEnd(20)}${p.toFixed(3).padStart(8)}ms  ${(p / bp).toFixed(2)}×${t.name === group.baseline ? ' (baseline)' : ''}`
        )
      }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
