/**
 * N=200 three-way comparison with the bench protocol, one anim run:
 *   official-webgl vs rasen-webgl vs rasen-webgpu
 * Usage: node compare-200.mjs
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'

/** Instance count. Overridable so a run can be pushed past the rAF ceiling:
 * at N<=200 both backends sit near vsync and the absolute frame times stop
 * being comparable to the official page's. */
const N = Number(process.env.N || process.argv[2] || 200)
const PAGES = [
  ['Official webgl', 'official-webgl.html'],
  ['Rasen webgl', 'rasen-webgl.html'],
  ['Rasen webgpu', 'rasen-webgpu.html'],
]
const args = ['--headless=new', '--enable-unsafe-webgpu', '--enable-features=Vulkan,Metal', '--enable-dawn-features=allow_unsafe_apis', '--use-angle=metal']
const opts = { args, defaultViewport: { width: 1100, height: 1100 } }
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (fs.existsSync(chrome)) opts.executablePath = chrome

async function waitReady(port) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://localhost:${port}/index.html`); if (r.ok) return } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server not ready')
}

const { spawn } = await import('node:child_process')
const port = 5179
let server
try { await waitReady(port) } catch {
  server = spawn('node', ['../scripts/start-server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })
  await waitReady(port)
}

const browser = await puppeteer.launch(opts)
const out = {}
try {
  for (const [name, page0] of PAGES) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1024, height: 1024 })
    try {
      await page.goto(`http://localhost:${port}/${page0}?bench=1`, { waitUntil: 'networkidle0', timeout: 60000 })
      await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })
      await page.evaluate(() => window.__bench.load())
      const createMs = await page.evaluate((n) => window.__bench.createInstances(n), N)
      const pose = await page.evaluate(async () => {
        const samples = []
        for (let s = 0; s < 5; s++) samples.push(await window.__bench.poseOnly(60))
        samples.sort((a, b) => a - b)
        return samples[2]
      })
      const anim = await page.evaluate((dur, n) => window.__bench.animate(dur, n), 4000, N)
      out[name] = { createMs, pose, anim }
      console.log(`[${name}] create=${createMs.toFixed(0)}ms pose=${pose.toFixed(3)}ms/frame fps=${anim.avgFps.toFixed(1)} p95=${anim.p95FrameMs.toFixed(1)}ms jank=${anim.jankPct.toFixed(0)}%`)
    } catch (e) {
      console.log(`[${name}] FAILED: ${String(e).slice(0, 120)}`)
      out[name] = { error: String(e).slice(0, 200) }
    }
    await page.close()
  }
} finally {
  await browser.close()
  server?.kill()
}
const outFile = `reports/compare-${N}.json`
fs.writeFileSync(outFile, JSON.stringify({ N, out }, null, 2))
console.log(`saved ${outFile}`)
