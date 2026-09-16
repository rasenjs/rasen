/* eslint-disable */
/**
 * Focused probe: why does the viewer's WebGPU pixel fit never land?
 *
 * `app-777.mjs` only prints the first three console errors, and the app's own
 * missing-asset 404s fill those slots — so a readback failure inside
 * `refineFitFromPixels` would be invisible there. This probe dumps EVERY
 * console message and page error for the WebGPU route.
 *
 * Usage: node probe-webgpu-fit.mjs
 */
import puppeteer from 'puppeteer'
import { spawn } from 'node:child_process'

const ROOT = '/Users/wuhaofeng/Projects/@rasen/examples/nikke-viewer'
const PORT = Number(process.env.PORT || 5194)

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe']
})
await new Promise((resolve, reject) => {
  const deadline = Date.now() + 90000
  const poll = async () => {
    if (Date.now() > deadline) return reject(new Error('vite never answered'))
    try {
      const r = await fetch(`http://localhost:${PORT}/index.html`, { method: 'HEAD' })
      if (r.status < 500) return resolve()
    } catch {}
    setTimeout(poll, 400)
  }
  setTimeout(poll, 800)
})

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({
  headless: false,
  defaultViewport: { width: 1500, height: 1000 },
  args: ['--headless=new', '--window-size=1500,1000', '--no-first-run',
    '--enable-unsafe-webgpu', '--enable-features=Vulkan,Metal',
    '--enable-dawn-features=allow_unsafe_apis', '--use-angle=metal'],
  executablePath: chromePath
})

try {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem(
        'nikke-viewer:settings',
        JSON.stringify({ renderMode: 'webgpu', bg: '#0b1020', showBones: false })
      )
    } catch {}
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
    window.cancelAnimationFrame = (id) => clearTimeout(id)
  })
  const messages = []
  page.on('console', (m) => messages.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => messages.push(`[pageerror] ${String(e)}`))

  await page.goto(`http://localhost:${PORT}/char/777`, { waitUntil: 'networkidle0', timeout: 90000 })
  await new Promise((r) => setTimeout(r, 14000))

  const fit = await page.evaluate(() =>
    typeof window.__nikkeFitState === 'function' ? window.__nikkeFitState() : null
  )
  const gpuErr = await page.evaluate(() => window.__gpuValidationError ?? null)

  console.log('--- console messages ---')
  const noise = /404|Failed to load resource/
  for (const m of messages) {
    if (!noise.test(m)) console.log(' ', m)
  }
  console.log(`(${messages.filter((m) => noise.test(m)).length} resource-404 messages hidden)`)
  console.log('\n--- fit state ---')
  console.log('renderMode   :', fit?.renderMode)
  console.log('fitScale     :', fit?.fitScale)
  console.log('pendingPixelFit:', fit?.pendingPixelFit)
  console.log('fitStats     :', JSON.stringify(fit?.fitStats))
  console.log('\n--- webgpu validation error ---')
  console.log(gpuErr || '(none reported)')
} finally {
  await browser.close()
  server.kill('SIGTERM')
}
