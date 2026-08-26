#!/usr/bin/env node
/* eslint-disable */

/**
 * End-to-end op latency via Chrome Tracing (devtools.timeline).
 *
 * The main bench.js protocol measures JS-side cost (mutation + the library's
 * draw-command recording), deliberately excluding rasterization — justified
 * because the scene is pixel-identical across targets, making raster a shared
 * constant. This runner answers the complementary question: how long until
 * the pixels are ACTUALLY produced? It anchors each op with a user-timing
 * mark (same clock as the trace) and reports:
 *   - jsMs          mutation duration from the page (reference)
 *   - paintMs       op end → end of the first devtools.timeline `Paint` event
 *                   (the official webdriver-ts anchoring approach)
 *   - rasterSettle  op end → last `RasterTask` end within a 66ms window
 *                   (approximate full raster settle for that frame)
 *
 * Usage: node bench-trace.mjs [--count N] [--iters N]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)
function numFlag(name, fallback) {
  const i = argv.indexOf(name)
  return i >= 0 ? Number(argv[i + 1]) : fallback
}
const SHAPE_COUNT = numFlag('--count', 1000)
const ITERS = numFlag('--iters', 5)

const TARGETS = [
  { name: 'Vanilla Canvas', page: 'vanilla.html' },
  { name: 'Konva', page: 'konva.html' },
  { name: 'Konva (tuned)', page: 'konva-fast.html' },
  { name: 'Fabric', page: 'fabric.html' },
  { name: 'Fabric (tuned)', page: 'fabric-fast.html' },
  { name: 'Rasen canvas-2d', page: 'rasen.html' }
]

// --- infra (same contract as bench.js) ---------------------------------------
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
    child.stdout.on('data', (d) => {
      if (!resolved && d.toString().includes(signal)) {
        resolved = true
        resolve(child)
      }
    })
    child.stderr.on('data', () => {})
    setTimeout(() => {
      if (!resolved) reject(new Error('server timeout'))
    }, 45000)
  })
}

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

async function launchBrowser() {
  const options = {
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--headless=new', '--window-size=1280,800', '--no-first-run']
  }
  const chromePath = browserExecutablePath()
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return NaN
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// --- trace analysis ------------------------------------------------------------
/**
 * Extract per-op latencies from a flat array of trace events.
 * The page emits exactly one `rasen_bench_op_end` user-timing mark per op.
 *
 * Anchor choice (verified empirically via diag-trace.mjs): canvas content
 * updates do NOT go through Blink's paint pipeline — the `Paint` event only
 * appears on initial page load. The honest "pixels are on screen" anchor for
 * canvas frames is the compositor's `AnimationFrame::Presentation` (ph=n)
 * notification, with the `AnimationFrame` async-slice finish (ph=f) as fallback.
 */
function analyzeTrace(events) {
  const marks = events.filter((e) => e.name === 'rasen_bench_op_end')
  if (!marks.length) return null
  // Last mark in this trace (one op per trace).
  const mark = marks[marks.length - 1]
  const t0 = mark.ts // microseconds

  let presentUs = null
  let frameFinishUs = null
  for (const e of events) {
    if (!e.cat || !String(e.cat).includes('devtools.timeline')) continue
    if (e.name === 'AnimationFrame::Presentation' && e.ph === 'n') {
      if (e.ts >= t0 && (presentUs === null || e.ts < presentUs)) presentUs = e.ts
    }
    if (e.name === 'AnimationFrame' && e.ph === 'f') {
      // ph='f' — ts IS the finish timestamp of the async frame slice.
      if (e.ts >= t0 && (frameFinishUs === null || e.ts < frameFinishUs)) {
        frameFinishUs = e.ts
      }
    }
  }

  return {
    presentMs: presentUs === null ? NaN : (presentUs - t0) / 1000,
    frameFinishMs: frameFinishUs === null ? NaN : (frameFinishUs - t0) / 1000
  }
}

// --- main ----------------------------------------------------------------------
async function main() {
  console.log(`E2E op latency via Chrome Trace — ${SHAPE_COUNT} shapes × ${ITERS} iters/target\n`)

  const port = await findFreePort()
  const serverUrl = `http://localhost:${port}`
  const server = await startServer(port, '__BENCH_READY__')
  const browser = await launchBrowser()

  const report = { meta: { date: new Date().toISOString(), shapeCount: SHAPE_COUNT, iters: ITERS }, targets: {} }

  try {
    for (const target of TARGETS) {
      process.stdout.write(`▶ ${target.name} `)
      const page = await browser.newPage()
      await page.goto(`${serverUrl}/${target.page}`, { waitUntil: 'networkidle0' })

      // Warmup (untraced): build + tear down once.
      await page.evaluate(async (n) => {
        const b = window.__bench
        await b.create(n)
        await b.clear()
      }, SHAPE_COUNT)

      const samples = { create: [], update: [], clear: [] }
      const cdp = await page.createCDPSession()
      for (let i = 0; i < ITERS; i++) {
        for (const op of ['create', 'update', 'clear']) {
          // Collect trace events via CDP directly — no opaque buffer formats.
          const chunks = []
          const onData = (e) => chunks.push(...e.value)
          cdp.on('Tracing.dataCollected', onData)
          const complete = new Promise((res) => cdp.once('Tracing.tracingComplete', res))
          await cdp.send('Tracing.start', {
            traceConfig: {
              includedCategories: ['devtools.timeline', 'blink.user_timing']
            }
          })
          const jsMs = await page.evaluate(async (n, operation) => {
            const b = window.__bench
            performance.mark('rasen_bench_op_start')
            let v
            if (operation === 'create') v = await b.create(n)
            else if (operation === 'update') v = await b.updateEvery10th()
            else v = await b.clear()
            performance.mark('rasen_bench_op_end')
            return v
          }, SHAPE_COUNT, op)
          await new Promise((r) => setTimeout(r, 250))
          await cdp.send('Tracing.end')
          await complete
          cdp.off('Tracing.dataCollected', onData)

          const parsed = analyzeTrace(chunks)
          if (process.env.TRACE_DEBUG) {
            const mk = chunks.filter((e) => e.name === 'rasen_bench_op_end').length
            const pt = chunks.filter((e) => e.name === 'Paint').length
            console.log(`    [dbg] ${target.name}/${op}: chunks=${chunks.length} marks=${mk} paints=${pt} parsed=${JSON.stringify(parsed)}`)
          }
          if (!parsed) {
            console.warn(`\n  [warn] no op-end mark found in trace (${target.name}/${op})`)
            continue
          }
          samples[op].push({ jsMs, ...parsed })
        }
        process.stdout.write('.')
      }
      process.stdout.write('\n')

      const summary = {}
      for (const op of ['create', 'update', 'clear']) {
        summary[op] = {
          jsMedian: median(samples[op].map((s) => s.jsMs)),
          presentMedian: median(samples[op].map((s) => s.presentMs)),
          frameFinishMedian: median(samples[op].map((s) => s.frameFinishMs)),
          presentMissing: samples[op].filter((s) => !Number.isFinite(s.presentMs)).length
        }
      }
      report.targets[target.name] = { summary, samples }

      for (const op of ['create', 'update', 'clear']) {
        const s = summary[op]
        const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : 'n/a')
        console.log(
          `  ${op.padEnd(7)} js ${fmt(s.jsMedian)}ms | on-screen ${fmt(s.presentMedian)}ms | frame-finish ${fmt(s.frameFinishMedian)}ms${s.presentMissing ? ` (${s.presentMissing} missing)` : ''}`
        )
      }
      await page.close()
    }
  } finally {
    await browser.close()
    try {
      server.kill('SIGKILL')
    } catch {}
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true })
  const outFile = path.join(__dirname, 'reports', `canvas2d-trace-${stamp}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2))
  console.log(`\n📄 saved: ${path.relative(process.cwd(), outFile)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
