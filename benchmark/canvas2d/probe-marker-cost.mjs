/**
 * Frame-time probe for the real canvas-2d `each` scene.
 *
 * Companion to probe-marker-walk.mjs. That one showed the walk structure in
 * isolation; this one measures the actual library on the actual benchmark page,
 * because a canvas-2d frame is dominated by whatever the real components do in
 * `drawSelf` and the marker cost only matters as a share of that.
 *
 * It exists to be run twice — before and after a walk change — so an edit to the
 * traversal is judged on the scene it is meant to help rather than on a
 * microbenchmark that may not represent it.
 *
 * Usage:
 *   node probe-marker-cost.mjs                          # single size (1000)
 *   SWEEP=1000,4000,8000,16000 node probe-marker-cost.mjs  # find the ceiling
 *   PORT=5196 SWEEP=20000 node probe-marker-cost.mjs
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

const N = Number(process.argv[2] || 1000)
const TAG = process.argv[3] || 'run'
/** One 60Hz frame. A frame at or barely above this was capped by the display, so
 *  its renderer cost cannot be read off it — see the sweep note below. */
const VSYNC_MS = 16.7
/**
 * An N sweep is the point of this probe, not a nicety.
 *
 * The first run measured 16.67ms at both N=1000 and N=4000, which says nothing
 * about the renderer: 16.67ms is one vsync interval, so the scene was simply
 * capped by rAF and the renderer could have had 15ms of headroom or 0.1ms. A
 * single N therefore cannot answer "is canvas-2d CPU-bound?". Sweeping until the
 * frame time leaves the ceiling can: that is where the per-row cost becomes
 * observable, and it is the only regime where a per-row optimisation (like
 * skipping structural markers in the walk) could possibly matter.
 */
const SWEEP = (process.env.SWEEP || String(N))
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
const PORT = Number(process.env.PORT || 5195)
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const opts = {
  args: ['--headless=new', '--use-angle=metal'],
  defaultViewport: { width: 1100, height: 1100 }
}
if (fs.existsSync(chrome)) opts.executablePath = chrome

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/index.html`)
      if (r.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server not ready')
}

let server
try {
  await waitReady()
} catch {
  server = spawn('node', ['../scripts/start-server.mjs'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  })
  await waitReady()
}

const browser = await puppeteer.launch(opts)
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1024, height: 1024 })
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)))
  await page.goto(`http://localhost:${PORT}/rasen.html?bench=1`, {
    waitUntil: 'networkidle0',
    timeout: 60000
  })
  await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })

  const rows = []
  for (const n of SWEEP) {
    // animate() re-creates the scene itself, so each N measures a fresh list
    // rather than a second round on top of the previous one.
    const anim = await page.evaluate((count) => window.__bench.animate(3000, count), n)
    // 16.7ms is the 60Hz rAF interval: a frame at (or just above) it was capped
    // by the display, so its renderer cost is unmeasured from above.
    const capped = anim.avgFrameMs <= 17.2
    rows.push({ n, anim, capped })
    console.log(
      `[${TAG}] N=${String(n).padStart(5)} avgFrame=${anim.avgFrameMs.toFixed(2)}ms ` +
        `p95=${anim.p95FrameMs.toFixed(1)}ms fps=${anim.avgFps.toFixed(1)} ` +
        (capped ? 'frame capped by rAF (cost unmeasured)' : 'past vsync — CPU-bound, cost visible')
    )
  }

  const uncapped = rows.filter((r) => !r.capped)
  const cappedRows = rows.filter((r) => r.capped)
  if (uncapped.length === 0) {
    console.log(
      `\nEvery size up to N=${Math.max(...rows.map((r) => r.n))} held the rAF ` +
        `interval, so the renderer has unused headroom there and per-row walk cost ` +
        `is not the binding constraint. Raise SWEEP to find where that stops being ` +
        `true.`
    )
  } else {
    const first = uncapped[0]
    const lastCapped = cappedRows[cappedRows.length - 1]
    if (lastCapped) {
      // frame(N) ~= base + c*N, and the last capped size proves the frame there
      // was <= VSYNC. So the slope from (lastCapped, VSYNC) to the first uncapped
      // point is a LOWER bound on the true per-row cost: the capped frame may
      // have been well under VSYNC, which only makes the real slope steeper.
      const lowerUs =
        ((first.anim.avgFrameMs - VSYNC_MS) / (first.n - lastCapped.n)) * 1000
      console.log(
        `\nceiling is between N=${lastCapped.n} (still <= ${VSYNC_MS}ms) and ` +
          `N=${first.n} (${first.anim.avgFrameMs.toFixed(2)}ms)`
      )
      console.log(`per-row cost is at least ${lowerUs.toFixed(2)} us/row`)
    }
    if (uncapped.length >= 2) {
      // Two points both past the ceiling, so this is a real slope, not a bound.
      const [a, b] = uncapped.slice(-2)
      const perRowUs =
        ((b.anim.avgFrameMs - a.anim.avgFrameMs) / (b.n - a.n)) * 1000
      console.log(
        `marginal cost per row past the ceiling: ${perRowUs.toFixed(2)} us/row ` +
          `(from N=${a.n} and N=${b.n})`
      )
    }
    console.log(
      `a marker visit is a property load plus an empty call, so skipping markers ` +
        `would shave a fraction of that per row.`
    )
  }

  fs.writeFileSync(
    `reports/marker-cost-${TAG}.json`,
    JSON.stringify({ tag: TAG, sweep: SWEEP, rows }, null, 2)
  )
} finally {
  await browser.close()
  server?.kill()
}
