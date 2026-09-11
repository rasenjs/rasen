import puppeteer from 'puppeteer'
import fs from 'node:fs'
const args = ['--headless=new','--enable-unsafe-webgpu','--enable-features=Vulkan,Metal','--enable-dawn-features=allow_unsafe_apis','--use-angle=metal']
const opts = { args, defaultViewport: { width: 1100, height: 1100 } }
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (fs.existsSync(chrome)) opts.executablePath = chrome
const browser = await puppeteer.launch(opts)
const page = await browser.newPage()
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)))
page.on('console', m => console.log('[page]', m.text().slice(0,200)))
await page.goto('http://localhost:5177/rasen-webgpu.html', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 6000))
const st = await page.evaluate(() => {
  const b = window.__bench
  return { hasBench: !!b, count: b ? b.instanceCount() : -1 }
})
console.log('state:', JSON.stringify(st))
// count non-blank pixels via a canvas screenshot
const el = await page.$('canvas')
if (el) {
  const img = await el.screenshot({ type: 'png' })
  fs.writeFileSync('/tmp/spine-gpu-sanity.png', img)
  console.log('screenshot saved', img.length, 'bytes')
}
await browser.close()
