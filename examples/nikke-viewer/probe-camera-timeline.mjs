#!/usr/bin/env node
/* eslint-disable */

/**
 * Camera timeline for the nikke viewer — renderer agnostic.
 *
 * The reported defect is that the picture moves on its own shortly after a
 * character appears. The camera is the only thing that can move the picture
 * without the animation changing, and the viewer exposes it through
 * `window.__nikkeFitState()`, so this needs no pixels and therefore works for
 * WebGL and WebGPU too — unlike frame capture, which is unreliable for those
 * canvases in this environment.
 *
 * It answers two questions and refuses to conflate them:
 *
 *   1. Does the camera move while the model is ALREADY VISIBLE? Only that is
 *      something a user can see. Moves before the reveal are hidden by the
 *      loading overlay, and moves before the atlas is ready cannot be visible
 *      because nothing is drawing yet.
 *   2. What is moving it? `updateCamera()` depends on fitBounds, pan/zoom and the
 *      stage size, so the probe records all of them and names the culprit
 *      instead of reporting "the camera moved".
 *
 * This is the check that distinguishes "the deployed site is broken" from "this
 * code is broken": the same run against a local dev server and against the
 * deployment, under the same conditions, either both show it or neither does.
 *
 * Usage:
 *   node probe-camera-timeline.mjs [url] [mode] [seconds] [options]
 *     url      defaults to the local dev server
 *     mode     canvas (default) | webgl | webgpu
 *     options  cold     clear HTTP cache + the viewer's cached entry list
 *              slow     throttle the network (THROUGHPUT_KBPS, default 500)
 *
 *   node probe-camera-timeline.mjs http://localhost:5191 webgl 20 cold slow
 *   node probe-camera-timeline.mjs https://nikke-viewer.vercel.app webgl 20 cold slow
 */

import puppeteer from 'puppeteer'

const [urlArg, modeArg, secArg, ...flags] = process.argv.slice(2)
const BASE = urlArg || process.env.VIEWER_URL || 'http://localhost:5191'
const MODE = modeArg || 'canvas'
const SECONDS = Number(secArg || 20)
const COLD = flags.includes('cold')
const SLOW = flags.includes('slow')
const CHAR = process.env.CHAR || 'c405'

const SAMPLER = `
(() => {
  window.__cam = { on: false, samples: [], changes: [] }
  const t0 = performance.now()
  let prev = null
  const tick = () => {
    requestAnimationFrame(tick)
    if (!window.__cam.on) return
    const s = typeof window.__nikkeFitState === 'function' ? window.__nikkeFitState() : null
    if (!s) return
    const now = {
      t: Math.round(performance.now() - t0),
      cam: JSON.stringify(s.camera),
      fit: JSON.stringify(s.fitBounds),
      stageW: s.stageW,
      stageH: s.stageH,
      zoomUser: s.zoomUser,
      panX: s.panX,
      panY: s.panY,
      atlas: !!s.atlasReady,
      framing: s.framing === undefined ? null : !!s.framing,
      pending: !!s.pendingPixelFit,
    }
    window.__cam.samples.push({ t: now.t, cam: now.cam, atlas: now.atlas, framing: now.framing })
    if (prev && prev.cam !== now.cam) {
      const why = []
      if (prev.fit !== now.fit) why.push('fitBounds')
      if (prev.stageW !== now.stageW || prev.stageH !== now.stageH) why.push('stageSize')
      if (prev.zoomUser !== now.zoomUser) why.push('zoomUser')
      if (prev.panX !== now.panX || prev.panY !== now.panY) why.push('pan')
      const f = (v) => { try { const o = JSON.parse(v); return o && typeof o.w === 'number' ? o.w.toFixed(0) : '-' } catch { return '-' } }
      const z = (v) => { try { return (JSON.parse(v).zoom ?? NaN).toFixed(4) } catch { return '-' } }
      window.__cam.changes.push({
        t: now.t,
        why: why.join('+') || 'unknown',
        atlas: now.atlas,
        framing: now.framing,
        pending: now.pending,
        fitW: f(prev.fit) + '->' + f(now.fit),
        zoom: z(prev.cam) + '->' + z(now.cam),
        stage: prev.stageW + 'x' + prev.stageH + '->' + now.stageW + 'x' + now.stageH,
      })
    }
    prev = now
  }
  requestAnimationFrame(tick)
  return true
})()
`

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
    args: [
      '--headless=new',
      '--window-size=1400,900',
      '--use-angle=metal',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,Metal',
      '--enable-dawn-features=allow_unsafe_apis'
    ],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  })
  try {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument((m) => {
      try {
        localStorage.setItem('nikke-viewer:settings', JSON.stringify({ bg: '#181820', renderMode: m }))
      } catch {}
    }, MODE)

    if (COLD) {
      const cdp = await page.createCDPSession()
      await cdp.send('Network.enable')
      await cdp.send('Network.clearBrowserCache')
    }
    if (SLOW) {
      const cdp = await page.createCDPSession()
      await cdp.send('Network.enable')
      const kbps = Number(process.env.THROUGHPUT_KBPS || 500)
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: Number(process.env.LATENCY_MS || 60),
        downloadThroughput: kbps * 1024,
        uploadThroughput: (kbps * 1024) / 3
      })
    }

    // NOFIT=1 disables the pixel fit through the app's own seam. Without this the
    // "control" run measured the same code as the test run and proved nothing —
    // it looked like a passing control while the fit was still active.
    const qs = [COLD ? 'cold=' + Date.now() : null, process.env.NOFIT === '1' ? 'nofit=1' : null].filter(Boolean)
    const url = `${BASE}/char/${CHAR}${qs.length ? '?' + qs.join('&') : ''}`
    const wantFitOff = process.env.NOFIT === '1'
    console.log(`\n=== ${url}`)
    console.log(`    requested mode=${MODE}  pixelFit=${wantFitOff ? 'OFF' : 'on'}  ${SECONDS}s  ${[COLD && 'cold', SLOW && 'throttled'].filter(Boolean).join(' ') || 'warm+fast'} ===`)

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    // Clear the viewer's cached entry list too — a warm list is why a second run
    // shows no layout churn at all.
    if (COLD) {
      await page.evaluate(() => {
        try { localStorage.removeItem('nikke-viewer:entries') } catch {}
      })
    }
    await page.waitForFunction(() => typeof window.__nikkeFitState === 'function', { timeout: 90000 })
    await page.evaluate(SAMPLER)
    await page.evaluate(() => { window.__cam.on = true })
    await new Promise((r) => setTimeout(r, SECONDS * 1000))
    await page.evaluate(() => { window.__cam.on = false })

    const { changes, samples } = await page.evaluate(() => ({
      changes: window.__cam.changes,
      samples: window.__cam.samples
    }))

    const actual = await page.evaluate(() => {
      const s = typeof window.__nikkeFitState === 'function' ? window.__nikkeFitState() : null
      return s ? { mode: s.renderMode, fit: s.pixelFitEnabled, framing: s.framing } : null
    })
    // Print what the APP says, not what was asked for: a mismatched mode or a fit
    // that never noticed the flag invalidates the whole run.
    console.log(`  app reports: renderMode=${actual?.mode}  pixelFitEnabled=${actual?.fit}`)
    if (actual && actual.mode !== MODE) {
      console.log(`  ✗ the page is running ${actual.mode}, not the requested ${MODE} — run invalid`)
      return
    }
    const atlasAt = samples.find((s) => s.atlas)?.t ?? null
    // "Revealed" only means anything once there is something to reveal. Before the
    // atlas is ready `framing` is already false (no fit has been armed yet), so
    // taking the first false sample reported a reveal at 1ms and would have made
    // every later camera change look visible.
    const revealAt = samples.find((s) => s.atlas && s.framing === false)?.t ?? null
    const drawn = samples.filter((s) => s.atlas).length

    console.log(`  frames sampled: ${samples.length}, atlas ready at ${atlasAt === null ? 'never' : atlasAt + 'ms'}, revealed at ${revealAt === null ? 'n/a' : revealAt + 'ms'}`)
    if (!drawn) {
      console.log('  ✗ the model never became ready in this window — nothing to judge')
      return
    }
    console.log(`  camera changes: ${changes.length}`)
    for (const c of changes) {
      const phase = !c.atlas ? 'BEFORE-ATLAS' : c.framing ? 'behind-overlay' : 'VISIBLE'
      console.log(
        `     t=${String(c.t).padStart(6)}ms  [${phase.padEnd(14)}] ${c.why.padEnd(22)} fitW ${c.fitW.padStart(13)}  zoom ${c.zoom}  stage ${c.stage}`
      )
    }
    // Classifying "visible" needs to know whether a loading overlay is still up.
    // The deployed bundle predates that flag, and its absence must NOT be read as
    // "nothing was visible" — that would make this probe print ✅ on exactly the
    // build it is meant to judge. Without the flag the honest assumption is that
    // the model is visible from the moment it is ready, i.e. the worst case.
    const hasFramingFlag = changes.some((c) => c.framing !== null)
    const visible = hasFramingFlag
      ? changes.filter((c) => c.atlas && c.framing === false)
      : changes.filter((c) => c.atlas)
    if (!hasFramingFlag && changes.length) {
      console.log('\n  note: this build does not report the framing gate, so every camera')
      console.log('        change after the model was ready counts as visible (worst case).')
    }
    if (!visible.length) {
      console.log('\n  ✅ no camera movement while the model was visible')
    } else {
      console.log(`\n  ⚠ ${visible.length} camera change(s) while the model WAS VISIBLE:`)
      for (const c of visible) console.log(`     t=${c.t}ms  ${c.why}  zoom ${c.zoom}  stage ${c.stage}`)
    }
    const reasons = {}
    for (const c of changes) reasons[c.why] = (reasons[c.why] || 0) + 1
    console.log(`  causes: ${JSON.stringify(reasons)}`)

    // Exit code so this can be a gate rather than a report nobody reads. A run
    // against a build without the framing gate is still meaningful (it is how the
    // defect was demonstrated), so it is allowed to fail loudly instead of being
    // skipped — `ALLOW_VISIBLE=1` downgrades it for exploratory runs.
    if (visible.length && process.env.ALLOW_VISIBLE !== '1') {
      console.log('\n  → failing: the picture moves on its own while the model is visible')
      process.exitCode = 1
    }
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
