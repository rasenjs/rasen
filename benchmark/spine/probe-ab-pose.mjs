#!/usr/bin/env node
/* eslint-disable */

/**
 * Low-noise poseOnly A/B, built to resolve sub-millisecond differences.
 *
 * Why this exists: `ab-anim.mjs` cannot. It launches a SEPARATE browser per
 * target per run and averages 4-second `avgFrameMs` windows, which are
 * vsync-quantised — a CPU saving shows up as an occasional missed vsync rather
 * than a smaller average. Eight back-to-back runs of one unchanged build gave
 * ratios between 1.07x and 1.49x. Micro-optimisation needs better than that.
 *
 * This harness instead:
 *   - keeps ONE browser for the whole measurement (same process, same GPU
 *     state, same JIT tiering) and only navigates between the two pages
 *   - alternates official/rasen round by round, so slow drift (thermal, other
 *     processes) hits both sides equally instead of one
 *   - measures `poseOnly` (no render pass, no vsync coupling) so the signal is
 *     pure CPU solve cost
 *   - reports MIN and MEDIAN over rounds, never the mean, so a single hitch
 *     cannot move the verdict
 *
 * The ratio is the headline number; absolute ms drift between runs on this
 * machine, the ratio does not.
 *
 * Usage: HWGL=1 node probe-ab-pose.mjs [instances] [ticks] [rounds]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)
const TICKS = Number(process.argv[3] || 300)
const ROUNDS = Number(process.argv[4] || 6)
const HWGL = process.env.HWGL !== '0'
/** When set, `updateWorldTransform` is no-op'd in BOTH runtimes, so the result
 *  is the pure apply/pose-solve cost. Subtracting it from the normal reading
 *  isolates updateWorldTransform on each side, using the same deep-min method
 *  for both instead of the interaction-biased telescoping split. */
const NOUWT = process.env.NOUWT === '1'
const PORT = Number(process.env.PORT || 5179)
/** Inner repeats per round; we keep the best of these. */
const INNER = 3

function launch() {
  const args = ['--headless=new', '--window-size=1360,1360']
  if (!HWGL) args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader')
  const options = { args, defaultViewport: { width: 1360, height: 1360 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

const TARGETS = [
  { name: 'official', page: 'official-webgl.html' },
  { name: 'rasen', page: 'rasen-webgl.html' },
]

async function measure(page, page_, n, ticks) {
  await page.goto(`http://localhost:${PORT}/${page_}?bench=1`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
  await page.evaluate(() => window.__bench.load())
  await page.evaluate((k) => window.__bench.createInstances(k), n)
  if (NOUWT) {
    // Patch on the LIVE prototype; the runtime itself is untouched.
    await page.evaluate(() => {
      const probe = window.__skelProbe || window.__skelProbeOfficial
      const proto = Object.getPrototypeOf(probe.sk)
      if (!proto.__orig_uwt) proto.__orig_uwt = proto.updateWorldTransform
      proto.updateWorldTransform = function () {}
    })
  }
  // Warm up so JIT tiering is settled before we start keeping numbers.
  await page.evaluate((t) => window.__bench.poseOnly(t), 40)
  let best = Infinity
  for (let i = 0; i < INNER; i++) {
    const ms = await page.evaluate((t) => window.__bench.poseOnly(t), ticks)
    if (ms < best) best = ms
  }
  return best
}

function stat(vals) {
  const s = [...vals].sort((a, b) => a - b)
  const min = s[0]
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  return { min, median, max: s[s.length - 1] }
}

async function main() {
  const browser = await launch()
  const samples = { official: [], rasen: [] }
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    page.setDefaultNavigationTimeout(60000)
    for (let r = 0; r < ROUNDS; r++) {
      const line = []
      for (const t of TARGETS) {
        const ms = await measure(page, t.page, N, TICKS)
        samples[t.name].push(ms)
        line.push(`${t.name}=${ms.toFixed(3)}`)
      }
      const ratio = samples.rasen[r] / samples.official[r]
      console.log(`round ${String(r + 1).padStart(2)}  ${line.join('  ')}   ratio=${ratio.toFixed(3)}`)
    }
  } finally {
    await browser.close()
  }

  const o = stat(samples.official)
  const s = stat(samples.rasen)
  console.log('')
  console.log(`N=${N} ticks=${TICKS} rounds=${ROUNDS} inner=${INNER} HWGL=${HWGL}${NOUWT ? '  [NOUWT: uwt no-op\'d]' : ''}   (ms/tick, poseOnly)`)
  console.log(`  official   min ${o.min.toFixed(3)}   median ${o.median.toFixed(3)}   max ${o.max.toFixed(3)}`)
  console.log(`  rasen      min ${s.min.toFixed(3)}   median ${s.median.toFixed(3)}   max ${s.max.toFixed(3)}`)
  console.log('')
  console.log(`  ratio  min-based    ${(s.min / o.min).toFixed(3)}x`)
  console.log(`  ratio  median-based ${(s.median / o.median).toFixed(3)}x`)
  console.log(`  ratio  per-round min ${Math.min(...samples.rasen.map((v, i) => v / samples.official[i])).toFixed(3)}x`)
  console.log('')
  console.log(`  rasen spread (max-min): ${(s.max - s.min).toFixed(3)} ms  — differences smaller than`)
  console.log('  this are not resolvable in one run; treat only bigger moves as real.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
