#!/usr/bin/env node
/* eslint-disable */
// One-off diagnostic: capture a trace around vanilla create() and print the
// event-name histogram after the op-end mark, so we learn the real
// devtools.timeline event names on this Chrome build.
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
    setTimeout(() => reject(new Error('server timeout')), 45000)
  })
}

const port = await findFreePort()
const server = await startServer(port, '__BENCH_READY__')
const browser = await puppeteer.launch({
  headless: false,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--headless=new', '--window-size=1280,800']
})
const page = await browser.newPage()
await page.goto(`http://localhost:${port}/vanilla.html`, { waitUntil: 'networkidle0' })

// Reproduce the runner's exact sequence: warmup, then MULTIPLE sequential
// start/stop cycles on the same CDP session.
await page.evaluate(async (n) => {
  const b = window.__bench
  await b.create(n)
  await b.clear()
}, 1000)

const cdp = await page.createCDPSession()

for (let cycle = 0; cycle < 3; cycle++) {
  const chunks = []
  cdp.on('Tracing.dataCollected', (e) => chunks.push(...e.value))
  const complete = new Promise((res) => cdp.once('Tracing.tracingComplete', res))
  await cdp.send('Tracing.start', {
    traceConfig: { includedCategories: ['devtools.timeline', 'blink.user_timing'] }
  })
  await page.evaluate(async (n) => {
    const b = window.__bench
    performance.mark('rasen_bench_op_start')
    await b.create(n)
    performance.mark('rasen_bench_op_end')
  }, 1000)
  await new Promise((r) => setTimeout(r, 250))
  await cdp.send('Tracing.end')
  await complete
  cdp.removeAllListeners('Tracing.dataCollected')
  const marks = chunks.filter((e) => e.name === 'rasen_bench_op_end').length
  const paints = chunks.filter((e) => e.name === 'Paint').length
  const names = [...new Set(chunks.map((e) => e.name))].filter((n) =>
    ['Paint', 'PrePaint', 'Layerize', 'FireAnimationFrame', 'UpdateLayoutTree'].includes(n)
  )
  console.log(`cycle ${cycle}: events=${chunks.length} marks=${marks} paints=${paints} frame-names=[${names.join(', ')}]`)
}

await browser.close()
server.kill('SIGKILL')

