/* eslint-disable */
/**
 * t0 diagnosis: load the page, then read bone world transforms + slot state
 * directly — BEFORE any tick — and compare apply-only vs apply+explicit-uwt
 * inside the real browser environment. Usage: node diag-t0.mjs [page]
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'

const PAGE = process.argv[2] || 'rasen-webgl.html'
const RAF_POLYFILL = `
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({
  headless: false,
  defaultViewport: { width: 1360, height: 1360 },
  executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
  args: ['--headless=new', '--window-size=1360,1360', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)))
await page.evaluateOnNewDocument(RAF_POLYFILL)
await page.goto(`http://localhost:5179/${PAGE}?bench=1`, { waitUntil: 'networkidle0', timeout: 60000 })
await page.evaluate(() => window.__bench.load())

// t0 state: skeleton pos, bone world transforms, anim state, and whether an
// extra explicit uwt changes anything (it should NOT, per the node test).
const t0 = await page.evaluate(() => {
  const inst = window.__skelProbe
  const sk = inst.sk
  const snap = () => sk.bones.slice(0, 40).map((b) => [b.worldX, b.worldY, b.a, b.d].join(','))
  const before = snap()
  sk.updateWorldTransform()
  const after = snap()
  let diff = 0
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diff++
  return {
    anim: inst.st.currentAnimation,
    time: inst.st.current ? inst.st.current.time : null,
    skX: sk.x, skY: sk.y,
    bones: sk.bones.length,
    uwtChangesAnything: diff,
    bone0: before[0],
    bone5: before[5]
  }
})
console.log(JSON.stringify(t0, null, 1))
await browser.close()
