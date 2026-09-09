/* eslint-disable */
/**
 * Same-session A/B/C anim comparison: Official / Rasen-GL2 / Rasen-GL1.
 * Drives each page's __bench.animate(4000, n) back-to-back in ONE browser so
 * machine-load fluctuation affects all three equally — compare RATIOS, not
 * absolute ms. Usage: node ab-anim.mjs [instances] [runs]
 *
 * Default runs on SwiftShader (CPU rasterizer — isolates CPU-side cost).
 * HWGL=1 switches to hardware GL with bench.js's launch config (1360×1360
 * viewport, no swiftshader flags) so numbers are comparable to the full
 * bench.js reports.
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)
const RUNS = Number(process.argv[3] || 2)
const HWGL = !!process.env.HWGL

function launchBrowser(forceGL1) {
  const args = ['--headless=new', '--window-size=1360,1360', '--js-flags=--expose-gc']
  if (!HWGL) args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader')
  if (forceGL1) args.push('--disable-webgl2')
  const options = { args, defaultViewport: { width: 1360, height: 1360 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

const TARGETS = [
  { name: 'Official spine-ts', page: 'official-webgl.html', gl1: false },
  { name: 'Rasen GL2', page: 'rasen-webgl.html', gl1: false },
  { name: 'Rasen GL1(legacy batch)', page: 'rasen-webgl.html', gl1: true }
]

async function main() {
  // Interleave: run each target RUNS times round-robin so load drift spreads
  // across targets instead of stacking on the last one.
  const results = new Map()
  for (let r = 0; r < RUNS; r++) {
    for (const t of TARGETS) {
      const key = `${t.name}#${r}`
      const browser = await launchBrowser(t.gl1)
      try {
        const page = await browser.newPage()
        await page.goto(`http://localhost:5179/${t.page}?bench=1`, { waitUntil: 'networkidle0', timeout: 60000 })
        await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })
        await page.evaluate(() => window.__bench.load())
        await page.evaluate((n) => window.__bench.createInstances(n), N)
        const anim = await page.evaluate((n) => window.__bench.animate(4000, n), N)
        results.set(key, anim)
        console.log(
          `run${r + 1} ${t.name.padEnd(24)} avgFrame=${anim.avgFrameMs?.toFixed(2) ?? 'n/a'}ms ` +
            `p95=${anim.p95FrameMs?.toFixed(1) ?? 'n/a'} fps=${anim.avgFps?.toFixed(1) ?? 'n/a'} frames=${anim.frames}`
        )
      } catch (e) {
        console.log(`run${r + 1} ${t.name.padEnd(24)} FAILED: ${e.message.slice(0, 80)}`)
        results.set(key, null)
      } finally {
        await browser.close()
      }
    }
  }

  // aggregate per target
  console.log('\n=== aggregate (mean of runs) ===')
  const agg = new Map()
  for (const t of TARGETS) {
    const vals = []
    for (let r = 0; r < RUNS; r++) {
      const a = results.get(`${t.name}#${r}`)
      if (a?.avgFrameMs) vals.push(a.avgFrameMs)
    }
    const mean = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
    agg.set(t.name, mean)
    console.log(`${t.name.padEnd(24)} ${mean ? mean.toFixed(2) + 'ms' : 'n/a'} (${vals.length}/${RUNS} runs)`)
  }
  const official = agg.get('Official spine-ts')
  if (official) {
    for (const t of TARGETS) {
      const m = agg.get(t.name)
      if (m && t.name !== 'Official spine-ts') {
        console.log(`${t.name.padEnd(24)} ${(m / official).toFixed(2)}× official`)
      }
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
