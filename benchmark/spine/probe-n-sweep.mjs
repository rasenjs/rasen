#!/usr/bin/env node
/* eslint-disable */

/**
 * Is per-instance pose cost sensitive to the number of live instances?
 *
 * This is the fork that decides where to look next.
 *
 *   flat vs N   -> each instance costs the same no matter how much data is
 *                  live, so the cost is INSTRUCTION/BRANCH bound and cache
 *                  footprint is irrelevant. Optimise the loop itself.
 *   rising vs N -> instances are competing for cache, so the cost is HOT
 *                  FOOTPRINT bound. Optimise data layout / shrink what the
 *                  per-frame loop touches.
 *
 * The earlier ballast experiment could not answer this: it added memory that
 * was never accessed, which does not evict anything the hot loop actually uses.
 * Varying N changes the size of the data the loop genuinely walks.
 *
 * Instances are added monotonically in ONE page load (createInstances only
 * grows), so page-load variance and JIT differences cannot masquerade as a
 * trend, and each N is measured after the previous one has warmed the tier.

 * Usage: HWGL=1 node probe-n-sweep.mjs [maxInstances] [ticks]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const MAXN = Number(process.argv[2] || 200)
const TICKS = Number(process.argv[3] || 200)
const ROUNDS = 3
const HWGL = process.env.HWGL !== '0'
const PORT = Number(process.env.PORT || 5179)

function launch() {
  const args = ['--headless=new', '--window-size=1360,1360']
  if (!HWGL) args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader')
  const options = { args, defaultViewport: { width: 1360, height: 1360 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

const STEPS = [1, 2, 4, 8, 16, 32, 64, 100, 150, 200].filter((n) => n <= MAXN)

async function sweep(page, url) {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
  await page.evaluate(() => window.__bench.load())
  const rows = []
  for (const target of STEPS) {
    await page.evaluate((n) => window.__bench.createInstances(n), target)
    const actual = await page.evaluate(() => (window.__bench.instanceCount ? window.__bench.instanceCount() : null))
    // Warm this N before keeping numbers.
    await page.evaluate((t) => window.__bench.poseOnly(t), 30)
    let best = Infinity
    for (let r = 0; r < ROUNDS; r++) {
      const ms = await page.evaluate((t) => window.__bench.poseOnly(t), TICKS)
      if (ms < best) best = ms
    }
    rows.push({ target, actual, perTick: best, perInstanceUs: (best * 1000) / (actual || target) })
  }
  return rows
}

async function main() {
  const browser = await launch()
  let out = {}
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(120000)
    page.setDefaultNavigationTimeout(120000)
    out.official = await sweep(page, `http://localhost:${PORT}/official-webgl.html?bench=1`)
    out.rasen = await sweep(page, `http://localhost:${PORT}/rasen-webgl.html?bench=1`)
  } finally {
    await browser.close()
  }

  console.log('')
  console.log(`N sweep, ticks=${TICKS}, min of ${ROUNDS}, HWGL=${HWGL}`)
  console.log('  N   official ms/tick   us/instance | rasen ms/tick   us/instance | ratio')
  const n = Math.max(out.official.length, out.rasen.length)
  for (let i = 0; i < n; i++) {
    const o = out.official[i]
    const r = out.rasen[i]
    const oc = o ? `${o.perTick.toFixed(3).padStart(8)} ${o.perInstanceUs.toFixed(1).padStart(10)}` : ' '.repeat(19)
    const rc = r ? `${r.perTick.toFixed(3).padStart(8)} ${r.perInstanceUs.toFixed(1).padStart(10)}` : ' '.repeat(19)
    const ratio = o && r ? (r.perInstanceUs / o.perInstanceUs).toFixed(3) : ''
    console.log(`${String((r || o).actual ?? (r || o).target).padStart(3)}   ${oc} | ${rc} | ${ratio}`)
  }

  console.log('')
  const trend = (rows, label) => {
    const usable = rows.filter((r) => (r.actual || r.target) >= 8)
    const first = usable[0]
    const last = usable[usable.length - 1]
    const pct = ((last.perInstanceUs - first.perInstanceUs) / first.perInstanceUs) * 100
    console.log(
      `  ${label.padEnd(9)} per-instance ${first.perInstanceUs.toFixed(1)} us at N=${first.actual ?? first.target}` +
        ` -> ${last.perInstanceUs.toFixed(1)} us at N=${last.actual ?? last.target}   (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`
    )
    return pct
  }
  console.log('=== per-instance cost trend (N>=8) ===')
  const op = trend(out.official, 'official')
  const rp = trend(out.rasen, 'rasen')
  console.log('')
  console.log(`  official rises ${op.toFixed(1)}% across the sweep, rasen rises ${rp.toFixed(1)}%`)
  console.log('')
  if (rp > 15 && rp > op + 10) {
    console.log('  => rasen degrades with N while official does not: HOT FOOTPRINT bound.')
    console.log('     Target the data the per-frame loop walks (layout / count of objects touched).')
  } else if (rp < 10) {
    console.log('  => per-instance cost is essentially FLAT: INSTRUCTION/BRANCH bound.')
    console.log('     Cache footprint is not the lever; optimise the loop itself.')
  } else {
    console.log('  => mixed / inconclusive; compare the two curves above before concluding.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
