#!/usr/bin/env node
/* eslint-disable */

/**
 * Divide-and-conquer probe: separate PER-TRACK cost from PER-APPLY fixed cost.
 *
 * Both runtimes pay `k * tracks + c` per apply, where k is the per-track
 * timeline cost and c is the fixed per-apply overhead (state machine body,
 * compiled-animation lookup, dispatch). Those two have completely different
 * fixes, and the total-only number cannot tell them apart.
 *
 * Method: sweep c310 animations of very different track counts (the rig ships
 * 2-track and 189-track animations), measure poseOnly for each on BOTH pages,
 * then fit k and c by least squares. Reports the two sides' slopes and
 * intercepts side by side so the gap is attributed to the right term.
 *
 * Usage: HWGL=1 node probe-track-sweep.mjs [instances] [ticks]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import { parseSpineBinary } from '../../packages/assets/dist/index.js'

const N = Number(process.argv[2] || 200)
const TICKS = Number(process.argv[3] || 300)
const HWGL = process.env.HWGL !== '0'
const PORT = Number(process.env.PORT || 5179)
const ROUNDS = 3

// Pick animations spanning the track-count range, including the extremes.
const data = parseSpineBinary(new Uint8Array(fs.readFileSync('public/c310_00.skel')), 1)
const trackCount = (a) => Object.keys(a.bones ?? {}).length
const anims = Object.keys(data.animations)
  .map((name) => ({ name, tracks: trackCount(data.animations[name]) }))
  .sort((a, b) => a.tracks - b.tracks)
const chosen = [anims[0], anims[1], anims[Math.floor(anims.length / 2)], anims[anims.length - 1]]
console.log(`c310 animations by bone-track count: ${anims.map((a) => `${a.name}:${a.tracks}`).join(' ')}`)
console.log(`sweeping: ${chosen.map((a) => `${a.name}(${a.tracks})`).join(', ')}`)
console.log('')

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
  const results = { official: {}, rasen: {} }
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    page.setDefaultNavigationTimeout(60000)
    for (const target of [
      { key: 'official', page: 'official-webgl.html' },
      { key: 'rasen', page: 'rasen-webgl.html' }
    ]) {
      for (const anim of chosen) {
        const url = `http://localhost:${PORT}/${target.page}?bench=1&anim=${encodeURIComponent(anim.name)}`
        await page.goto(url, { waitUntil: 'networkidle0' })
        await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
        await page.evaluate(() => window.__bench.load())
        await page.evaluate((n) => window.__bench.createInstances(n), N)
        let best = Infinity
        for (let r = 0; r < ROUNDS; r++) {
          const ms = await page.evaluate(async (ticks) => window.__bench.poseOnly(ticks), TICKS)
          if (ms < best) best = ms
        }
        results[target.key][anim.name] = best
        console.log(`  ${target.key.padEnd(9)} ${anim.name.padEnd(14)} tracks=${String(anim.tracks).padStart(3)}  poseOnly=${best.toFixed(3)} ms`)
      }
    }
  } finally {
    await browser.close()
  }

  // Least squares fit of ms = k*tracks + c per runtime.
  function fit(res) {
    const xs = []
    const ys = []
    for (const a of chosen) {
      xs.push(a.tracks)
      ys.push(res[a.name])
    }
    const n = xs.length
    const mx = xs.reduce((s, v) => s + v, 0) / n
    const my = ys.reduce((s, v) => s + v, 0) / n
    let num = 0
    let den = 0
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my)
      den += (xs[i] - mx) ** 2
    }
    const k = den === 0 ? 0 : num / den
    const c = my - k * mx
    return { k, c }
  }
  const fo = fit(results.official)
  const fr = fit(results.rasen)

  console.log('')
  console.log('=== per-track vs per-apply decomposition (ms, N=' + N + ' instances) ===')
  console.log(`                        official      rasen      delta`)
  console.log(`per-track (k)        ${fo.k.toExponential(2).padStart(10)} ${fr.k.toExponential(2).padStart(10)}   ${((fr.k - fo.k) / fo.k * 100).toFixed(0)}%`)
  console.log(`per-apply (c)        ${fo.c.toFixed(3).padStart(10)} ${fr.c.toFixed(3).padStart(10)}   ${(fr.c - fo.c).toFixed(3)} ms`)
  console.log('')
  console.log(`At 189 tracks: k*189 = official ${(fo.k * 189).toFixed(2)} ms | rasen ${(fr.k * 189).toFixed(2)} ms  -> per-track gap ${(fr.k * 189 - fo.k * 189).toFixed(2)} ms`)
  console.log(`Fixed overhead gap    ${(fr.c - fo.c).toFixed(2)} ms`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
