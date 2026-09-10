#!/usr/bin/env node
/* eslint-disable */

/**
 * Per-phase comparison between the official spine-ts page and the Rasen page,
 * measured in ONE browser session so machine drift affects both equally.
 *
 * Why: the total animate() time hides WHERE the gap is. Splitting it into
 *   - poseOnly  (advance + apply the animation, no draw)  → runtime JS gap
 *   - animate   (tick + draw)                             → runtime + render
 * tells us whether to invest in the assets runtime or in the submission path.
 *
 * Usage: HWGL=1 node compare-phases.mjs [instances] [runs]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)
const RUNS = Number(process.argv[3] || 3)
const HWGL = process.env.HWGL !== '0'
const PORT = Number(process.env.PORT || 5179)

const PAGES = [
  { name: 'official', page: 'official-webgl.html' },
  { name: 'rasen', page: 'rasen-webgl.html' }
]

function launch() {
  const args = ['--headless=new', '--window-size=1360,1360', '--js-flags=--expose-gc']
  if (!HWGL) args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader')
  const options = { args, defaultViewport: { width: 1360, height: 1360 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

async function main() {
  const browser = await launch()
  const results = {}
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    page.setDefaultNavigationTimeout(60000)

    for (const target of PAGES) {
      await page.goto(`http://${'localhost'}:${PORT}/${target.page}?bench=1`, { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
      await page.evaluate(() => window.__bench.load())
      await page.evaluate((n) => window.__bench.createInstances(n), N)
      const pose = []
      const anim = []
      for (let r = 0; r < RUNS; r++) {
        // poseOnly resolves to ms-per-tick (a plain number); animate resolves
        // to an AnimResult whose avgFrameMs is the per-frame cost.
        const p = await page.evaluate((n) => window.__bench.poseOnly(2000, n), N)
        const a = await page.evaluate((n) => window.__bench.animate(2000, n), N)
        pose.push(Number(p))
        anim.push(Number(a.avgFrameMs))
      }
      const min = (arr) => Math.min(...arr)
      results[target.name] = {
        pose: min(pose),
        anim: min(anim)
      }
    }
  } finally {
    await browser.close()
  }

  const o = results.official
  const r = results.rasen
  console.log(`N=${N} runs=${RUNS} HWGL=${HWGL}  (min of runs)`)
  console.log('')
  console.log(`poseOnly   official ${o.pose.toFixed(2)}ms   rasen ${r.pose.toFixed(2)}ms   ratio ${(r.pose / o.pose).toFixed(3)}x   gap ${(r.pose - o.pose).toFixed(2)}ms`)
  console.log(`animate    official ${o.anim.toFixed(2)}ms   rasen ${r.anim.toFixed(2)}ms   ratio ${(r.anim / o.anim).toFixed(3)}x   gap ${(r.anim - o.anim).toFixed(2)}ms`)
  console.log('')
  console.log(`render-only (animate - pose)   official ${(o.anim - o.pose).toFixed(2)}ms   rasen ${(r.anim - r.pose).toFixed(2)}ms   gap ${(r.anim - r.pose) - (o.anim - o.pose) > 0 ? '+' : ''}${((r.anim - r.pose) - (o.anim - o.pose)).toFixed(2)}ms`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
