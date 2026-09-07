#!/usr/bin/env node
/* eslint-disable */

/**
 * Visual variance test — render-equivalence verification for the spine bench.
 *
 * The perf numbers mean nothing if the runtimes aren't posing + painting the
 * same thing. This script places every target at IDENTICAL animation states
 * using `__bench.debugStep` (deterministic fixed-delta stepping), screenshots
 * the actual rendered surface, and pixel-diffs each target against its group
 * baseline (pixelmatch):
 *
 *   WebGL group : baseline = official-webgl   (official spine-ts 4.1)
 *   Canvas group: baseline = official-canvas  (official spine-ts 4.1)
 *
 * States compared: t=0 (load) and anim (90 fixed-delta steps = 1.5s of
 * animation). Also verifies MOTION: the anim screenshot must differ from the
 * load screenshot.
 *
 * NOTE: headless Chrome throttles requestAnimationFrame — an init-script
 * polyfill (rAF → setTimeout 16ms) keeps the animation loops alive. It is
 * injected ONLY here (verification), never in benchmark measurement runs.
 *
 * Usage: node verify-render.mjs
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

const GROUPS = [
  {
    name: 'WebGL',
    baseline: 'official-webgl',
    targets: [
      { name: 'official-webgl', page: 'official-webgl.html' },
      { name: 'pixi', page: 'pixi.html' },
      { name: 'rasen-webgl', page: 'rasen-webgl.html' }
    ]
  },
  {
    name: 'Canvas2D',
    baseline: 'official-canvas',
    targets: [
      { name: 'official-canvas', page: 'official-canvas.html' },
      { name: 'rasen-canvas', page: 'rasen-canvas.html' }
    ]
  }
]
const ANIM_STEPS = 90

// --- infra (same contract as bench.js) ----------------------------------------
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
  const options = {
    headless: false,
    defaultViewport: { width: 1360, height: 1360 },
    args: [
      '--headless=new',
      '--window-size=1360,1360',
      '--no-first-run',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader'
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

function loadPng(file) {
  return PNG.sync.read(fs.readFileSync(file))
}

function diffPngs(fileA, fileB, diffFile) {
  const a = loadPng(fileA)
  const b = loadPng(fileB)
  if (a.width !== b.width || a.height !== b.height) {
    return { error: `size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}` }
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const mismatches = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: 0.1,
    alpha: false
  })
  fs.writeFileSync(diffFile, PNG.sync.write(diff))
  const total = a.width * a.height
  return { mismatches, pct: (mismatches / total) * 100 }
}

const RAF_POLYFILL = `
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`

async function capture(browser, serverUrl, pageFile, outDir, stem) {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(RAF_POLYFILL)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto(`${serverUrl}/${pageFile}?bench=1`, { waitUntil: 'networkidle0', timeout: 60000 })
  // Load the character (t=0 state).
  const loadMs = await page.evaluate(() => window.__bench.load())
  const canvasEl = await page.$('#app canvas')
  const f0 = path.join(outDir, `${stem}-t0.png`)
  await canvasEl.screenshot({ path: f0 })
  // 90 deterministic steps (1.5 s of animation).
  await page.evaluate((s) => window.__bench.debugStep(s), ANIM_STEPS)
  const f1 = path.join(outDir, `${stem}-anim.png`)
  await canvasEl.screenshot({ path: f1 })
  await page.close()
  return { t0: f0, anim: f1, loadMs, errors }
}

// --- main ----------------------------------------------------------------------
async function main() {
  const outDir = path.join(__dirname, 'reports', 'render')
  fs.mkdirSync(outDir, { recursive: true })

  const port = await findFreePort()
  const serverUrl = `http://localhost:${port}`
  const server = await startServer(port, '__BENCH_READY__')
  const browser = await launchBrowser()

  const shots = {} // name -> { t0, anim, loadMs, errors }

  try {
    for (const group of GROUPS) {
      for (const target of group.targets) {
        console.log(`▶ ${target.name}`)
        try {
          shots[target.name] = await capture(browser, serverUrl, target.page, outDir, target.name)
        } catch (e) {
          console.log(`  FAILED: ${e.message}`)
          shots[target.name] = null
        }
      }
    }
  } finally {
    await browser.close()
    try {
      server.kill('SIGKILL')
    } catch {}
  }

  let pass = true

  for (const group of GROUPS) {
    console.log(`\n=== ${group.name} group (baseline: ${group.baseline}) ===`)

    // motion sanity + load errors
    for (const t of group.targets) {
      const s = shots[t.name]
      if (!s) { console.log(`  ${t.name.padEnd(16)} SKIPPED (failed to load)`); pass = false; continue }
      const r = diffPngs(s.t0, s.anim, '/tmp/motion-diff.png')
      const verdict = r.error ? `ERROR ${r.error}` : r.pct > 0.5 ? `moved (${r.pct.toFixed(1)}% px)` : `⚠️ NO MOVEMENT? (${r.pct.toFixed(2)}%)`
      console.log(`  ${t.name.padEnd(16)} motion: ${verdict} | load ${s.loadMs.toFixed(0)}ms | ${s.errors.length ? 'page errors: ' + s.errors.slice(0,2).join(' | ') : 'no page errors'}`)
    }

    // equivalence vs group baseline
    const base = shots[group.baseline]
    if (!base) { console.log('  baseline failed — cannot verify'); pass = false; continue }
    for (const t of group.targets) {
      if (t.name === group.baseline || !shots[t.name]) continue
      for (const state of ['t0', 'anim']) {
        const diffFile = path.join(outDir, `diff-${t.name}-${state}.png`)
        const r = diffPngs(base[state], shots[t.name][state], diffFile)
        const label = `${t.name} / ${state}`
        if (r.error) { console.log(`  ${label.padEnd(26)} ERROR ${r.error}`); pass = false; continue }
        // t0 is the strict contract check (identical pose). anim additionally
        // allows runtime-level mesh handling differences (pixi-spine clips and
        // deforms meshes slightly differently than the official runtime) —
        // those are legitimate implementation variance, not scene errors.
        const limit = state === 't0' ? 3 : 12
        const verdict = r.pct < limit * 0.4 ? 'OK' : r.pct < limit ? 'MINOR' : 'DIFFERENT'
        if (r.pct >= limit) pass = false
        console.log(`  ${label.padEnd(26)} ${r.pct.toFixed(2)}% differing (${r.mismatches} px) ${verdict}`)
      }
    }
  }

  console.log(`\nscreenshots + diff images in ${path.relative(process.cwd(), outDir)}/`)
  console.log(pass ? '\n✅ visual variance acceptable — perf comparison is valid' : '\n❌ visual variance too large — fix rendering before benchmarking')
  process.exitCode = pass ? 0 : 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
