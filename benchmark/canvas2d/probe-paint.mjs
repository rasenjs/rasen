#!/usr/bin/env node
/* eslint-disable */
// Throwaway diagnostic probe: verifies that each target actually PAINTS after
// create/update (pixel readback) and prints in-page timings without CDP noise
// between ops. Run: node probe-paint.mjs <port-free-auto>

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

function startServer(port, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['start'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(port), BENCH_READY_SIGNAL: signal },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.on('data', (d) => {
      if (d.toString().includes(signal)) resolve(child)
    })
    child.stderr.on('data', () => {})
    setTimeout(() => reject(new Error('server timeout')), 30000)
  })
}

const port = await findFreePort()
console.log('[probe] starting server on port', port)
const child = await startServer(port, '__BENCH_READY__')
console.log('[probe] server ready, launching chrome')
const chromePath =
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : 'chrome'
const browser = await puppeteer.launch({
  headless: false,
  executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
  defaultViewport: { width: 1280, height: 800 },
  args: ['--headless=new', '--window-size=1280,800', '--js-flags=--expose-gc', '--no-first-run']
})

for (const page_ of [
  'vanilla.html',
  'konva.html',
  'konva-fast.html',
  'fabric.html',
  'fabric-fast.html',
  'rasen.html'
]) {
  console.log('[probe] testing', page_)
  const page = await browser.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(`http://localhost:${port}/${page_}`, { waitUntil: 'networkidle0' })
  const r = await page.evaluate(async () => {
    const b = window.__bench
    const t0 = performance.now()
    await b.create(1000)
    const tCreate = performance.now() - t0

    // Sample pixels immediately after create resolves.
    const cv = document.querySelector('canvas')
    const sample = (c) => {
      const ctx = c.getContext('2d')
      if (!ctx) return -1
      const { data } = ctx.getImageData(0, 0, c.width, c.height)
      let n = 0
      for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) n++
      return n
    }
    const paintedAfterCreate = sample(cv)

    const t1 = performance.now()
    await b.updateEvery10th()
    const tUpdate = performance.now() - t1
    const paintedAfterUpdate = sample(cv)

    const t2 = performance.now()
    await b.clear()
    const tClear = performance.now() - t2
    const paintedAfterClear = sample(cv)

    return { tCreate, paintedAfterCreate, tUpdate, paintedAfterUpdate, tClear, paintedAfterClear }
  })
  console.log(page_.padEnd(14), JSON.stringify(r))
  await page.close()
}

await browser.close()
child.kill('SIGKILL')
