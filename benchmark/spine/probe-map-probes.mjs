#!/usr/bin/env node
/* eslint-disable */

/**
 * Count-based verification, with no timing noise at all.
 *
 * The bisection probe put the deform applier at 0.722 ms/tick but its per-row
 * resolution is only ~0.4 ms, so re-running it could not confirm the fix (rows
 * moved in both directions between runs). Counting the actual Map probes is
 * deterministic: either the applier still walks the slot map every frame or it
 * does not.
 *
 * Wraps `slotMap.get` / `slotMap.has` on the LIVE instance (nothing in the
 * runtime is touched) and reports calls per poseOnly tick.
 *
 * Usage: HWGL=1 node probe-map-probes.mjs [instances] [ticks]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)
const TICKS = Number(process.argv[3] || 100)
const PORT = Number(process.env.PORT || 5179)

function launch() {
  const args = ['--headless=new', '--window-size=1360,1360']
  const options = { args, defaultViewport: { width: 1360, height: 1360 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

async function main() {
  const browser = await launch()
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    page.setDefaultNavigationTimeout(60000)
    await page.goto(`http://localhost:${PORT}/rasen-webgl.html?bench=1`, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
    await page.evaluate(() => window.__bench.load())
    await page.evaluate((n) => window.__bench.createInstances(n), N)

    const r = await page.evaluate(
      async (ticks) => {
        // Patch the live Map instance the skeleton actually uses. Every instance
        // shares one skeletonData, so patching one skeleton's map covers it; to
        // be safe we patch every live instance's map and sum the counters.
        const maps = []
        // The probe exposes one live instance; the others live in the reactive
        // list, which is not reachable from here, so also patch the prototype-
        // free instance we can see and report it as a lower bound.
        const probe = window.__skelProbe
        maps.push(probe.sk.slotMap)
        maps.push(probe.sk.boneMap)
        const counts = { slotMapGet: 0, boneMapGet: 0 }
        const restores = []
        for (const m of maps) {
          const origGet = m.get
          const isSlot = m === probe.sk.slotMap
          m.get = function (k) {
            if (isSlot) counts.slotMapGet++
            else counts.boneMapGet++
            return origGet.call(this, k)
          }
          restores.push(() => {
            m.get = origGet
          })
        }
        await window.__bench.poseOnly(5) // warm
        counts.slotMapGet = 0
        counts.boneMapGet = 0
        const ms = await window.__bench.poseOnly(ticks)
        for (const f of restores) f()
        return { ...counts, ms, instances: window.__bench.instanceCount ? window.__bench.instanceCount() : null }
      },
      TICKS
    )

    console.log(`instances=${N} ticks=${TICKS}   poseOnly ${r.ms.toFixed(3)} ms/tick`)
    console.log('')
    console.log('counted on ONE live instance (probe instance only; the other instances')
    console.log('live in the reactive list and are not reachable for patching, so these')
    console.log(`are a per-instance figure: divide by ${TICKS} ticks)`)
    console.log(`  slotMap.get calls   ${r.slotMapGet}  = ${(r.slotMapGet / TICKS).toFixed(2)} per tick (per instance)`)
    console.log(`  boneMap.get calls   ${r.boneMapGet}  = ${(r.boneMapGet / TICKS).toFixed(2)} per tick (per instance)`)
    console.log('')
    console.log('Before the fix the deform applier alone did 23 slotMap.get per instance')
    console.log('per frame, so ~23 per tick was expected. A figure near 0-2 means the')
    console.log('deform path no longer probes the map every frame.')
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
