#!/usr/bin/env node
/* eslint-disable */
// One-off: diagnose why RenderContext capture fails on rasen.html.
import puppeteer from 'puppeteer'
import net from 'node:net'
import { spawn } from 'node:child_process'

const port = await new Promise((res, rej) => {
  const s = net.createServer()
  s.unref()
  s.on('error', rej)
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port
    s.close(() => res(p))
  })
})

const child = spawn('npm', ['start'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), BENCH_READY_SIGNAL: 'RDY' },
  stdio: ['ignore', 'pipe', 'pipe']
})
await new Promise((r) => {
  child.stdout.on('data', (d) => {
    if (d.toString().includes('RDY')) r()
  })
})

const browser = await puppeteer.launch({
  headless: false,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--headless=new']
})
const page = await browser.newPage()
page.on('console', (m) => console.log('[page]', m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(`http://localhost:${port}/rasen.html`, { waitUntil: 'networkidle0' })

const info = await page.evaluate(async () => {
  const all = document.querySelectorAll('#app canvas')
  const el = document.querySelector('#app canvas')
  const out = { count: all.length }
  if (el) {
    out.w = el.width
    out.h = el.height
    const c = el.getContext('2d')
    out.ctxNull = c === null
    // Does a RenderContext exist for this ctx? Probe via window.__bench state.
    out.benchKeys = Object.keys(window.__bench || {})
    // hitQuery needs a populated scene — create first, then probe.
    await window.__bench.create(1000)
    try {
      const r = window.__bench.hitQuery(100)
      out.hitProbe = r
    } catch (e) {
      out.hitErr = String(e)
    }
  }
  return out
})
console.log(JSON.stringify(info, null, 2))

await browser.close()
child.kill('SIGKILL')
