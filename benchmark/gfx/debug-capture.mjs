/* eslint-disable */
/**
 * Debug capture: saves the CURRENT render of the batch scene to
 * golden/debug-current.png for visual comparison against the golden PNG.
 * Usage: node debug-capture.mjs
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { serveStatic, RAF_POLYFILL } from './server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function launchBrowser() {
  const options = {
    args: ['--headless=new', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

async function main() {
  const { server, port } = await serveStatic()
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 640, height: 560 })
    await page.evaluateOnNewDocument(RAF_POLYFILL)
    // Debug: log GL errors from bufferSubData/bufferData with sizes
    await page.evaluateOnNewDocument(`
      (() => {
        const proto = WebGL2RenderingContext.prototype
        window.__bufLog = []
        for (const name of ['bufferSubData', 'bufferData']) {
          const orig = proto[name]
          proto[name] = function (...args) {
            const r = orig.apply(this, args)
            const e = this.getError()
            const size = args[1] instanceof Float32Array ? args[1].length + 'f' : args[1]
            if (window.__bufLog.length < 40) {
              window.__bufLog.push({ name, size, err: e })
            }
            return r
          }
        }
      })()
    `)
    page.on('pageerror', (e) => console.error('[pageerror]', e.message))
    await page.goto(`http://127.0.0.1:${port}/scenes.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction('window.__gfxReady !== undefined', { timeout: 20000 })
    await page.evaluate('window.__gfxReady')
    await page.evaluate('window.__gfx.drawFrames(4)')
    await new Promise((r) => setTimeout(r, 300))

    const diag = await page.evaluate(() => ({ log: window.__bufLog }))
    console.log('diag:', JSON.stringify(diag, null, 1))

    const canvasEl = await page.$('#stage')
    if (!canvasEl) throw new Error('#stage canvas not found')
    const shot = PNG.sync.read(await canvasEl.screenshot())
    const out = path.join(__dirname, 'golden', 'debug-current.png')
    fs.writeFileSync(out, PNG.sync.write(shot))
    console.log(`✔ saved ${path.relative(process.cwd(), out)} (${shot.width}×${shot.height})`)
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
