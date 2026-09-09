#!/usr/bin/env node
/* eslint-disable */

/**
 * Golden-image render lock for the gfx batch renderer.
 *
 * Renders the deterministic scene (scenes.html) in headless Chrome with a
 * REAL WebGL context and pixel-diffs the canvas against committed goldens.
 * This is the "don't break rendering" guarantee for the WebGL2 perf refactor:
 * VAO / bufferSubData / UBO must not change a single pixel.
 *
 *   node golden.mjs            → verify against goldens (fails on drift)
 *   node golden.mjs --update   → (re)generate goldens
 *
 * Goldens live in golden/*.png and ARE committed — they are the contract.
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { serveStatic, RAF_POLYFILL } from './server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR = path.join(__dirname, 'golden')
const UPDATE = process.argv.includes('--update')

/** Allowed differing pixels (AA jitter across Chrome runs), as a ratio. */
const MAX_DIFF_RATIO = 0.004

/** Same launch convention as benchmark/spine: system Chrome, --headless=new,
 * swiftshader WebGL — never --disable-gpu. */
async function launchBrowser() {
  const options = {
    headless: false,
    defaultViewport: { width: 640, height: 560 },
    args: [
      '--headless=new',
      '--window-size=640,560',
      '--no-first-run',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader'
    ]
  }
  const chromePath =
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : 'chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

async function main() {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true })
  const { server, port } = await serveStatic()
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 640, height: 560 })
    await page.evaluateOnNewDocument(RAF_POLYFILL)
    page.on('pageerror', (e) => console.error('[pageerror]', e.message))
    await page.goto(`http://127.0.0.1:${port}/scenes.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction('window.__gfxReady !== undefined', { timeout: 20000 })
    await page.evaluate('window.__gfxReady')
    // Draw a few settled frames, then let the compositor flush before capture.
    await page.evaluate('window.__gfx.drawFrames(4)')
    await new Promise((r) => setTimeout(r, 300))

    const canvasEl = await page.$('#stage')
    if (!canvasEl) throw new Error('#stage canvas not found')
    const shot = PNG.sync.read(await canvasEl.screenshot())

    const goldenPath = path.join(GOLDEN_DIR, 'batch-scene.png')
    if (UPDATE || !fs.existsSync(goldenPath)) {
      fs.writeFileSync(goldenPath, PNG.sync.write(shot))
      console.log(`✔ golden ${UPDATE ? 'updated' : 'generated'}: ${path.relative(process.cwd(), goldenPath)} (${shot.width}×${shot.height})`)
      return
    }

    const golden = PNG.sync.read(fs.readFileSync(goldenPath))
    if (golden.width !== shot.width || golden.height !== shot.height) {
      throw new Error(`size mismatch: golden ${golden.width}×${golden.height} vs shot ${shot.width}×${shot.height}`)
    }
    const diff = new PNG({ width: shot.width, height: shot.height })
    const diffPixels = pixelmatch(golden.data, shot.data, diff.data, shot.width, shot.height, { threshold: 0.1 })
    const ratio = diffPixels / (shot.width * shot.height)
    const diffPath = path.join(__dirname, 'golden', 'batch-scene.diff.png')
    fs.writeFileSync(diffPath, PNG.sync.write(diff))
    if (ratio > MAX_DIFF_RATIO) {
      console.error(`✘ RENDER DRIFT: ${(ratio * 100).toFixed(3)}% pixels differ (max ${(MAX_DIFF_RATIO * 100).toFixed(1)}%)`)
      console.error(`  diff image: ${diffPath}`)
      process.exit(1)
    }
    console.log(`✔ golden match: ${(ratio * 100).toFixed(4)}% pixels differ (≤ ${(MAX_DIFF_RATIO * 100).toFixed(1)}% allowed)`)
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
