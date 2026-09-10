#!/usr/bin/env node
/* eslint-disable */

/**
 * Does each runtime actually call `setToSetupPose` every frame?
 *
 * The telescoping split measured our setup reset at 0.809 ms/tick versus
 * official's 0.029 ms — which looks like "official is 28x faster at the same
 * work", but is far more likely "official does not call it at all in this path,
 * so patching it changes nothing". Count the calls instead of guessing.
 *
 * Zero-invasive: wraps the method on the LIVE prototype, calls through, and
 * restores. Nothing in either runtime is touched.
 *
 * Usage: HWGL=1 node probe-setup-calls.mjs [instances] [ticks]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)
const TICKS = Number(process.argv[3] || 200)
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

async function count(page, url, probeProp) {
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
  await page.evaluate(() => window.__bench.load())
  await page.evaluate((n) => window.__bench.createInstances(n), N)
  return page.evaluate(
    async (prop, ticks) => {
      const inst = window[prop]
      const skProto = Object.getPrototypeOf(inst.sk)
      const orig = skProto.setToSetupPose
      let calls = 0
      skProto.setToSetupPose = function (...a) {
        calls++
        return orig.apply(this, a)
      }
      // Warm up so the count is not skewed by one-off setup work.
      await window.__bench.poseOnly(5)
      calls = 0
      const ms = await window.__bench.poseOnly(ticks)
      skProto.setToSetupPose = orig
      return { calls, ms, instances: window.__bench.instanceCount ? window.__bench.instanceCount() : null }
    },
    probeProp,
    TICKS
  )
}

async function main() {
  const browser = await launch()
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    page.setDefaultNavigationTimeout(60000)
    const expected = N * TICKS
    for (const [label, url, prop] of [
      ['official', `http://localhost:${PORT}/official-webgl.html?bench=1`, '__skelProbeOfficial'],
      ['rasen', `http://localhost:${PORT}/rasen-webgl.html?bench=1`, '__skelProbe'],
    ]) {
      const r = await count(page, url, prop)
      console.log(
        `${label.padEnd(9)} setToSetupPose calls/tick = ${(r.calls / TICKS).toFixed(2).padStart(8)}` +
          `   (${r.calls} total, ${expected} pose applies)   ${r.ms.toFixed(3)} ms/tick`
      )
    }
  } finally {
    await browser.close()
  }
  console.log('')
  console.log('calls/tick == instances  -> the runtime resets every pose (our current behaviour)')
  console.log('calls/tick == 0          -> it never resets; the 0.8 ms "setup" gap is not work,')
  console.log('                            it is a structural difference in what each apply() does')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
