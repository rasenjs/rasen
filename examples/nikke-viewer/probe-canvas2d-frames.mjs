#!/usr/bin/env node
/* eslint-disable */

/**
 * Frame-by-frame glitch detector for the Canvas 2D renderer.
 *
 * The viewer's default renderer is Canvas 2D, and it takes a completely separate
 * code path from the WebGL/WebGPU ones (`@rasenjs/canvas-2d`'s spine component:
 * per-triangle affine + clip + full-atlas drawImage). Until now every probe here
 * forced `renderMode: webgl`, so that path was never exercised.
 *
 * Canvas 2D is also the one mode where this is TRACTABLE: the canvas is a 2D
 * context, so `getImageData` reads back real pixels synchronously. For WebGL and
 * WebGPU the same capture was impossible in this environment (a 2D `drawImage`
 * of those canvases reads back empty; CDP screencast delivered one frame per
 * session), which is why the earlier investigation could only look at fixed
 * states.
 *
 * Strategy, all inside the page per frame (cheap enough to run every frame):
 *   - a 32x32 thumbnail for every frame, so the whole sequence can be compared,
 *   - a ring buffer of larger frames, so the moments around a glitch can be
 *     dumped after the fact.
 * A glitch is a frame whose difference from BOTH neighbours is far above the
 * local norm — the picture changed and changed back.
 *
 * Usage:
 *   node probe-canvas2d-frames.mjs [char] [seconds] [throttle]
 *     throttle  'slow' emulates the deployed site's network, where the atlas
 *               arrives seconds into the animation
 *   node probe-canvas2d-frames.mjs c405 12 slow
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const VIEWER_URL = process.env.VIEWER_URL || 'http://localhost:5191'

/**
 * Per-frame recorder. Runs in the page.
 *
 * Thumbnails are 32x32 RGBA arrays (4KB each) and are kept for every frame; the
 * ring keeps 12 frames at 384x384 so a glitch can be looked at in detail without
 * holding the whole run at full resolution.
 */
const RECORDER = `
(() => {
  const RING = 12
  const THUMB = 32
  const BIG = 384
  const cv = document.querySelector('canvas')
  if (!cv) return { error: 'no canvas' }
  if (cv.getContext('2d') == null && cv.dataset.ctx !== '2d') {
    // A webgl/webgpu canvas here would silently read back as empty; say so.
    const gl = cv.getContext('webgl2') || cv.getContext('webgl')
    if (gl) return { error: 'canvas is a WebGL context — this probe needs renderMode "canvas"' }
  }
  const rec = window.__rec2d = { on: false, thumbs: [], cam: [], ring: [], ringAt: [],
                                 camShots: [], n: 0, err: null, prevSnap: null,
                                 big: document.createElement('canvas'), size: cv.width + 'x' + cv.height }
  rec.big.width = BIG; rec.big.height = BIG
  const bctx = rec.big.getContext('2d', { willReadFrequently: true })
  const small = document.createElement('canvas')
  small.width = THUMB; small.height = THUMB
  const sctx = small.getContext('2d', { willReadFrequently: true })

  const tick = () => {
    // Reschedule FIRST, unconditionally. Returning early while recording is off
    // used to skip the reschedule, so if the first tick landed before the caller
    // enabled recording the loop died permanently — the same run alternated
    // between 720 frames and 0 frames depending on that race.
    requestAnimationFrame(tick)
    if (!rec.on) return
    try {
      // Same-origin atlas, so no taint issues here.
      sctx.clearRect(0, 0, THUMB, THUMB)
      sctx.drawImage(cv, 0, 0, THUMB, THUMB)
      rec.thumbs.push(Array.from(sctx.getImageData(0, 0, THUMB, THUMB).data))
      // Camera/fit state alongside the pixels. A camera re-fit is a ONE-frame
      // jump that stays (unlike a glitch, which changes and comes back), so the
      // two have to be correlated rather than inferred from the deltas alone.
      const st = typeof window.__nikkeFitState === 'function' ? window.__nikkeFitState() : null
      const camNow = {
        cam: st ? JSON.stringify(st.camera) : null,
        fit: st ? JSON.stringify(st.fitBounds) : null,
        pending: st ? !!st.pendingPixelFit : null
      }
      const camPrev = rec.cam[rec.cam.length - 1]
      camNow.framing = st ? !!st.framing : null
      rec.cam.push(camNow)
      bctx.clearRect(0, 0, BIG, BIG)
      bctx.drawImage(cv, 0, 0, BIG, BIG)
      const snap = document.createElement('canvas')
      snap.width = BIG; snap.height = BIG
      snap.getContext('2d').drawImage(rec.big, 0, 0)
      // A camera re-fit is the suspect, and it is rare and finish-line-timed, so
      // capture the frames on both sides of it as they happen instead of hoping a
      // ring buffer still holds them. This is what turns "the delta jumped" into
      // "here is the picture before and after".
      if (camPrev && camNow.cam !== null && (camPrev.cam !== camNow.cam || camPrev.fit !== camNow.fit)) {
        rec.camShots.push({
          frame: rec.n,
          reason: [camPrev.cam !== camNow.cam ? 'camera' : null, camPrev.fit !== camNow.fit ? 'fitBounds' : null].filter(Boolean).join('+'),
          before: rec.prevSnap ? rec.prevSnap.toDataURL('image/png') : null,
          after: snap.toDataURL('image/png')
        })
      }
      rec.prevSnap = snap
      rec.ring.push(snap)
      rec.ringAt.push(rec.n)
      if (rec.ring.length > RING) { rec.ring.shift(); rec.ringAt.shift() }
      rec.n++
    } catch (e) { rec.err = String(e) }
  }
  requestAnimationFrame(tick)
  window.__grabRing = () => ({ frames: rec.ring.map((c) => c.toDataURL('image/png')), at: rec.ringAt.slice() })
  window.__grabCamShots = () => rec.camShots.map((x) => ({ frame: x.frame, reason: x.reason, before: x.before, after: x.after }))
  return { ok: true, size: rec.size }
})()
`

async function run(char, seconds, throttle) {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1200, height: 900 },
    args: [
      '--headless=new',
      '--window-size=1200,900',
      // Software GL: the canvas path must not depend on the GPU, and this keeps
      // runs reproducible.
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader'
    ],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  })
  try {
    const page = await browser.newPage()
    if (throttle === 'slow') {
      const cdp = await page.createCDPSession()
      await cdp.send('Network.enable')
      // Throughput is tunable because the interesting variable is not "slow" but
      // "the atlas arrives SECONDS after the animation started". Too aggressive a
      // throttle just fails the load (900 kbit/s could not fetch a 4.4 MB atlas
      // plus 700 thumbnails within two minutes); home-broadband rates put the
      // atlas a handful of seconds in, which is the deployed condition.
      const kbps = Number(process.env.THROUGHPUT_KBPS || 500)
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: Number(process.env.LATENCY_MS || 60),
        downloadThroughput: (kbps * 1024) / 1,
        uploadThroughput: (kbps * 1024) / 3
      })
      console.log(`  throttling to ${kbps} KB/s down, ${process.env.LATENCY_MS || 60}ms latency`)
    }
    // The renderer is read from localStorage at boot, so it must be set first.
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('nikke-viewer:settings', JSON.stringify({ bg: '#181820', renderMode: 'canvas' }))
      } catch {}
    })
    page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 160)))

    // NOFIT=1 adds ?nofit=1, which disables the pixel fit — the A/B that decides
    // whether the fit is what re-frames the character mid-animation.
    const extra = process.env.NOFIT === '1' ? '?nofit=1' : ''
    await page.goto(`${VIEWER_URL}/char/${char}${extra}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 60000 })

    // Wait for the MODEL, not a fixed sleep. Prerendering the character list
    // fires hundreds of thumbnail requests, so the atlas can land well after 10s;
    // a fixed window made the probe report "canvas is empty" and sent me looking
    // for a rendering failure that was really just an impatient test.
    await page.waitForFunction(
      () => {
        const s = window.__nikkeFitState
        if (typeof s !== 'function') return false
        const st = s()
        return !!(st && st.atlasReady && st.skeletonReady)
      },
      { timeout: 120000, polling: 250 }
    )

    const installed = await page.evaluate(RECORDER)
    if (installed?.error) {
      console.log(`  ✗ ${installed.error}`)
      await page.close()
      return null
    }
    console.log(`  canvas ${installed.size}, renderMode=canvas, network=${throttle}`)

    await page.evaluate(() => { window.__rec2d.on = true })
    await new Promise((r) => setTimeout(r, seconds * 1000))
    await page.evaluate(() => { window.__rec2d.on = false })

    const info = await page.evaluate(() => ({ n: window.__rec2d.n, err: window.__rec2d.err }))
    if (info.err) console.log(`  ⚠ recorder error: ${info.err}`)
    console.log(`  recorded ${info.n} frames`)

    const thumbs = await page.evaluate(() => window.__rec2d.thumbs)
    if (thumbs.length < 30) {
      console.log('  too few frames to analyse')
      await page.close()
      return null
    }

    // Before looking for spikes, establish that there is anything to look at.
    // An all-identical series means either the character is not animating or the
    // canvas never got drawn, and those are different problems: report which.
    const describe = (thumb) => {
      const colors = new Set()
      let sum = 0
      for (let i = 0; i < thumb.length; i += 4) {
        colors.add((thumb[i] << 16) | (thumb[i + 1] << 8) | thumb[i + 2])
        sum += thumb[i] + thumb[i + 1] + thumb[i + 2]
      }
      return { colours: colors.size, mean: +(sum / (thumb.length / 4) / 3).toFixed(1) }
    }
    const first = describe(thumbs[0])
    const mid = describe(thumbs[Math.floor(thumbs.length / 2)])
    const state = await page.evaluate(() => {
      const s = window.__nikkeFitState ? window.__nikkeFitState() : null
      return {
        atlasReady: !!s?.atlasReady,
        skeletonReady: !!s?.skeletonReady,
        renderMode: s?.renderMode,
        status: (/Loading [^\n]*|Failed [^\n]*/.exec(document.body.innerText || '') || [])[0] || null
      }
    })
    console.log(
      `  canvas content: first ${first.colours} colours (mean ${first.mean}), mid ${mid.colours} colours (mean ${mid.mean})`
    )
    console.log(`  viewer state: ${JSON.stringify(state)}`)
    if (first.colours <= 2 || mid.colours <= 2) {
      console.log('  ✗ the canvas is effectively EMPTY — the model did not render, so there is nothing to analyse')
      await page.close()
      return null
    }

    // Per-frame difference between consecutive frames.
    const deltas = []
    for (let i = 1; i < thumbs.length; i++) {
      let sum = 0
      const a = thumbs[i - 1]
      const b = thumbs[i]
      for (let k = 0; k < a.length; k++) sum += Math.abs(a[k] - b[k])
      deltas.push(sum / a.length)
    }
    const sorted = deltas.slice().sort((x, y) => x - y)
    const median = sorted[Math.floor(sorted.length / 2)]
    const dev = sorted.map((v) => Math.abs(v - median)).sort((x, y) => x - y)
    const mad = dev[Math.floor(dev.length / 2)] || 0
    const p95 = sorted[Math.floor(sorted.length * 0.95)]

    // TWO shapes matter, and they need different tests:
    //  - a glitch: this frame differs from both neighbours, i.e. it changed and
    //    came back;
    //  - a camera re-fit: ONE frame jumps and the new framing STAYS, so the next
    //    delta is ordinary. The change-and-back test cannot see this at all,
    //    which is why an earlier version of this probe reported "no spike" on a
    //    run whose largest delta was 5x the median.
    const jumpCut = Math.max(median + 8 * mad, p95 * 1.6)
    const jumps = []
    const glitches = []
    for (let i = 1; i < deltas.length - 1; i++) {
      const here = deltas[i]
      const next = deltas[i + 1]
      const prev = deltas[i - 1]
      if (here > jumpCut && next > jumpCut && prev < here * 0.5) {
        glitches.push({ frame: i + 1, out: here, back: next, before: prev })
      } else if (here > jumpCut) {
        jumps.push({ frame: i + 1, delta: here, prev, next })
      }
    }

    const cam = await page.evaluate(() => window.__rec2d.cam)
    // The fit's own numbers, round by round. Whether the iterations CONVERGE or
    // oscillate decides the fix: a converging fit only needs to not be seen, an
    // oscillating one is wrong arithmetic and has to be fixed.
    const fmt = (v) => {
      if (!v) return 'null'
      try {
        const o = JSON.parse(v)
        return Object.entries(o).map(([k, n]) => `${k}=${typeof n === 'number' ? n.toFixed(1) : n}`).join(' ')
      } catch { return String(v) }
    }
    console.log('  fit timeline (first 40 frames; only rows where it changed):')
    let lastFit = null
    for (let i = 0; i < Math.min(40, cam.length); i++) {
      const f = cam[i]?.fit
      if (f === lastFit) continue
      lastFit = f
      console.log(`     frame ${String(i).padStart(3)}  fitBounds { ${fmt(f)} }`)
    }
    const camChanges = []
    for (let i = 1; i < cam.length; i++) {
      const before = cam[i - 1]
      const after = cam[i]
      if (!before || !after) continue
      const what = []
      if (before.cam !== after.cam) what.push('camera')
      if (before.fit !== after.fit) what.push('fitBounds')
      if (before.pending !== after.pending) what.push('pending=' + after.pending)
      if (what.length) camChanges.push({ frame: i, what: what.join('+'), deltaAt: deltas[i - 1] ?? null })
    }

    console.log(`  frame delta: median ${median.toFixed(2)} MAD ${mad.toFixed(2)} p95 ${p95.toFixed(2)} max ${Math.max(...sorted).toFixed(2)} (0-255)`)
    console.log(`  jump threshold ${jumpCut.toFixed(2)}`)
    // The property the fix must establish: once the model is REVEALED (framing
    // finished), the camera must not move again on its own. Camera re-framing
    // behind the overlay is fine — that is the whole point of the gate.
    const revealFrame = cam.findIndex((c) => c && c.framing === false)
    const camAfterReveal = camChanges.filter((c) => revealFrame >= 0 && c.frame > revealFrame)
    console.log(`  reveal: framing finished at frame ${revealFrame >= 0 ? revealFrame : 'n/a'} (after that the model is visible)`)
    console.log(`  camera/fit changes: ${camChanges.length} total, ${camAfterReveal.length} AFTER reveal`)
    if (camAfterReveal.length) {
      for (const c of camAfterReveal.slice(0, 6)) console.log(`     ⚠ frame ${c.frame} ${c.what} (delta ${c.deltaAt === null ? 'n/a' : c.deltaAt.toFixed(2)})`)
    } else if (revealFrame >= 0) {
      console.log('  ✅ the camera never moves after the model is revealed')
    }
    // The criterion that actually matters: the biggest frame-to-frame change a
    // user can SEE. Everything before the reveal is behind the overlay.
    if (revealFrame >= 0) {
      // Only deltas between two CONSECUTIVE VISIBLE frames count. A change from a
      // covered frame to the first visible one is not something a user can see —
      // they never saw the covered state — so including it (as an earlier version
      // did) reports a jump that cannot happen.
      const visible = []
      for (let i = 1; i < deltas.length; i++) {
        const a = cam[i - 1]
        const b = cam[i]
        if (a && b && a.framing === false && b.framing === false) visible.push(deltas[i])
      }
      if (!visible.length) {
        console.log('  no two consecutive visible frames recorded')
      } else {
        const maxVisible = Math.max(...visible)
        const sortedVisible = visible.slice().sort((x, y) => x - y)
        const medVisible = sortedVisible[Math.floor(sortedVisible.length / 2)]
        const ratio = maxVisible / medVisible
        console.log(
          `  visible frames: ${visible.length}, max delta ${maxVisible.toFixed(2)} vs median ${medVisible.toFixed(2)} ` +
            `(${ratio.toFixed(1)}x)${ratio < 3 ? '  ✅ no visible jump' : '  ⚠ still a visible jump'}`
        )
      }
    }
    for (const c of camChanges.slice(0, 12)) {
      console.log(`     frame ${String(c.frame).padStart(4)}  ${c.what.padEnd(26)} delta at that frame: ${c.deltaAt === null ? 'n/a' : c.deltaAt.toFixed(2)}`)
    }
    if (glitches.length) {
      console.log(`  ⚠ ${glitches.length} change-and-back glitch(es):`)
      for (const g of glitches.slice(0, 8)) console.log(`     frame ${g.frame}  out ${g.out.toFixed(1)} back ${g.back.toFixed(1)} before ${g.before.toFixed(1)}`)
    } else {
      console.log('  no change-and-back glitch')
    }
    if (jumps.length) {
      console.log(`  ${jumps.length} one-frame jump(s) (stayed, did not come back):`)
      for (const j of jumps.slice(0, 10)) console.log(`     frame ${String(j.frame).padStart(4)}  delta ${j.delta.toFixed(2)} (prev ${j.prev.toFixed(2)} next ${j.next.toFixed(2)})`)
    }

    const interesting = [...glitches.map((g) => g.frame), ...jumps.map((j) => j.frame)]
    if (interesting.length) {
      const outDir = path.join(__dirname, 'reports', 'canvas2d-flicker')
      fs.mkdirSync(outDir, { recursive: true })
      const grabbed = await page.evaluate(() => window.__grabRing())
      grabbed.frames.forEach((b64, i) => {
        fs.writeFileSync(
          path.join(outDir, `frame-${String(grabbed.at[i]).padStart(4, '0')}.png`),
          Buffer.from(b64.split(',')[1], 'base64')
        )
      })
      console.log(`  ring frames ${JSON.stringify(grabbed.at)} → ${path.relative(process.cwd(), outDir)}/`)
      // Frames on both sides of every camera re-fit.
      const shots = await page.evaluate(() => window.__grabCamShots())
      for (const sh of shots) {
        const tag = `cam-${String(sh.frame).padStart(4, '0')}-${sh.reason.replace('+', '_')}`
        if (sh.before) fs.writeFileSync(path.join(outDir, `${tag}-before.png`), Buffer.from(sh.before.split(',')[1], 'base64'))
        fs.writeFileSync(path.join(outDir, `${tag}-after.png`), Buffer.from(sh.after.split(',')[1], 'base64'))
      }
      if (shots.length) console.log(`  ${shots.length} camera re-fit frame pair(s) saved (…-before.png / …-after.png)`)
      fs.writeFileSync(
        path.join(outDir, 'deltas.tsv'),
        'frame\tdelta\tcameraChange\n' +
          deltas.map((d, i) => `${i + 1}\t${d.toFixed(3)}\t${camChanges.some((c) => c.frame === i + 1) ? camChanges.find((c) => c.frame === i + 1).what : ''}`).join('\n')
      )
    }
    await page.close()
    return { frames: thumbs.length, glitches: 0, median, mad }
  } finally {
    await browser.close()
  }
}

async function main() {
  const [char = 'c405', secArg = '12', throttle = 'none'] = process.argv.slice(2)
  console.log(`\n=== canvas2d flicker probe: /char/${char}, ${secArg}s, network=${throttle}, pixelFit=${process.env.NOFIT === '1' ? 'OFF' : 'on'} ===`)
  await run(char, Number(secArg), throttle)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
