#!/usr/bin/env node
/* eslint-disable */

/**
 * Does the clean-stream skip change the image?
 *
 * The renderer may skip re-uploading uv/color/index when the producer declares a
 * stream unchanged. A WRONG declaration renders stale GPU bytes, and a two-state
 * visual gate cannot see it: both sampled states can be clean while the frames in
 * between are not. There is no reference to diff against either, because the
 * "correct" output is what the renderer would have produced WITHOUT the skip.
 *
 * So this produces that reference. `?nocl=1` disables every declaration (see the
 * seam in components/spine.ts), which forces a full upload every frame. Running
 * the same animation twice — skip enabled, skip disabled — and diffing per step
 * is a self-check: the skip is only valid if it changes nothing.
 *
 * The stepping is deterministic (`debugStep` advances one FIXED_DELTA per step
 * on every page), so step N is the same pose in both runs, and an index-by-index
 * comparison is meaningful.
 *
 * Usage:
 *   node verify-clean-stream.mjs [page] [steps] [query]
 *   node verify-clean-stream.mjs rasen-webgl.html 120
 *   node verify-clean-stream.mjs rasen-webgl.html 120 'skel=c233_00.skel'
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

const RAF_POLYFILL = `
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`

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

async function launchBrowser() {
  return puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1100, height: 1100 },
    args: [
      '--headless=new',
      '--window-size=1100,1100',
      '--no-first-run',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader'
    ],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  })
}

/** puppeteer returns screenshots as base64 text; PNG.sync.read needs bytes. */
function pngOf(b64) {
  return PNG.sync.read(Buffer.from(b64, 'base64'))
}

/** Mean channel value + coverage, to tell "blank" from "drawn". */
function stats(b64) {
  const png = pngOf(b64)
  const d = png.data
  const counts = new Map()
  for (let i = 0; i < d.length; i += 4) {
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  let bg = 0
  let best = -1
  for (const [k, c] of counts) if (c > best) ((best = c), (bg = k))
  const br = (bg >> 16) & 255
  const bgg = (bg >> 8) & 255
  const bb = bg & 255
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgg) + Math.abs(d[i + 2] - bb) > 30) n++
  }
  return { coverage: (n / (png.width * png.height)) * 100, colours: counts.size }
}

/**
 * Report what a capture actually contains.
 *
 * A blank or half-loaded capture used to surface only as "not enough drawn
 * frames", which does not distinguish "the page failed to render" from "the
 * comparison logic is wrong" — and those need opposite fixes.
 */
function reportCoverage(label, frames) {
  const picks = [0, 1, Math.floor(frames.length / 2), frames.length - 1]
  const parts = picks.map((i) => {
    const s = stats(frames[i])
    return `#${i}:${s.coverage.toFixed(1)}%/${s.colours}c`
  })
  console.log(`  ${label}: ${frames.length} frames — coverage ${parts.join('  ')}`)
}

function diffPct(a, b) {
  const pa = pngOf(a)
  const pb = pngOf(b)
  if (pa.width !== pb.width || pa.height !== pb.height) return null
  const out = new PNG({ width: pa.width, height: pa.height })
  const n = pixelmatch(pa.data, pb.data, out.data, pa.width, pa.height, {
    threshold: 0.1,
    alpha: false
  })
  return { pct: (n / (pa.width * pa.height)) * 100, pixels: n, diffPng: PNG.sync.write(out) }
}

/**
 * Fraction of the canvas that is not the dominant colour.
 *
 * An unmistakably blank spine frame is 52 colours with a speck in the corner,
 * against ~47000 for a real character, so this separates them decisively.
 */
function paintedFraction(b64) {
  const png = pngOf(b64)
  const d = png.data
  const counts = new Map()
  for (let i = 0; i < d.length; i += 4) {
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  let bg = 0
  let best = -1
  for (const [k, c] of counts) if (c > best) ((best = c), (bg = k))
  const br = (bg >> 16) & 255
  const bgg = (bg >> 8) & 255
  const bb = bg & 255
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgg) + Math.abs(d[i + 2] - bb) > 30) n++
  }
  return n / (png.width * png.height)
}

async function capture(browser, base, pageFile, steps, query) {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(RAF_POLYFILL)
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 140)))

  const url = `${base}/${pageFile}?bench=1${query ? '&' + query : ''}`
  const mount = async () => {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })
    await page.evaluate(() => window.__bench.load())
    await new Promise((r) => setTimeout(r, 900))
    const el = await page.$('#app canvas')
    if (!el) throw new Error('no #app canvas')
    return el
  }

  let el = await mount()
  // The first load in a browser session can come up blank while `load()` has
  // already resolved (the atlas is fetched separately and a cold cache lags).
  // Comparing a blank run against a drawn one would report a difference that
  // has nothing to do with the skip, so require a drawn canvas before sampling.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (paintedFraction(await el.screenshot({ encoding: 'base64' })) > 0.05) break
    if (attempt === 3) break
    console.log(`  ↻ blank canvas — reloading (attempt ${attempt + 2})`)
    el = await mount()
  }

  const frames = [await el.screenshot({ encoding: 'base64' })]
  for (let i = 1; i <= steps; i++) {
    await page.evaluate(() => window.__bench.debugStep(1))
    frames.push(await el.screenshot({ encoding: 'base64' }))
  }
  await page.close()
  return frames
}

async function main() {
  const [pageFile = 'rasen-webgl.html', stepsArg = '120', query] = process.argv.slice(2)
  const steps = Number(stepsArg)
  const port = await findFreePort()
  const server = await startServer(port, '__BENCH_READY__')
  const browser = await launchBrowser()

  try {
    const base = `http://localhost:${port}`
    console.log(`\n=== clean-stream skip vs full upload: ${pageFile}, ${steps} steps ===`)
    console.log(`query "${query || ''}"\n`)

    console.log('▶ with skip (default)')
    const withSkip = await capture(browser, base, pageFile, steps, query)
    reportCoverage('with skip', withSkip)
    console.log('▶ without skip (?nocl=1 — every stream uploaded every frame)')
    const noSkip = await capture(browser, base, pageFile, steps, `${query ? query + '&' : ''}nocl=1`)
    reportCoverage('no skip', noSkip)

    const series = []
    const worst = []
    for (let i = 0; i < Math.min(withSkip.length, noSkip.length); i++) {
      const s = stats(withSkip[i])
      if (s.coverage < 1) continue
      const r = diffPct(withSkip[i], noSkip[i])
      if (!r) continue
      series.push(r.pct)
      worst.push({ step: i, pct: r.pct, pixels: r.pixels, diffPng: r.diffPng })
    }
    if (series.length < 8) {
      console.log('\nnot enough drawn frames to compare — is the page rendering?')
      process.exitCode = 1
      return
    }

    const sorted = series.slice().sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const mean = series.reduce((a, b) => a + b, 0) / series.length
    const max = Math.max(...series)
    console.log(
      `\ndifference (skip vs no-skip): median ${median.toFixed(4)}%  mean ${mean.toFixed(4)}%  max ${max.toFixed(4)}%`
    )

    console.log('\nper-step difference %:')
    for (let s = 0; s < series.length; s += 15) {
      const chunk = series.slice(s, s + 15)
      console.log(`  ${String(s).padStart(4)}: ` + chunk.map((v) => v.toFixed(2).padStart(7)).join(' '))
    }

    const outDir = path.join(__dirname, 'reports', 'clean-stream')
    const changed = worst.filter((w) => w.pct > 0)
    if (!changed.length) {
      console.log('\n✅ every frame is identical with and without the skip — the declarations are sound')
      process.exitCode = 0
      return
    }

    fs.mkdirSync(outDir, { recursive: true })
    changed.sort((a, b) => b.pct - a.pct)
    console.log(
      `\n❌ ${changed.length}/${series.length} steps differ — a skipped upload was NOT redundant:`
    )
    for (const w of changed.slice(0, 12)) {
      console.log(`   step ${String(w.step).padStart(4)}  ${w.pct.toFixed(3)}%  (${w.pixels} px)`)
    }
    const top = changed[0]
    fs.writeFileSync(path.join(outDir, `step${top.step}-withskip.png`), withSkip[top.step], 'base64')
    fs.writeFileSync(path.join(outDir, `step${top.step}-noskip.png`), noSkip[top.step], 'base64')
    fs.writeFileSync(path.join(outDir, `step${top.step}-diff.png`), top.diffPng)
    fs.writeFileSync(
      path.join(outDir, 'series.tsv'),
      'step\tdiffPct\n' + worst.map((w) => `${w.step}\t${w.pct.toFixed(4)}`).join('\n')
    )
    console.log(`\nworst step images + series in ${path.relative(process.cwd(), outDir)}/`)
    process.exitCode = 1
  } finally {
    await browser.close()
    try {
      server.kill('SIGTERM')
    } catch {}
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
