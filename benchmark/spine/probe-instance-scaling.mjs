#!/usr/bin/env node
/* eslint-disable */

/**
 * Verify the root cause: animation-level channel data is compiled PER SKELETON.
 *
 * `compileCache` is `WeakMap<AnimationData, Map<skeleton, CompiledAnim>>` and
 * `compile1D` allocates fresh Float64Arrays with no cache of its own, so every
 * skeleton instance on the page gets its own full copy of every channel's
 * times/values/types/curves/tables. Official keeps the frames on the shared
 * Animation and passes the skeleton into `apply()` instead, which is why it is
 * ~1.8x cheaper per sample on the same data.
 *
 * Two independent checks, neither of which reads production internals:
 *
 *   1. heap growth per instance — duplicated channels should cost tens of KB
 *      per instance; only bones + entry lists would be a few KB
 *   2. per-sample cost vs instance count — if the data is duplicated the
 *      working set grows with N and the per-instance cost climbs with N,
 *      instead of flattening once the (shared) data is cache resident
 *
 * Usage: HWGL=1 node probe-instance-scaling.mjs [maxInstances] [ticks]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const MAXN = Number(process.argv[2] || 200)
const TICKS = Number(process.argv[3] || 200)
const HWGL = process.env.HWGL !== '0'
const PORT = Number(process.env.PORT || 5179)
const ROUNDS = 3

function launch() {
  const args = ['--headless=new', '--window-size=1360,1360', '--js-flags=--expose-gc']
  if (!HWGL) args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader')
  const options = { args, defaultViewport: { width: 1360, height: 1360 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

const STEPS = [1, 2, 4, 8, 16, 32, 64, 100, 150, MAXN].filter((n, i, a) => n <= MAXN && a.indexOf(n) === i)

async function main() {
  const browser = await launch()
  let heapRows = []
  let timeRows = []
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    page.setDefaultNavigationTimeout(60000)
    await page.goto(`http://localhost:${PORT}/rasen-webgl.html?bench=1`, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
    await page.evaluate(() => window.__bench.load())

    // ---- 1. heap growth per instance ---------------------------------------
    const heapBefore = await page.evaluate(() => {
      if (window.gc) window.gc()
      return performance.memory ? performance.memory.usedJSHeapSize : 0
    })

    for (const n of STEPS) {
      await page.evaluate((k) => window.__bench.createInstances(k), n)
      const heap = await page.evaluate(() => {
        if (window.gc) window.gc()
        return performance.memory ? performance.memory.usedJSHeapSize : 0
      })
      heapRows.push({ n, heap })
    }

    // ---- 2. per-instance cost vs N -----------------------------------------
    for (const n of STEPS) {
      await page.evaluate((k) => window.__bench.createInstances(k), n)
      const actual = await page.evaluate(() => window.__bench.instanceCount())
      let best = Infinity
      for (let r = 0; r < ROUNDS; r++) {
        const ms = await page.evaluate((t) => window.__bench.poseOnly(t), TICKS)
        if (ms < best) best = ms
      }
      timeRows.push({ n, actual, perTick: best, perInstanceUs: (best * 1000) / Math.max(1, actual) })
    }
  } finally {
    await browser.close()
  }

  console.log('\n=== 1. heap growth ===')
  console.log('  N     heap(MB)   delta MB   KB/instance')
  let prev = null
  for (const r of heapRows) {
    const mb = r.heap / 1048576
    if (prev === null) {
      console.log(`  ${String(r.n).padStart(3)}   ${mb.toFixed(1).padStart(8)}`)
    } else {
      const d = mb - prev.heap / 1048576
      const per = (r.heap - prev.heap) / (r.n - prev.n) / 1024
      console.log(`  ${String(r.n).padStart(3)}   ${mb.toFixed(1).padStart(8)}   ${d.toFixed(2).padStart(7)}   ${per.toFixed(1).padStart(8)}`)
    }
    prev = r
  }
  console.log('  (duplicated channels would show tens of KB per instance;')
  console.log('   bones + entry lists alone should be single-digit KB)')

  console.log('\n=== 2. per-instance cost vs N (poseOnly, ms/tick) ===')
  console.log('  N   actual   ms/tick   us/instance')
  for (const r of timeRows) {
    console.log(`  ${String(r.n).padStart(3)}   ${String(r.actual).padStart(6)}   ${r.perTick.toFixed(3).padStart(8)}   ${r.perInstanceUs.toFixed(1).padStart(10)}`)
  }
  const first = timeRows[0]
  const last = timeRows[timeRows.length - 1]
  console.log('')
  console.log(`  per-instance cost at N=${first.actual}: ${first.perInstanceUs.toFixed(1)} us`)
  console.log(`  per-instance cost at N=${last.actual}: ${last.perInstanceUs.toFixed(1)} us`)
  console.log(`  growth: ${(((last.perInstanceUs - first.perInstanceUs) / first.perInstanceUs) * 100).toFixed(1)}%`)
  console.log('  (a flat curve means the channel data is shared and cache resident;')
  console.log('   a rising curve means the working set grows with N = duplicated data)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
