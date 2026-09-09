/* eslint-disable */
/**
 * Quick page health probe: load a bench page, step it, screenshot the canvas,
 * report page errors + non-blank pixel ratio. Usage: node probe-page.mjs [page]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const PAGE = process.argv[2] || 'rasen-webgl.html'
const N = Number(process.argv[3] || 3)

const RAF_POLYFILL = `
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`

const browser = await puppeteer.launch({
  headless: false,
  defaultViewport: { width: 1360, height: 1360 },
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--headless=new', '--window-size=1360,1360', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300))
})
await page.evaluateOnNewDocument(RAF_POLYFILL)
await page.goto(`http://localhost:5179/${PAGE}?bench=1`, { waitUntil: 'networkidle0', timeout: 30000 })
console.log('page loaded')
const hasBench = await page.evaluate(() => !!window.__bench)
console.log('__bench:', hasBench)
await page.evaluate(() => window.__bench.load())
console.log('load done')
await page.evaluate((n) => window.__bench.createInstances(n), N)
console.log('instances created')
await page.evaluate((s) => window.__bench.debugStep(s), 10)
console.log('stepped')
const canvasEl = await page.$('#app canvas')
await canvasEl.screenshot({ path: `/tmp/probe-${PAGE.replace(/[.-]/g, '_')}.png` })
// Non-blank check via 2d canvas readback of the GL canvas.
const stats = await page.evaluate(() => {
  const c = document.querySelector('#app canvas')
  const g = document.createElement('canvas')
  g.width = c.width
  g.height = c.height
  const ctx = g.getContext('2d')
  ctx.drawImage(c, 0, 0)
  const d = ctx.getImageData(0, 0, g.width, g.height).data
  let non = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) non++
  return { w: c.width, h: c.height, nonBlank: non, total: g.width * g.height }
})
console.log('canvas:', JSON.stringify(stats), `non-blank ${(100 * stats.nonBlank / stats.total).toFixed(1)}%`)
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'no page errors')
await browser.close()
