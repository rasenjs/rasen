/**
 * Drag frame-time measurement for the nikke-viewer (GL vs GPU).
 *
 * Loads the viewer with the FB pose loaded, then dispatches high-frequency
 * pointer drags via CDP Input.dispatchMouseEvent (device-rate events, like a
 * real trackpad) while sampling rAF frame durations for ~6 seconds.
 *
 * Run: node drag-bench.mjs [gl|gpu]   (defaults to both)
 * Requires the preview server on :4399.
 */
import puppeteer from 'puppeteer'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const mode = process.argv[2] ?? 'both'

async function launch() {
  const args = [
    '--headless=new',
    '--window-size=1280,800',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,Metal',
    '--enable-dawn-features=allow_unsafe_apis',
    '--use-angle=metal',
  ]
  const options = { args, defaultViewport: { width: 1280, height: 800 } }
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}
import fs from 'node:fs'

async function measure(browser, rendererMode) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 200)))

  // Seed settings so the page boots directly in the requested mode.
  await page.goto('http://localhost:4399/char/c810/pose/fb', { waitUntil: 'domcontentloaded' })
  await page.evaluate((m) => {
    localStorage.setItem('nikke-viewer:settings', JSON.stringify({ bg: '#0b1020', renderMode: m, showBones: false }))
  }, rendererMode)
  await page.reload({ waitUntil: 'domcontentloaded' })
  // Wait for the model + atlas to load and the pixel fit to converge.
  await new Promise((r) => setTimeout(r, 10000))

  // Instrument rAF durations for 6s while dragging.
  await page.evaluate(() => {
    window.__frames = []
    const orig = window.requestAnimationFrame.bind(window)
    let last = performance.now()
    const cb = (now) => {
      window.__frames.push(now - last)
      last = now
      if (window.__frames.length < 400) orig(cb)
    }
    orig(cb)
  })

  // Find the canvas and drag it around with device-rate events.
  const box = await (await page.$('canvas')).boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const client = await page.target().createCDPSession()
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 })
  let t = 0
  const drag = async () => {
    for (let i = 0; i < 360; i++) {
      t += 1
      const x = cx + Math.sin(t / 18) * 200
      const y = cy + Math.cos(t / 14) * 120
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      if (i % 12 === 0) await new Promise((r) => setTimeout(r, 4))
    }
  }
  await drag()
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 })
  await new Promise((r) => setTimeout(r, 500))

  const frames = await page.evaluate(() => window.__frames.slice(2))
  frames.sort((a, b) => a - b)
  const p = (q) => frames[Math.floor(frames.length * q)]
  const jank = (frames.filter((f) => f > 20).length / frames.length) * 100
  const stats = {
    n: frames.length,
    p50: +p(0.5).toFixed(1),
    p95: +p(0.95).toFixed(1),
    p99: +p(0.99).toFixed(1),
    max: +frames[frames.length - 1].toFixed(1),
    jankPct: +jank.toFixed(1),
  }
  await page.close()
  return stats
}

const browser = await launch()
const modes = mode === 'both' ? ['webgl', 'webgpu'] : [mode]
for (const m of modes) {
  const stats = await measure(browser, m)
  console.log(`[${m}]`, JSON.stringify(stats))
}
await browser.close()
