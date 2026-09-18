/**
 * CPU profile of the Rasen spine frame loop, per backend.
 *
 * The N=400 comparison shows both Rasen backends ~1.3x the official page on the
 * render side (frame - pose), and the gap is nearly identical for WebGL and
 * WebGPU. That points away from the GPU backends and at whatever both of them
 * share: the reactive component that rebuilds the mesh each tick.
 *
 * This profiles only the `animate` phase (after load/create/warm-up) and prints
 * the top self-time functions, so a hotspot shows up as its own name rather than
 * as "somewhere in the frame".
 *
 * Usage: node profile-frame-cpu.mjs [instances] [page]
 *   page defaults to rasen-webgl.html; pass rasen-webgpu.html to compare.
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

const N = Number(process.argv[2] || 400)
const PAGE = process.argv[3] || 'rasen-webgl.html'
const PORT = Number(process.env.PORT || 5191)
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const args = [
  '--headless=new',
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,Metal',
  '--enable-dawn-features=allow_unsafe_apis',
  '--use-angle=metal'
]
const opts = { args, defaultViewport: { width: 1100, height: 1100 } }
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
  await page.goto(`http://localhost:${PORT}/${PAGE}?bench=1`, {
    waitUntil: 'networkidle0',
    timeout: 60000
  })
  await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })
  await page.evaluate(() => window.__bench.load())
  await page.evaluate((n) => window.__bench.createInstances(n), N)
  // Warm up: JIT, pipeline/program compile, texture upload. Profiling these
  // would drown the steady-state loop in one-off costs.
  await page.evaluate((n) => window.__bench.animate(1500, n), N)

  const cdp = await page.createCDPSession()
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
  await cdp.send('Profiler.start')
  const anim = await page.evaluate((n) => window.__bench.animate(3000, n), N)
  const { profile } = await cdp.send('Profiler.stop')
  await cdp.send('Profiler.disable')

  // Self time per node: count a sample for the node that owns it, not its
  // ancestors (otherwise everything blames the rAF callback).
  const nodeById = new Map(profile.nodes.map((n) => [n.id, n]))
  const self = new Map()
  const total = profile.samples.length
  for (const id of profile.samples) {
    const n = nodeById.get(id)
    if (!n) continue
    const f = n.callFrame
    const name = f.functionName || '(anonymous)'
    const file = (f.url || '').split('/').pop() || 'native'
    const key = `${name} @ ${file}:${f.lineNumber + 1}`
    self.set(key, (self.get(key) || 0) + 1)
  }
  const sorted = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)
  const frames = anim.frames || Math.round(3000 / anim.avgFrameMs)
  const msPerSample = (anim.avgFrameMs * frames) / total

  console.log(`\n=== ${PAGE}  N=${N}  frames=${frames}  avgFrame=${anim.avgFrameMs.toFixed(2)}ms ===`)
  console.log(`samples=${total}  ~${msPerSample.toFixed(3)}ms per sample`)
  console.log('self%  ms/frame  function')
  for (const [k, c] of sorted) {
    const pct = (c / total) * 100
    const msPerFrame = (c / frames) * msPerSample
    console.log(`${pct.toFixed(1).padStart(5)}%  ${msPerFrame.toFixed(3).padStart(8)}  ${k}`)
  }
} finally {
  await browser.close()
  server?.kill()
}
