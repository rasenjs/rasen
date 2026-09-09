/* eslint-disable */
/**
 * Profile the rasen-webgl spine page at N instances: per-frame GL call counts,
 * bytes uploaded, and wall-clock frame time. Usage: node profile-spine.mjs [n]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)

function launchBrowser() {
  const args = ['--headless=new', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  if (process.env.FORCE_GL1) args.push('--disable-webgl2')
  const options = { args }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

async function waitReady(port, signalFile, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/rasen-webgl.html`)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server not ready')
}

async function main() {
  // reuse the static server on 5179 if up, else start one
  let server
  let port = 5179
  try {
    await waitReady(port, null, 2000)
  } catch {
    const { spawn } = await import('node:child_process')
    server = spawn('node', ['../scripts/start-server.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: 'ignore'
    })
    await waitReady(port, null, 20000)
  }

  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1024, height: 1024 })
    await page.evaluateOnNewDocument(() => {
      window.__stats = { calls: {}, bytes: 0, frameTimes: [] }
      const origGet = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const ctx = origGet.apply(this, args)
        if (ctx && !ctx.__wrapped) {
          ctx.__wrapped = true
          const proto = Object.getPrototypeOf(ctx)
          for (const name of ['drawArrays', 'bufferSubData', 'bufferData', 'bindVertexArray', 'useProgram']) {
            const orig = proto[name]
            proto[name] = function (...a) {
              window.__stats.calls[name] = (window.__stats.calls[name] || 0) + 1
              if (name === 'bufferSubData' || name === 'bufferData') {
                const d = a[2] ?? a[1]
                if (d && d.byteLength !== undefined) window.__stats.bytes += d.byteLength
              }
              return orig.apply(this, a)
            }
          }
        }
        return ctx
      }
    })
    await page.goto(`http://localhost:${port}/rasen-webgl.html?bench=1`, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })

    const loadMs = await page.evaluate(() => window.__bench.load())
    await page.evaluate((n) => window.__bench.createInstances(n), N)

    // reset stats, then run the anim for 3s and collect
    await page.evaluate(() => {
      window.__stats.calls = {}
      window.__stats.bytes = 0
      window.__stats.frameTimes = []
      window.__lastT = 0
    })
    // drive frames manually with deterministic stepping, measuring wall time
    const result = await page.evaluate(async (n) => {
      const api = window.__bench
      const stats = window.__stats
      // run the anim loop for ~3s via the page's own measureAnimation? It's
      // internal — instead tick manually: pose + one paint per iteration.
      const t0 = performance.now()
      let frames = 0
      while (performance.now() - t0 < 3000) {
        const f0 = performance.now()
        // one deterministic tick + paint (same as debugStep(1))
        await api.debugStep(1)
        const f1 = performance.now()
        stats.frameTimes.push(f1 - f0)
        frames++
      }
      return { frames, wallMs: performance.now() - t0 }
    }, N)

    const stats = await page.evaluate(() => window.__stats)
    const ft = stats.frameTimes.slice().sort((a, b) => a - b)
    const med = ft[Math.floor(ft.length / 2)]
    const p95 = ft[Math.floor(ft.length * 0.95)]
    console.log(`instances=${N} frames=${result.frames} wall=${result.wallMs.toFixed(0)}ms`)
    console.log(`frame ms: median=${med.toFixed(1)} p95=${p95.toFixed(1)} avg=${(result.wallMs / result.frames).toFixed(1)}`)
    console.log('GL calls per 3s:', JSON.stringify(stats.calls))
    console.log(`bytes uploaded: ${(stats.bytes / 1e6).toFixed(1)}MB → ${(stats.bytes / result.frames / 1e6).toFixed(2)}MB/frame`)
    const perFrame = Object.fromEntries(Object.entries(stats.calls).map(([k, v]) => [k, (v / result.frames).toFixed(1)]))
    console.log('per frame:', JSON.stringify(perFrame))
  } finally {
    await browser.close()
    server?.kill()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
