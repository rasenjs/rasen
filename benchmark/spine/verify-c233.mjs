#!/usr/bin/env node
/* eslint-disable */

/**
 * c233 multi-page regression gate.
 *
 * The NIKKE c233 (Dorothy) / c223 characters use two-page atlases with many
 * blend modes — every attachment key change splits the batch into a fresh
 * sealed run. The fast-lane flushMerged had an off-by-one (inclusive
 * sealedLast passed as the exclusive `end` of drawSealedRun), so each run
 * silently dropped its LAST attachment and single-item runs misread
 * items[f-1]. c310 (single texture → one run) verified clean at 0.60% and
 * hid it entirely; c233 rendered "just the wings / smoke sampling the
 * clothing texture".
 *
 * This runner loads the c233 repro page, advances a deterministic 30-step
 * pose, screenshots the canvas, and pixel-diffs against
 * golden/c233-t30.png. Regenerate the golden with:
 *
 *   node verify-c233.mjs --update-golden
 *
 * Usage: node verify-c233.mjs   (exit 0 on pass, 1 on fail)
 */

import puppeteer from 'puppeteer'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const GOLDEN = path.join(__dirname, 'golden', 'c233-t30.png')
const SHOT = path.join(__dirname, 'reports', 'render', 'c233-t30.png')
const STEPS = 30
const LIMIT_PCT = 1.0
const UPDATE = process.argv.includes('--update-golden')

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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.css': 'text/css' }

function serve(port) {
  const srv = http.createServer((req, res) => {
    const p = req.url === '/' ? '/index.html' : req.url.split('?')[0]
    const f = path.join(DIST, p)
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' })
      res.end(fs.readFileSync(f))
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)))
}

const RAF_POLYFILL = `
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`

async function main() {
  const port = await findFreePort()
  const server = await serve(port)
  const chromePath =
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1360, height: 1360 },
    args: ['--headless=new', '--window-size=1360,1360', '--no-first-run', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    ...(chromePath ? { executablePath: chromePath } : {})
  })
  try {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(RAF_POLYFILL)
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.setDefaultTimeout(30000)
    page.setDefaultNavigationTimeout(60000)
    await page.goto(`http://127.0.0.1:${port}/c233.html`, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.evaluate(() => window.__bench.load())
    await page.evaluate((s) => window.__bench.debugStep(s), STEPS)
    fs.mkdirSync(path.dirname(SHOT), { recursive: true })
    const canvasEl = await page.$('#app canvas')
    await canvasEl.screenshot({ path: SHOT })
    if (errors.length) {
      console.log('page errors:', errors.slice(0, 3).join(' | '))
      process.exitCode = 1
      return
    }
    if (UPDATE || !fs.existsSync(GOLDEN)) {
      fs.mkdirSync(path.dirname(GOLDEN), { recursive: true })
      fs.copyFileSync(SHOT, GOLDEN)
      console.log(`${UPDATE ? 'golden updated' : 'golden created'}: ${path.relative(__dirname, GOLDEN)}`)
      return
    }
    const a = PNG.sync.read(fs.readFileSync(GOLDEN))
    const b = PNG.sync.read(fs.readFileSync(SHOT))
    if (a.width !== b.width || a.height !== b.height) {
      console.log(`FAIL: size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`)
      process.exitCode = 1
      return
    }
    const diff = new PNG({ width: a.width, height: a.height })
    const mismatches = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1, alpha: false })
    const pct = (mismatches / (a.width * a.height)) * 100
    const diffFile = path.join(path.dirname(SHOT), 'diff-c233-t30.png')
    fs.writeFileSync(diffFile, PNG.sync.write(diff))
    const verdict = pct <= LIMIT_PCT ? 'PASS' : 'FAIL'
    console.log(`c233 t=${STEPS} vs golden: ${pct.toFixed(2)}% differing (${mismatches} px) ${verdict}`)
    if (pct > LIMIT_PCT) process.exitCode = 1
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exitCode = 1
})
