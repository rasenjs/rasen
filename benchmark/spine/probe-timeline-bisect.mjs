#!/usr/bin/env node
/* eslint-disable */

/**
 * In-app bisection of `timelines + glue` (3.04 ms/tick at 200 instances).
 *
 * The isolated probe (probe-layout-cache A_app, shared channels = the app's real
 * configuration) puts our bone-applier loop + sampling at only ~0.95 ms for the
 * same 367 calls per instance. So ~2.1 ms inside `timelines + glue` is
 * unaccounted for, and that bucket is the single largest remaining gap (official
 * spends 1.98 ms on it).
 *
 * The appliers are module-private so they cannot be patched from the page, but
 * the COMPILED structures are derived from the parsed animation data, and a
 * skeleton created AFTER the data changes gets a fresh compile from it (the
 * compile cache is keyed by skeleton). So dropping an applier's input data
 * before the instances exist measures that applier's cost with everything else
 * held fixed — the telescoping idea, applied in-app.
 *
 * Caveat: the single instance created during `load()` keeps its pre-mutation
 * compile, contributing ~0.5% dilution. Every variant has the same dilution, so
 * the DELTAS are clean even though the absolute "full" row is a hair low.
 *
 * Usage: HWGL=1 node probe-timeline-bisect.mjs [instances] [ticks]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)
const TICKS = Number(process.argv[3] || 300)
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

/** Which timelines to strip from the parsed animation before building instances. */
const VARIANTS = [
  { key: 'full', parts: [] },
  { key: 'no bones', parts: ['bones'] },
  { key: 'no slots', parts: ['slots'] },
  { key: 'no deform', parts: ['deform'] },
  { key: 'no sequence', parts: ['sequence'] },
  { key: 'no bones+slots', parts: ['bones', 'slots'] },
  { key: 'no bones+slots+deform+sequence', parts: ['bones', 'slots', 'deform', 'sequence'] },
]

async function runVariant(page, parts) {
  await page.goto(`http://localhost:${PORT}/rasen-webgl.html?bench=1`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
  await page.evaluate(() => window.__bench.load())
  // Strip the requested timeline groups from the parsed animation, then build
  // the instances so their compile sees the reduced data.
  const info = await page.evaluate((toDelete) => {
    const probe = window.__skelProbe
    const name = probe.st.currentAnimation
    const anim = probe.sk.data.animations[name]
    const before = {}
    for (const k of ['bones', 'slots', 'deform', 'sequence', 'events', 'drawOrder', 'ik', 'transform', 'path']) {
      const v = anim[k]
      before[k] = v === undefined ? null : Array.isArray(v) ? v.length : Object.keys(v).length
    }
    for (const k of toDelete) delete anim[k]
    return { name, before }
  }, parts)
  await page.evaluate((n) => window.__bench.createInstances(n), N)
  await page.evaluate((t) => window.__bench.poseOnly(t), 40) // warm up
  let best = Infinity
  for (let r = 0; r < ROUNDS; r++) {
    const ms = await page.evaluate((t) => window.__bench.poseOnly(t), TICKS)
    if (ms < best) best = ms
  }
  return { ms: best, info }
}

async function main() {
  const browser = await launch()
  const out = []
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(90000)
    page.setDefaultNavigationTimeout(90000)
    for (const v of VARIANTS) {
      const r = await runVariant(page, v.parts)
      out.push({ ...v, ...r })
      console.log(`${v.key.padEnd(34)} poseOnly ${r.ms.toFixed(3)} ms/tick`)
    }
    console.log('')
    console.log(`animation "${out[0].info.name}" — parsed timeline groups:`)
    console.log('  ' + JSON.stringify(out[0].info.before))
  } finally {
    await browser.close()
  }

  const full = out[0].ms
  const byKey = new Map(out.map((r) => [r.key, r.ms]))
  console.log('')
  console.log('=== attribution of the total pose cost (ms/tick) ===')
  console.log(`  full pose                       ${full.toFixed(3)}`)
  console.log(`  bones applier + its sampling    ${(full - byKey.get('no bones')).toFixed(3)}`)
  console.log(`  slots applier                   ${(full - byKey.get('no slots')).toFixed(3)}`)
  console.log(`  deform applier                  ${(full - byKey.get('no deform')).toFixed(3)}`)
  console.log(`  sequence applier                ${(full - byKey.get('no sequence')).toFixed(3)}`)
  console.log(`  bones+slots                     ${(full - byKey.get('no bones+slots')).toFixed(3)}`)
  console.log('')
  const none = byKey.get('no bones+slots+deform+sequence')
  console.log(`  all four stripped               ${(full - none).toFixed(3)}`)
  console.log(`  everything else (uwt + setup + dispatch + rest) ${none.toFixed(3)}`)
  console.log('')
  console.log('Reference: official spends 1.976 ms on timelines+glue, we spend 3.03.')
  console.log('Reference: the isolated probe predicted our bone loop+sampling at ~0.95 ms.')
  console.log('If "bones applier" lands far above 0.95 the extra is in-app interaction, not the sampler.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
