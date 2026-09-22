#!/usr/bin/env node
/* eslint-disable */

/**
 * Per-frame render sweep — finds the frames a fixed-state check cannot see.
 *
 * verify-render.mjs compares two fixed animation states (t=0 and 90 steps) and
 * is therefore blind to a defect that only appears on SOME frames: a flash of
 * extra geometry, a one-frame stale mesh, a transient clip leak. Those are
 * exactly the defects that survive a two-state gate, because both sampled states
 * happen to be clean.
 *
 * This sweeps MANY states through the animation, screenshots each one, and diffs
 * every frame against a reference engine at the SAME step index. Stepping is
 * deterministic (`debugStep` advances one FIXED_DELTA per step on every page), so
 * frame N of two pages is the same pose — which is what makes an index-by-index
 * diff meaningful rather than a comparison of two random moments.
 *
 * Modes
 *   pair   <basePage> <candPage> [steps] [query]   per-step diff series
 *   chunks <page> [pose] [query]                   baseline-free determinism
 *
 * `pair` reports where the two engines diverge during the animation. Read the
 * series, not just the total: a defect that flashes shows up as a spike against
 * a near-flat baseline, which a mean would bury.
 *
 * `chunks` needs no reference at all and is the sharper test for a class of bug
 * this repo has already shipped twice: the renderer DECIDING not to upload data
 * because it believes the GPU buffers already hold it (the "clean stream"
 * skip). Reaching the same pose by different numbers of intermediate frames is
 * the same pose through a different upload history. A correct renderer must
 * produce identical pixels; any difference means the upload history leaked into
 * the image.
 *
 * Usage
 *   node sweep-frames.mjs pair official-webgl.html rasen-webgl.html 180
 *   node sweep-frames.mjs pair official-webgl.html rasen-webgl.html 180 'skel=c233_00.skel'
 *   node sweep-frames.mjs chunks rasen-webgl.html 60
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Headless Chrome throttles rAF, which would freeze the animation loops. */
const RAF_POLYFILL = `
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`

const PIXEL_THRESHOLD = 0.1

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

function startServer(port, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['start'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(port), BENCH_READY_SIGNAL: signal },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.on('data', (d) => {
      if (d.toString().includes(signal)) resolve(child)
    })
    child.stderr.on('data', () => {})
    setTimeout(() => reject(new Error('server timeout')), 60000)
  })
}

/**
 * Rasteriser choice.
 *
 * Software GL keeps WebGL deterministic and identical across the two pages, but
 * WebGPU has no swiftshader path: forcing `--use-gl=swiftshader` leaves the
 * WebGPU page rendering an empty canvas (one uniform colour, 0% coverage), which
 * looks exactly like a total rendering regression and is not one.
 *
 * GL=hw swaps in the real GPU plus Dawn's unsafe-API flag, which is what the
 * WebGPU pages need.
 */
const HW_GL = process.env.GL === 'hw'

async function launchBrowser() {
  const options = {
    headless: false,
    defaultViewport: { width: 1360, height: 1360 },
    args: [
      '--headless=new',
      '--window-size=1360,1360',
      '--no-first-run',
      ...(HW_GL
        ? [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan,Metal',
            '--enable-dawn-features=allow_unsafe_apis',
            '--use-angle=metal'
          ]
        : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu'])
    ]
  }
  const chromePath =
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : 'chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

function url(port, page, query) {
  const q = ['bench=1', ...(query ? [query] : [])].join('&')
  return `http://localhost:${port}/${page}?${q}`
}

/**
 * Measure how much of the canvas is actually the character.
 *
 * Background is taken as the MOST COMMON colour, not the top-left pixel. That is
 * not a detail: the first page of a browser session rendered a white canvas with
 * a 10x10 speck of grey at (10,10)-(20,20), so sampling the corner read the
 * speck as "background" and every white pixel as "content" — the gate passed on
 * an empty frame. Comparing against the dominant colour makes an empty canvas
 * measure as empty regardless of what sits in the corner.
 */
async function paintMetrics(el) {
  const png = decode(await el.screenshot({ encoding: 'base64' }))
  const d = png.data
  const W = png.width
  const H = png.height
  const counts = new Map()
  for (let i = 0; i < d.length; i += 4) {
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  let bg = 0
  let best = -1
  for (const [k, c] of counts) {
    if (c > best) {
      best = c
      bg = k
    }
  }
  const br = (bg >> 16) & 255
  const bgg = (bg >> 8) & 255
  const bb = bg & 255
  let n = 0
  let minx = W
  let miny = H
  let maxx = -1
  let maxy = -1
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgg) + Math.abs(d[i + 2] - bb) > 30) {
      n++
      const p = i >> 2
      const px = p % W
      const py = (p / W) | 0
      if (px < minx) minx = px
      if (px > maxx) maxx = px
      if (py < miny) miny = py
      if (py > maxy) maxy = py
    }
  }
  return {
    pct: (n / (W * H)) * 100,
    unique: counts.size,
    bboxW: maxx - minx,
    bboxH: maxy - miny
  }
}

/** A real frame: a decent share of the canvas covered, spread over a real area. */
async function isPainted(el) {
  const m = await paintMetrics(el)
  return m.pct > 5 && m.bboxW > 100 && m.bboxH > 100
}

async function openPage(browser, u) {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(RAF_POLYFILL)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.setDefaultTimeout(30000)

  /** Mount the page and return its canvas handle. */
  const mount = async () => {
    await page.goto(u, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })
    await page.evaluate(() => window.__bench.load())
    const el = await page.$('#app canvas')
    if (!el) throw new Error('no #app canvas — did the page fail to mount?')
    return el
  }

  let el = await mount()

  // The first load in a session races the atlas: with a cold HTTP cache the
  // character can be missing while `load()` has already resolved, and every
  // later page (warm cache) is fine. Reloading until the canvas really holds a
  // character is what keeps that race from being reported as a render defect.
  // Each reload invalidates the previous ElementHandle, so re-query it.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await isPainted(el)) return { page, el, errors }
    if (attempt === 3) break
    const m = await paintMetrics(el)
    console.log(
      `  ↻ canvas not painted (${m.pct.toFixed(2)}% coverage, ${m.bboxW}x${m.bboxH} bbox, ` +
        `${m.unique} colours) — reloading (attempt ${attempt + 2})`
    )
    el = await mount()
  }
  const m = await paintMetrics(el)
  console.log(
    `  ⚠ canvas never painted a character (${m.pct.toFixed(2)}% coverage, ` +
      `${m.bboxW}x${m.bboxH} bbox, ${m.unique} colours) — numbers below are meaningless`
  )
  return { page, el, errors }
}

function decode(b64) {
  return PNG.sync.read(Buffer.from(b64, 'base64'))
}

/** Differing-pixel share between two base64 PNGs, in percent. */
function diffPct(baseB64, candB64) {
  const a = decode(baseB64)
  const b = decode(candB64)
  if (a.width !== b.width || a.height !== b.height) return NaN
  const diff = new PNG({ width: a.width, height: a.height })
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: PIXEL_THRESHOLD,
    alpha: false
  })
  return {
    pct: (n / (a.width * a.height)) * 100,
    pixels: n,
    diffPng: PNG.sync.write(diff)
  }
}

/**
 * Capture one frame per animation step.
 *
 * Frames are kept as base64 PNGs rather than decoded RGBA: a 180-step sweep of a
 * 1024x1024 canvas is ~720MB decoded per series, which is enough to matter; the
 * encoded form is ~100x smaller and decodes in the few milliseconds the next
 * screenshot needs anyway.
 */
async function openAndCapture(browser, u, steps, onFrame) {
  const { page, el, errors } = await openPage(browser, u)
  const first = await el.screenshot({ encoding: 'base64' })
  if (onFrame) await onFrame(0, first)
  for (let i = 1; i <= steps; i++) {
    await page.evaluate(() => window.__bench.debugStep(1))
    const b64 = await el.screenshot({ encoding: 'base64' })
    if (onFrame) await onFrame(i, b64)
  }
  await page.close()
  if (errors.length) console.log(`  ⚠ page errors: ${errors.slice(0, 3).join(' | ')}`)
}

/** Steps whose disagreement is far from the run's own norm, not merely nonzero. */
function outliers(series) {
  const finite = series.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b)
  if (finite.length < 8) return { flagged: [], median: NaN }
  const median = finite[Math.floor(finite.length / 2)]
  const dev = finite.map((v) => Math.abs(v - median)).sort((a, b) => a - b)
  const mad = dev[Math.floor(dev.length / 2)] || 0
  // A flash of geometry is a large excursion; MAD keeps ordinary animation
  // differences between the two runtimes from being reported as defects.
  const cut = median + Math.max(6 * mad, 1.0)
  const flagged = []
  series.forEach((v, i) => {
    if (Number.isFinite(v) && v > cut) flagged.push({ step: i, pct: v })
  })
  flagged.sort((a, b) => b.pct - a.pct)
  return { flagged, median, mad, cut }
}

async function pairMode(browser, port, basePage, candPage, steps, query) {
  console.log(`\n=== per-frame sweep: ${basePage} (reference) vs ${candPage} ===`)
  console.log(`steps=${steps} query="${query || ''}"`)

  const baseFrames = []
  console.log(`▶ capturing reference ${basePage}`)
  await openAndCapture(browser, url(port, basePage, query), steps, async (i, b64) => {
    baseFrames[i] = b64
  })

  const series = new Array(steps + 1).fill(NaN)
  const worst = []
  console.log(`▶ capturing candidate ${candPage}`)
  await openAndCapture(browser, url(port, candPage, query), steps, async (i, b64) => {
    if (!baseFrames[i]) return
    const r = diffPct(baseFrames[i], b64)
    if (!Number.isFinite(r.pct)) return
    series[i] = r.pct
    worst.push({ step: i, pct: r.pct, pixels: r.pixels, diffPng: r.diffPng })
  })

  const { flagged, median, cut } = outliers(series)
  const finite = series.filter((v) => Number.isFinite(v))
  const mean = finite.reduce((a, b) => a + b, 0) / (finite.length || 1)
  const maxIdx = series.indexOf(Math.max(...finite))

  console.log(`\nmedian ${median.toFixed(3)}%  mean ${mean.toFixed(3)}%  max ${Math.max(...finite).toFixed(3)}% (step ${maxIdx})`)

  // The series itself, so the shape is visible: a defect that flashes reads as a
  // spike on a flat line, which a summary statistic hides.
  console.log('\nper-step differing %:')
  const perLine = 15
  for (let s = 0; s < series.length; s += perLine) {
    const chunk = series.slice(s, s + perLine)
    const label = String(s).padStart(3)
    console.log(`  ${label}: ` + chunk.map((v) => (Number.isFinite(v) ? v.toFixed(1) : ' -- ').padStart(6)).join(' '))
  }

  if (flagged.length) {
    console.log(`\n⚠ ${flagged.length} outlier frame(s) above ${cut.toFixed(2)}% (median ${median.toFixed(2)}% + 6*MAD ${(cut - median).toFixed(2)}):`)
    const outDir = path.join(__dirname, 'reports', 'sweep')
    fs.mkdirSync(outDir, { recursive: true })
    for (const f of flagged.slice(0, 10)) {
      const stem = `step${String(f.step).padStart(4, '0')}-${f.pct.toFixed(2)}pct`
      fs.writeFileSync(path.join(outDir, `${stem}-ref.png`), baseFrames[f.step], 'base64')
      const rec = worst.find((w) => w.step === f.step)
      if (rec) fs.writeFileSync(path.join(outDir, `${stem}-diff.png`), rec.diffPng)
      console.log(`   step ${String(f.step).padStart(4)}  ${f.pct.toFixed(3)}%  (${f.pixels} px)  → ${stem}*.png`)
    }
    console.log(`\nimages in ${path.relative(process.cwd(), outDir)}/`)
  } else {
    console.log('\nno outlier frames — the disagreement is uniform across the animation')
  }
  return flagged.length
}

/**
 * Baseline-free determinism check (see the file header). Reaching the same pose
 * through a different number of intermediate frames must give the same pixels.
 */
async function chunksMode(browser, port, pageFile, pose, query) {
  const chunkings = [
    [1], // one frame per step: the most uploads
    [2],
    [5],
    [10],
    [pose] // a single frame at the end: the fewest uploads
  ].filter((c) => c[0] > 0 && pose % c[0] === 0)
  // Deduplicate by paint count per step; what matters is the schedule, not the
  // literal chunk size.
  const seen = new Set()
  const variants = chunkings
    .map((c) => ({ chunk: c[0], paints: Math.round(pose / c[0]) }))
    .filter((v) => (seen.has(v.paints) ? false : seen.add(v.paints)))

  console.log(`\n=== determinism: ${pageFile} at pose ${pose} (query "${query || ''}") ===`)
  console.log(`reaching the same pose via ${variants.map((v) => v.paints + ' paint(s)').join(', ')}\n`)

  const shots = []
  const captureSchedule = async (v, label) => {
    const { page, el, errors } = await openPage(browser, url(port, pageFile, query))
    const t0 = Date.now()
    const remaining = pose
    // Step in `chunk`-sized calls, each followed by a paint (debugStep paints).
    let done = 0
    while (done < remaining) {
      const n = Math.min(v.chunk, remaining - done)
      await page.evaluate((s) => window.__bench.debugStep(s), n)
      done += n
    }
    const b64 = await el.screenshot({ encoding: 'base64' })
    await page.close()
    shots.push({ ...v, b64, ms: Date.now() - t0, errors: errors.length, label })
    if (process.env.DUMP) {
      const outDir = path.join(__dirname, 'reports', 'sweep')
      fs.mkdirSync(outDir, { recursive: true })
      const f = path.join(outDir, `dump-${label.replace(/[^a-z0-9]+/gi, '-')}.png`)
      fs.writeFileSync(f, b64, 'base64')
      console.log(`     dumped ${path.basename(f)} (${Buffer.from(b64, 'base64').length} bytes)`)
    }
    console.log(`  ${label}: ${Date.now() - t0}ms${errors.length ? ` (${errors.length} page errors)` : ''}`)
  }

  for (const v of variants) {
    await captureSchedule(v, `${String(v.paints).padStart(3)} paint(s)`)
  }

  // Control: repeat the FIRST schedule at the end.
  //
  // Without it the result is ambiguous in a way that matters. Every schedule
  // renders through a fresh page, and these pages do real one-time work on their
  // first render in a browser session (program/pipeline compile, atlas upload).
  // So a disagreement could mean "the schedule changed the image" — the bug we
  // are hunting — or merely "the first page rendered differently". Comparing the
  // last capture against the first with the SAME schedule separates the two: if
  // the control matches the others but not its own first run, the schedule is
  // innocent and the difference is a first-page artifact.
  const control = await (async () => {
    const v = variants[0]
    const before = shots.length
    await captureSchedule(v, `${String(v.paints).padStart(3)} paint(s) [control re-run]`)
    return shots[before]
  })()

  const ref = shots[0]
  console.log(`\ncomparing every schedule against ${ref.label}:`)
  const compare = (s, note) => {
    const r = diffPct(ref.b64, s.b64)
    const ok = r.pct < 0.01
    console.log(
      `  ${s.label} vs ${ref.label}: ${r.pct.toFixed(4)}% (${r.pixels} px) ${ok ? 'IDENTICAL' : 'DIFFERENT'}${note}`
    )
    return { r, ok }
  }
  const controlVsRef = compare(control, '  ← sanity control')

  let bad = 0
  for (const s of shots.slice(1)) {
    if (s === control) continue
    const { r, ok } = compare(s, '')
    if (ok) continue
    // Only a difference the control cannot explain is evidence about the schedule.
    if (!controlVsRef.ok) {
      const sameAsControl = diffPct(control.b64, s.b64).pct < 0.01
      if (sameAsControl) {
        console.log('     (agrees with the control re-run → first-page artifact, not a schedule effect)')
        continue
      }
    }
    bad++
    console.log(`     ❌ upload history leaked into the image`)
    const outDir = path.join(__dirname, 'reports', 'sweep')
    fs.mkdirSync(outDir, { recursive: true })
    const stem = `chunks-${s.paints}vpaints`
    fs.writeFileSync(path.join(outDir, `${stem}-a.png`), ref.b64, 'base64')
    fs.writeFileSync(path.join(outDir, `${stem}-b.png`), s.b64, 'base64')
    fs.writeFileSync(path.join(outDir, `${stem}-diff.png`), r.diffPng)
    console.log(`     → ${stem}-{a,b,diff}.png`)
  }

  // Do the non-reference schedules agree with EACH OTHER? If they do, the odd
  // one out is whichever schedule rendered alone, which points at warm-up rather
  // than at a schedule-dependent renderer.
  const others = shots.slice(1).filter((s) => s !== control)
  if (others.length >= 2) {
    let identical = true
    for (let i = 1; i < others.length; i++) {
      if (diffPct(others[0].b64, others[i].b64).pct >= 0.01) identical = false
    }
    console.log(
      identical
        ? `  all ${others.length} non-reference schedules render identically to each other`
        : `  the non-reference schedules do NOT agree with each other`
    )
  }

  console.log(
    bad ? `\n❌ ${bad} schedule(s) disagree — the renderer is not a pure function of the pose` : '\n✅ no schedule-dependent difference'
  )
  return bad
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode !== 'pair' && mode !== 'chunks') {
    console.error('usage: node sweep-frames.mjs pair <basePage> <candPage> [steps] [query]')
    console.error('       node sweep-frames.mjs chunks <page> [pose] [query]')
    process.exit(2)
  }

  const port = await findFreePort()
  const server = await startServer(port, '__BENCH_READY__')
  const browser = await launchBrowser()
  let bad = 0
  try {
    if (mode === 'pair') {
      const [basePage, candPage, stepsArg, query] = rest
      if (!basePage || !candPage) throw new Error('pair needs <basePage> <candPage>')
      bad = await pairMode(browser, port, basePage, candPage, Number(stepsArg || 180), query)
    } else {
      const [pageFile, poseArg, query] = rest
      if (!pageFile) throw new Error('chunks needs <page>')
      bad = await chunksMode(browser, port, pageFile, Number(poseArg || 60), query)
    }
  } finally {
    await browser.close()
    try {
      server.kill('SIGTERM')
    } catch {}
  }
  process.exitCode = bad ? 1 : 0
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
