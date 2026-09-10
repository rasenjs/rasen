#!/usr/bin/env node
/* eslint-disable */

/**
 * Exactly-additive three-way split of poseOnly, on BOTH runtimes, with no
 * library instrumentation.
 *
 * Why this shape (the previous subtraction method was unsound): measuring
 * `total - (one stage disabled)` for each stage independently does NOT have to
 * sum to the total, because the stages are coupled — disabling the bone
 * timelines also changes what updateWorldTransform does. Any leftover from that
 * sum is therefore an artifact, not a hidden cost, and cannot be interpreted.
 *
 * This probe instead NESTS the measurements so the increments telescope:
 *
 *   P      everything on                    = update + apply + uwt
 *   A      updateWorldTransform disabled    = update + apply
 *   C      apply AND uwt disabled           = update
 *   floor  apply, uwt and update disabled   = the harness loop
 *
 *   uwt    = P - A
 *   apply  = A - C
 *   update = C - floor
 *
 * and uwt + apply + update + floor === P BY CONSTRUCTION, so the report always
 * balances and any imbalance would point at a measurement bug rather than at a
 * mysterious cost. Both runtimes are driven through the same formulas.
 *
 * Isolation is pure prototype patching of the live instance each bench page
 * already exposes (window.__skelProbe / window.__skelProbeOfficial), so the
 * runtime under test is untouched.
 *
 * Caveat on the comparison: our `AnimationState.apply()` calls
 * updateWorldTransform internally while official's does not, so the `apply` row
 * for Rasen also contains its setup reset. Read the rows as "the apply path
 * including whatever it drives" — the uwt row is the clean like-for-like one.
 *
 * Usage: HWGL=1 node probe-pose-split.mjs [instances] [ticks]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)
const TICKS = Number(process.argv[3] || 300)
const HWGL = process.env.HWGL !== '0'
const PORT = Number(process.env.PORT || 5179)
const ROUNDS = 4

function launch() {
  const args = ['--headless=new', '--window-size=1360,1360', '--js-flags=--expose-gc']
  if (!HWGL) args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader')
  const options = { args, defaultViewport: { width: 1360, height: 1360 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

/** min-of-ROUNDS poseOnly with the requested prototypes no-op'd. */
async function measure(page, probeProp, offApply, offUwt, offSetup, offUpdate) {
  let best = Infinity
  for (let r = 0; r < ROUNDS; r++) {
    const ms = await page.evaluate(
      async (prop, oa, ou, os, up, ticks) => {
        const inst = window[prop]
        const skProto = Object.getPrototypeOf(inst.sk)
        const stProto = Object.getPrototypeOf(inst.st)
        const patch = (proto, name, off) => {
          const key = `__orig_${name}`
          if (off) {
            if (!proto[key]) proto[key] = proto[name]
            proto[name] = function () {}
          } else if (proto[key]) {
            proto[name] = proto[key]
          }
        }
        patch(stProto, 'apply', oa)
        patch(skProto, 'updateWorldTransform', ou)
        patch(skProto, 'setToSetupPose', os)
        patch(stProto, 'update', up)
        const v = await window.__bench.poseOnly(ticks)
        patch(stProto, 'apply', false)
        patch(skProto, 'updateWorldTransform', false)
        patch(skProto, 'setToSetupPose', false)
        patch(stProto, 'update', false)
        return v
      },
      probeProp,
      offApply,
      offUwt,
      offSetup,
      offUpdate,
      TICKS
    )
    if (ms < best) best = ms
  }
  return best
}

/**
 * Nested (telescoping) split. Each level removes one more thing, so the
 * increments below sum to P - floor exactly:
 *
 *   P          everything on
 *   A          updateWorldTransform off            -> P - A      = uwt
 *   S          ... and setToSetupPose off          -> A - S      = setup
 *   C          ... and apply off                   -> S - C      = timelines+glue
 *   floor      ... and update off                  -> C - floor  = update
 *
 * `setToSetupPose` is patchable on Skeleton.prototype, so it needs no library
 * instrumentation — and unlike the earlier subtraction attempts, the animation
 * DATA is never touched here, so V8 sees the same workload at every level.
 */
async function split(page, url, probeProp) {
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
  await page.evaluate(() => window.__bench.load())
  await page.evaluate((n) => window.__bench.createInstances(n), N)
  const P = await measure(page, probeProp, false, false, false, false)
  const A = await measure(page, probeProp, false, true, false, false)
  const S = await measure(page, probeProp, false, true, true, false)
  const C = await measure(page, probeProp, true, true, true, false)
  const floor = await measure(page, probeProp, true, true, true, true)
  return { P, A, S, C, floor }
}

function report(label, r) {
  const uwt = r.P - r.A
  const setup = r.A - r.S
  const timelines = r.S - r.C
  const update = r.C - r.floor
  const sum = uwt + setup + timelines + update + r.floor
  console.log(`\n--- ${label} (ms per tick) ---`)
  console.log(`  P            (all on)      ${r.P.toFixed(3)}`)
  console.log(`  A            (uwt off)     ${r.A.toFixed(3)}`)
  console.log(`  S            (+setup off)  ${r.S.toFixed(3)}`)
  console.log(`  C            (+apply off)  ${r.C.toFixed(3)}`)
  console.log(`  floor        (+update off) ${r.floor.toFixed(3)}`)
  console.log(`  => uwt                     ${uwt.toFixed(3)}`)
  console.log(`  => setToSetupPose          ${setup.toFixed(3)}`)
  console.log(`  => timelines + glue        ${timelines.toFixed(3)}`)
  console.log(`  => update                  ${update.toFixed(3)}`)
  console.log(`  sum vs P                   ${sum.toFixed(3)} vs ${r.P.toFixed(3)}  (${Math.abs(sum - r.P) < 0.02 ? 'balances' : 'IMBALANCE'})`)
  return { uwt, setup, timelines, update, floor: r.floor, P: r.P }
}

async function main() {
  const browser = await launch()
  // `talk_end` drives only 2 bone entries but still carries the same 10 slot /
  // 1 deform / 1 sequence timelines as `action` (189 entries). Running the same
  // split on both isolates the per-instance fixed cost from the per-track cost.
  const anim = process.env.ANIM ? `&anim=${process.env.ANIM}` : ''
  let o
  let r
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    page.setDefaultNavigationTimeout(60000)
    o = report(
      `official${anim ? ` [${process.env.ANIM}]` : ''}`,
      await split(page, `http://localhost:${PORT}/official-webgl.html?bench=1${anim}`, '__skelProbeOfficial')
    )
    r = report(`rasen${anim ? ` [${process.env.ANIM}]` : ''}`, await split(page, `http://localhost:${PORT}/rasen-webgl.html?bench=1${anim}`, '__skelProbe'))
  } finally {
    await browser.close()
  }

  console.log(`\nN=${N} ticks=${TICKS} HWGL=${HWGL}  (min of ${ROUNDS} each)`)
  console.log('\n=== gap (rasen - official) ===')
  const rows = [
    ['uwt', r.uwt, o.uwt],
    ['setup', r.setup, o.setup],
    ['timelines+glue', r.timelines, o.timelines],
    ['update', r.update, o.update]
  ]
  for (const [name, rv, ov] of rows) {
    console.log(`  ${name.padEnd(15)} ${rv.toFixed(3).padStart(7)} vs ${ov.toFixed(3).padStart(7)}   ${((rv - ov >= 0 ? '+' : '') + (rv - ov).toFixed(3)).padStart(8)}`)
  }
  console.log(`  ${'TOTAL'.padEnd(15)} ${r.P.toFixed(3).padStart(7)} vs ${o.P.toFixed(3).padStart(7)}   ${((r.P - o.P >= 0 ? '+' : '') + (r.P - o.P).toFixed(3)).padStart(8)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
