/* eslint-disable */
/**
 * 777 renderer comparison driven through the VIEWER APP itself.
 *
 * Rationale: the app is the thing the report is about, and it already frames all
 * three backends from one shared `fitBounds` (see `updateCamera` in viewer.tsx for
 * the derivation). Driving the app therefore removes any chance that a difference
 * is an artifact of a hand-built comparison page — which is exactly what went
 * wrong with the first two attempts at this measurement.
 *
 * Each mode is loaded in a fresh page with the renderer chosen via the app's own
 * persisted setting, the same route, and a settle period long enough for the
 * iterative pixel-fit to converge.
 *
 * Usage: node app-777.mjs
 */
import puppeteer from 'puppeteer'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const ROOT = '/Users/wuhaofeng/Projects/@rasen/examples/nikke-viewer'
const PORT = 5193
const OUT = path.join(ROOT, 'reports-777')
const ROUTE = '/char/777'
const SETTLE_MS = 12000
const TOL = 8

function startDevServer() {
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return new Promise((resolve, reject) => {
    let settled = false
    let log = ''
    child.stdout.on('data', (b) => { log += String(b) })
    child.stderr.on('data', (b) => { log += String(b) })
    child.on('exit', (c) => {
      if (!settled) { settled = true; reject(new Error('vite exited ' + c + '\n' + log)) }
    })
    const deadline = Date.now() + 90000
    const poll = async () => {
      if (settled) return
      if (Date.now() > deadline) {
        settled = true
        reject(new Error('vite never answered\n' + log))
        return
      }
      try {
        const r = await fetch('http://localhost:' + PORT + '/index.html', { method: 'HEAD' })
        if (r.status < 500) { settled = true; resolve(child); return }
      } catch (_e) { /* not up */ }
      setTimeout(poll, 400)
    }
    setTimeout(poll, 800)
  })
}

function statsOf(png) {
  const { width, height, data } = png
  const at = (x, y) => {
    const i = (y * width + x) * 4
    return [data[i], data[i + 1], data[i + 2], data[i + 3]]
  }
  const bg = at(0, 0)
  let hit = 0
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
  const G = 20
  const grid = new Array(G * G).fill(0)
  const cell = new Array(G * G).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = at(x, y)
      const d = Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2])
      const gi = Math.min(G - 1, Math.floor((y / height) * G)) * G +
        Math.min(G - 1, Math.floor((x / width) * G))
      cell[gi]++
      if (d > TOL) {
        hit++
        grid[gi]++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  for (let i = 0; i < grid.length; i++) grid[i] = cell[i] ? grid[i] / cell[i] : 0
  return { bg, hit, pct: (hit / (width * height)) * 100, bbox: hit ? [minX, minY, maxX, maxY] : null, grid }
}

function map(A, B) {
  const G = 20
  const lines = []
  for (let gy = 0; gy < G; gy++) {
    let row = ''
    for (let gx = 0; gx < G; gx++) {
      const i = gy * G + gx
      const a = A.grid[i] > 0.08
      const b = B.grid[i] > 0.08
      row += a && b ? '#' : a && !b ? 'C' : !a && b ? 'W' : '.'
    }
    lines.push(String(gy).padStart(2) + ' ' + row)
  }
  return lines.join('\n')
}

async function capture(browser, port, mode) {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(
    (m) => {
      try {
        localStorage.setItem('nikke-viewer:settings', JSON.stringify({ renderMode: m, bg: '#0b1020', showBones: false }))
      } catch (_e) { /* ignore */ }
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
      window.cancelAnimationFrame = (id) => clearTimeout(id)
    },
    mode
  )
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.goto(`http://localhost:${port}${ROUTE}`, { waitUntil: 'networkidle0', timeout: 90000 })
  await new Promise((r) => setTimeout(r, SETTLE_MS))
  const file = path.join(OUT, `app-777-${mode}.png`)
  const el = await page.$('#app canvas')
  if (!el) throw new Error('no canvas for mode ' + mode)
  await el.screenshot({ path: file })
  // Read back in-page: a screenshot goes through the compositor, so a
  // transparent canvas is indistinguishable from an empty one.
  const report = await page.evaluate(() => {
    const cv = document.querySelector('#app canvas')
    if (!cv) return null
    const gl = cv.getContext('webgl2') ?? cv.getContext('webgl')
    if (gl) {
      const px = new Uint8Array(cv.width * cv.height * 4)
      gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, px)
      let opaque = 0, rgb = 0
      for (let p = 0; p < px.length; p += 4) {
        if (px[p + 3] > 8) opaque++
        if (px[p] > 8 || px[p + 1] > 8 || px[p + 2] > 8) rgb++
      }
      return { kind: 'webgl', w: cv.width, h: cv.height, opaque, rgb, total: cv.width * cv.height }
    }
    const c2 = cv.getContext('2d')
    if (!c2) return { kind: 'unknown', w: cv.width, h: cv.height }
    const d = c2.getImageData(0, 0, cv.width, cv.height).data
    let opaque = 0, rgb = 0
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] > 8) opaque++
      if (d[p] > 8 || d[p + 1] > 8 || d[p + 2] > 8) rgb++
    }
    return { kind: 'canvas2d', w: cv.width, h: cv.height, opaque, rgb, total: cv.width * cv.height }
  })
  const fit = await page.evaluate(() =>
    typeof window.__nikkeFitState === 'function' ? window.__nikkeFitState() : null
  )
  // gfx submission counters (temporary diagnostics in the spine component).
  const diag = await page.evaluate(() => window.__spineDiag ?? null)
  await page.close()
  return { file, errors, report, fit, diag }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const server = await startDevServer()
  const chromePath =
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1500, height: 1000 },
    // WebGPU needs these flags or `navigator.gpu` is not even defined in
    // headless Chrome — without them the app's own availability probe fails and
    // it silently switches to WebGL, so the "webgpu" run would just re-measure
    // WebGL. Mirrors benchmark/gfx/verify-backend-equivalence.mjs.
    args: ['--headless=new', '--window-size=1500,1000', '--no-first-run',
      '--enable-unsafe-webgpu', '--enable-features=Vulkan,Metal',
      '--enable-dawn-features=allow_unsafe_apis', '--use-angle=metal',
      '--use-gl=angle', '--enable-unsafe-swiftshader'],
    ...(chromePath ? { executablePath: chromePath } : {})
  })
  try {
    const out = {}
    for (const mode of ['canvas', 'webgl', 'webgpu']) {
      const r = await capture(browser, PORT, mode)
      const png = PNG.sync.read(fs.readFileSync(r.file))
      const st = statsOf(png)
      out[mode] = { ...r, png, st }
      console.log(
        `${mode.padEnd(7)} canvas=${r.report?.w}x${r.report?.h} kind=${r.report?.kind} ` +
          `readback: opaque=${r.report?.opaque} rgb=${r.report?.rgb} ` +
          `screenshotCoverage=${st.pct.toFixed(2)}% bbox=${JSON.stringify(st.bbox)}`
      )
      if (r.fit) console.log(`        fit: ${JSON.stringify(r.fit).slice(0, 200)}`)
      if (r.errors.length) console.log(`        errors: ${r.errors.slice(0, 3).join(' | ')}`)
    }

    const A = out.canvas
    for (const other of ['webgl', 'webgpu']) {
      const B = out[other]
      if (!B || A.png.width !== B.png.width || A.png.height !== B.png.height) continue
      const diff = new PNG({ width: A.png.width, height: A.png.height })
      const mism = pixelmatch(A.png.data, B.png.data, diff.data, A.png.width, A.png.height,
        { threshold: 0.1, alpha: false })
      fs.writeFileSync(path.join(OUT, `app-777-diff-${other}.png`), PNG.sync.write(diff))
      console.log(
        `\ndiff canvas vs ${other}: ${((mism / (A.png.width * A.png.height)) * 100).toFixed(2)}%`
      )
    }
    console.log('\noccupancy  (# both, C canvas-only, W other-only, . neither)')
    console.log('canvas vs webgl')
    console.log(map(A.st, out.webgl.st))
  } finally {
    await browser.close()
    server.kill('SIGTERM')
  }
}

main().catch((e) => { console.error('FAILED:', e); process.exitCode = 1 })
