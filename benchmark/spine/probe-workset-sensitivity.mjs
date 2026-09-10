#!/usr/bin/env node
/* eslint-disable */

/**
 * Is the pose cost actually sensitive to working-set size?
 *
 * Everything I have been doing for the last two changes assumed it is: "shrink
 * the per-instance graph and the traversal gets faster". But the 7.5 KB/bone
 * field removal produced no measurable change, so the assumption is unverified.
 *
 * Rather than refactor across three packages on an unverified premise, test the
 * premise directly: keep the real workload identical and just ADD unrelated
 * memory pressure. If poseOnly degrades as the heap fills with cold data, the
 * working set matters and shrinking it is the right lever. If poseOnly is flat,
 * the lever is not memory volume at all and the refactor would be wasted work.
 *
 * The dummy data is touched once so it is resident in DRAM (not lazily mapped),
 * but is never read during the measurement.
 *
 * Usage: HWGL=1 node probe-workset-sensitivity.mjs [instances] [ticks]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)
const TICKS = Number(process.argv[3] || 300)
const ROUNDS = 3
const PORT = Number(process.env.PORT || 5179)

function launch() {
  const args = ['--headless=new', '--window-size=1360,1360', '--js-flags=--expose-gc']
  const options = { args, defaultViewport: { width: 1360, height: 1360 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

async function main() {
  const browser = await launch()
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(120000)
    page.setDefaultNavigationTimeout(120000)
    await page.goto(`http://localhost:${PORT}/rasen-webgl.html?bench=1`, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
    await page.evaluate(() => window.__bench.load())
    await page.evaluate((n) => window.__bench.createInstances(n), N)
    await page.evaluate((t) => window.__bench.poseOnly(t), 40) // warm up

    // Allocate `mb` megabytes of cold Float64Array payload and keep it alive.
    await page.evaluate(() => {
      window.__ballast = []
      return true
    })

    const results = []
    for (const mb of [0, 32, 64, 128, 256]) {
      await page.evaluate((target) => {
        const have = window.__ballast.reduce((s, a) => s + a.length * 8, 0)
        const want = target * 1048576
        while (have + window.__ballast.reduce((s, a) => s + a.length * 8, 0) < want) {
          const arr = new Float64Array(8 * 1024 * 1024) // 8 MB each
          arr[0] = 1
          arr[arr.length - 1] = 1
          window.__ballast.push(arr)
        }
        return window.__ballast.length
      }, mb)
      let best = Infinity
      for (let r = 0; r < ROUNDS; r++) {
        const ms = await page.evaluate((t) => window.__bench.poseOnly(t), TICKS)
        if (ms < best) best = ms
      }
      const actualMB = await page.evaluate(() => window.__ballast.reduce((s, a) => s + a.length * 8, 0) / 1048576)
      results.push({ targetMB: mb, actualMB, ms: best })
      console.log(`ballast ${String(mb).padStart(4)} MB (actual ${actualMB.toFixed(0).padStart(4)})   poseOnly ${best.toFixed(3)} ms/tick`)
    }

    console.log('')
    const base = results[0].ms
    console.log('=== sensitivity to unrelated memory pressure ===')
    for (const r of results) {
      console.log(
        `  +${String(r.actualMB.toFixed(0)).padStart(4)} MB ballast   ${r.ms.toFixed(3)} ms   ` +
          `${(((r.ms - base) / base) * 100 >= 0 ? '+' : '') + (((r.ms - base) / base) * 100).toFixed(1)}%`
      )
    }
    console.log('')
    const worst = results[results.length - 1]
    const deltaPct = ((worst.ms - base) / base) * 100
    console.log(`  worst case: ${deltaPct.toFixed(1)}% for +${worst.actualMB.toFixed(0)} MB of cold memory`)
    console.log('')
    if (deltaPct > 5) {
      console.log('  => The pose cost IS working-set sensitive. Shrinking the per-instance')
      console.log('     object graph is the right lever; the colorN refactor is justified.')
    } else {
      console.log('  => The pose cost is NOT sensitive to added memory pressure. The remaining')
      console.log('     gap is NOT about working-set volume, so shrinking Bone/Slot would be')
      console.log('     wasted effort — look elsewhere (instruction count, branches, call depth).')
    }
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
