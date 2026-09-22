#!/usr/bin/env node
/* eslint-disable */

/**
 * Per-animation-frame render-pass census for the nikke viewer.
 *
 * Why this exists: the bench pages cannot reproduce the reported flicker, and the
 * viewer differs from them in exactly one respect that runs DURING animation —
 * its pixel-fit readback. The tick loop measures the rendered content bbox and
 * re-fits the camera from it, for a few rounds after every model load:
 *
 *   WebGL    gl.readPixels on the default framebuffer (stalls, but does not draw)
 *   Canvas2D getImageData
 *   WebGPU   renderer.flushAndRead() — which begins a frame against the CANVAS
 *            swapchain texture, draws everything, and submits it
 *
 * That last one renders and submits an EXTRA frame in the middle of an animation
 * tick. If a frame is presented twice per animation frame, whatever the second
 * pass drew is what gets shown — which is the shape of "some frames show extra
 * stuff for a flash".
 *
 * So this counts, per animation frame, how many render passes each backend runs.
 * One clear / one submit per frame is normal; two is the bug.
 *
 * Usage:
 *   node probe-viewer-frames.mjs                # both backends
 *   node probe-viewer-frames.mjs webgpu         # one
 *   node probe-viewer-frames.mjs webgl 1.5      # mode + seconds
 */

import puppeteer from 'puppeteer'

const VIEWER_URL = process.env.VIEWER_URL || 'http://localhost:5191/char/c405'
const SETTINGS_KEY = 'nikke-viewer:settings'

/** Records render events with timestamps, and rAF ticks as frame boundaries. */
function instrumenter(mode) {
  return (m) => {
    try {
      localStorage.setItem('nikke-viewer:settings', JSON.stringify({ bg: '#181820', renderMode: m }))
    } catch {
      /* ignore */
    }
    const w = window
    w.__ev = []
    const push = (k) => {
      if (w.__ev.length < 40000) w.__ev.push({ t: performance.now(), k })
    }
    // Frame boundaries: the viewer's own rAF tick advancing its clock.
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => raf((ts) => { push('raf'); cb(ts) })

    const g = window
    if (g.GPUQueue) {
      const raw = g.GPUQueue.prototype.submit
      g.GPUQueue.prototype.submit = function (...a) { push('gpu.submit'); return raw.apply(this, a) }
    }
    if (g.GPUCanvasContext) {
      const raw = g.GPUCanvasContext.prototype.getCurrentTexture
      g.GPUCanvasContext.prototype.getCurrentTexture = function (...a) { push('gpu.getTexture'); return raw.apply(this, a) }
    }
    if (g.WebGL2RenderingContext) {
      const p = g.WebGL2RenderingContext.prototype
      const rc = p.clear
      p.clear = function (...a) { push('gl.clear'); return rc.apply(this, a) }
      const rd = p.drawElements
      p.drawElements = function (...a) { push('gl.draw'); return rd.apply(this, a) }
      const rp = p.readPixels
      p.readPixels = function (...a) { push('gl.readPixels'); return rp.apply(this, a) }
    }
    return true
  }
}

async function run(browser, mode, seconds) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 900 })
  await page.evaluateOnNewDocument(instrumenter(mode), mode)
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 140)))
  await page.goto(VIEWER_URL, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 20000 })
  // Let the model load and the pixel fit run its rounds; then measure the steady
  // animation, and separately the window right after a model switch.
  await new Promise((r) => setTimeout(r, 4000))

  await page.evaluate(() => { window.__ev = [] })
  await new Promise((r) => setTimeout(r, seconds * 1000))
  const ev = await page.evaluate(() => window.__ev)

  // Group events into animation frames: a 'raf' event opens a frame, everything
  // until the next 'raf' belongs to it.
  const frames = []
  let cur = null
  for (const e of ev) {
    if (e.k === 'raf') {
      if (cur) frames.push(cur)
      cur = { t: e.t, glClear: 0, glDraw: 0, glRead: 0, gpuSubmit: 0, gpuGetTex: 0 }
      continue
    }
    if (!cur) continue
    if (e.k === 'gl.clear') cur.glClear++
    else if (e.k === 'gl.draw') cur.glDraw++
    else if (e.k === 'gl.readPixels') cur.glRead++
    else if (e.k === 'gpu.submit') cur.gpuSubmit++
    else if (e.k === 'gpu.getTexture') cur.gpuGetTex++
  }
  if (cur) frames.push(cur)

  const res = { mode, frames: frames.length, histograms: {} }
  const hist = (key) => {
    const h = {}
    for (const f of frames) {
      const v = f[key]
      h[v] = (h[v] || 0) + 1
    }
    res.histograms[key] = h
  }
  if (mode === 'webgl') { hist('glClear'); hist('glDraw'); hist('glRead') }
  else if (mode === 'webgpu') { hist('gpuSubmit'); hist('gpuGetTex') }
  else { hist('glDraw') }

  res.framesWithExtraPass = frames
    .map((f, i) => ({ i, ...f }))
    .filter((f) =>
      mode === 'webgl' ? f.glClear > 1 : mode === 'webgpu' ? f.gpuSubmit > 1 : false
    )
    .slice(0, 10)
    .map((f) => (mode === 'webgl' ? { i: f.i, clears: f.glClear, draws: f.glDraw, reads: f.glRead } : { i: f.i, submits: f.gpuSubmit, getTex: f.gpuGetTex }))

  await page.close()
  return res
}

async function main() {
  const [modeArg, secArg] = process.argv.slice(2)
  const seconds = Number(secArg || 2.5)
  const modes = modeArg ? [modeArg] : ['webgl', 'webgpu']

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1000, height: 900 },
    args: [
      '--headless=new',
      '--window-size=1000,900',
      '--use-angle=metal',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,Metal',
      '--enable-dawn-features=allow_unsafe_apis'
    ],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  })
  try {
    for (const m of modes) {
      console.log(`\n=== ${m} ===`)
      const r = await run(browser, m, seconds)
      if (!r.frames) {
        console.log('  no animation frames recorded — is the page animating?')
        continue
      }
      console.log(`  animation frames: ${r.frames}`)
      for (const [k, h] of Object.entries(r.histograms)) {
        const parts = Object.entries(h).sort((a, b) => Number(a[0]) - Number(b[0]))
        console.log(`  ${k.padEnd(12)} per-frame histogram: ${parts.map(([v, c]) => `${v}×${c}`).join('  ')}`)
      }
      if (r.framesWithExtraPass.length) {
        console.log(`  ⚠ ${r.framesWithExtraPass.length} frame(s) rendered MORE THAN ONCE:`)
        for (const f of r.framesWithExtraPass) console.log('     ', JSON.stringify(f))
      } else {
        console.log('  ✅ every animation frame ran exactly one render pass')
      }
    }
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
