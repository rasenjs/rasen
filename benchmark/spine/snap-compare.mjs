// Snapshot both canvases of the cover-compare page to /tmp for pixel diffing.
import puppeteer from 'puppeteer'

const url = process.argv[2] ?? 'http://localhost:5177/cover-compare.html?char=c103&pose=cover&anim=cover_idle'
const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-features=Translate']
})
const page = await browser.newPage()
await page.setViewport({ width: 2200, height: 1100 })
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
await new Promise((r) => setTimeout(r, 3000))
const urls = await page.evaluate(() => window.__snap())
await import('node:fs').then((fs) => {
  fs.writeFileSync('/tmp/cmp-official.png', Buffer.from(urls[0].split(',')[1], 'base64'))
  fs.writeFileSync('/tmp/cmp-rasen.png', Buffer.from(urls[1].split(',')[1], 'base64'))
})
console.log('saved /tmp/cmp-official.png /tmp/cmp-rasen.png')
await browser.close()
