import puppeteer from 'puppeteer'

import fs from 'node:fs'
function launch() {
  const args = [
    '--headless=new',
    '--window-size=1280,800',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,Metal',
    '--enable-dawn-features=allow_unsafe_apis',
    '--use-angle=metal',
  ]
  const options = { args, defaultViewport: { width: 1280, height: 800 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}
const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })
page.on('console', (m) => { const t = m.text(); if (!t.includes('Download the React DevTools')) console.log('[page]', t.slice(0, 300)) })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))

await page.goto('http://localhost:4399/', { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 6000))
console.log('body:', (await page.evaluate(() => document.body.innerText)).slice(0, 400).replace(/\n/g, ' | '))

// Click a character if the list rendered, then switch to WebGPU
const clicked = await page.evaluate(() => {
  // The character entries are rendered as selectable rows; try divs/spans with a character code.
  const els = [...document.querySelectorAll('button, [role=button], li, .cursor-pointer')]
  const el = els.find((b) => /2B/.test(b.textContent) && b.textContent.trim().length < 30)
  if (el) { el.click(); return el.textContent.trim() }
  return null
})
console.log('character picked:', clicked)
await new Promise((r) => setTimeout(r, 5000))
console.log('body2:', (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n/g, ' | '))

// Switch to WebGPU
const mode = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'WebGPU')
  if (!btn) return 'NO-BUTTON'
  btn.click()
  return 'clicked'
})
console.log('webgpu button:', mode)
await new Promise((r) => setTimeout(r, 3000))

const state = await page.evaluate(() => {
  const cv = document.querySelector('canvas')
  return {
    hasCanvas: !!cv,
    ctxType: cv ? (cv.getContext('webgpu') ? 'webgpu-ok' : 'no-webgpu-ctx') : 'none',
    status: document.body.innerText.match(/[^\n]*(not available|Loading|error)[^\n]*/i)?.[0] ?? null,
  }
})
console.log('state:', JSON.stringify(state))

// Grab the canvas pixels via a data URL? WebGPU canvas → use toDataURL (works
// for WebGPU canvases after a draw because the browser keeps a presentation copy).
const shot = await page.screenshot({ path: '/tmp/nikke-webgpu.png' })
console.log('screenshot bytes:', shot.length)
await browser.close()
