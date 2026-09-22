#!/usr/bin/env node
/* eslint-disable */

/**
 * Dumps a short frame sequence of a bench page for visual inspection.
 *
 * Every pixel-reading path from inside the page is unreliable for these canvases
 * (a 2D `drawImage` of the WebGL canvas reads back as empty, and CDP screencast
 * delivers one frame per session here), so frames are taken from Node via
 * `elementHandle.screenshot`, which is the only path that has actually produced
 * correct pixels in this environment.
 *
 * That path costs ~50-100ms per shot, so this cannot catch a single-frame glitch
 * — it is for looking at what the character renders like, not for timing.
 *
 * Usage: node dump-frames.mjs <page> <query> <count> <intervalMs>
 *   node dump-frames.mjs rasen-webgl.html 'skel=c405/c405_00' 8 120
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RAF_POLYFILL = `
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`

function freePort() {
  return new Promise((res) => {
    const s = net.createServer()
    s.unref()
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => res(p))
    })
  })
}

async function main() {
  const [pageFile, query, countArg, intervalArg] = process.argv.slice(2)
  if (!pageFile) {
    console.error('usage: node dump-frames.mjs <page> <query> <count> <intervalMs>')
    process.exit(2)
  }
  const count = Number(countArg || 8)
  const interval = Number(intervalArg || 120)
  const outDir = process.env.OUT || '/tmp/c405-frames'
  fs.mkdirSync(outDir, { recursive: true })

  const port = await freePort()
  const server = spawn('npm', ['start'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port), BENCH_READY_SIGNAL: '__BENCH_READY__' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  await new Promise((r, j) => {
    server.stdout.on('data', (d) => {
      if (d.toString().includes('__BENCH_READY__')) r()
    })
    setTimeout(() => j(new Error('server timeout')), 60000)
  })

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1100, height: 1100 },
    args: [
      '--headless=new',
      '--window-size=1100,1100',
      '--use-angle=metal',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,Metal',
      '--enable-dawn-features=allow_unsafe_apis'
    ],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  })

  try {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(RAF_POLYFILL)
    page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 160)))
    const url = `http://localhost:${port}/${pageFile}?bench=1${query ? '&' + query : ''}`
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })
    await page.evaluate(() => window.__bench.load())
    // Let the atlas land and the first frames settle (a cold cache renders blank
    // for a while, and dumping that would just document the load, not the render).
    await new Promise((r) => setTimeout(r, 1500))
    const el = await page.$('#app canvas')

    const written = []
    for (let i = 0; i < count; i++) {
      const b64 = await el.screenshot({ encoding: 'base64' })
      const file = path.join(outDir, `frame-${String(i).padStart(3, '0')}.png`)
      fs.writeFileSync(file, Buffer.from(b64, 'base64'))
      written.push({ file, bytes: Buffer.from(b64, 'base64').length })
      // Advance the animation a little between shots: `animate` runs its own rAF
      // loop, so a plain sleep is enough to move the pose. The duration has to be
      // passed in — an evaluate callback runs in the page and cannot see Node
      // variables.
      await page.evaluate((ms) => window.__bench.animate(ms, 1).catch(() => {}), interval)
    }

    const sizes = written.map((w) => w.bytes)
    console.log(`\n${pageFile} ${query || ''}`)
    console.log(`  ${written.length} frames → ${outDir}`)
    console.log(`  bytes: min ${Math.min(...sizes)} max ${Math.max(...sizes)}`)
    console.log(
      `  a blank 2048x2048 frame is ~6KB and a drawn one hundreds of KB, so this` +
        `\n  also says whether the page rendered at all.`
    )
  } finally {
    await browser.close()
    server.kill('SIGTERM')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
