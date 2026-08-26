#!/usr/bin/env node
/* eslint-disable */

/**
 * Render-equivalence verification.
 *
 * The perf numbers mean nothing if the libraries aren't painting the same
 * thing. This script places every target at IDENTICAL logical states using
 * the shared scene spec + `__bench.debugStep` (deterministic animation
 * stepping), screenshots the actual rendered surface, and pixel-diffs each
 * target against the vanilla baseline (pixelmatch).
 *
 * States compared:
 *   1. create   — after create(1000)
 *   2. update   — after updateEvery10th()
 *   3. anim     — after 90 deterministic animation steps (~1.5 s of motion)
 *
 * Also verifies MOTION per target: the anim screenshot must differ from the
 * update screenshot (catches "shapes never move" bugs that would flatter fps).
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

const TARGETS = [
  { name: 'Vanilla Canvas', page: 'vanilla.html' },
  { name: 'Konva', page: 'konva.html' },
  { name: 'Konva (tuned)', page: 'konva-fast.html' },
  { name: 'Fabric', page: 'fabric.html' },
  { name: 'Fabric (tuned)', page: 'fabric-fast.html' },
  { name: 'Rasen canvas-2d', page: 'rasen.html' }
]
const BASELINE = 'Vanilla Canvas'
const STATES = ['create', 'update', 'anim']
const ANIM_STEPS = 90

// --- infra -------------------------------------------------------------------
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
    setTimeout(() => reject(new Error('server timeout')), 45000)
  })
}

async function launchBrowser() {
  const options = {
    headless: false,
    // Wider than the canvas so element screenshots never clip (body margins).
    defaultViewport: { width: 1360, height: 900 },
    args: ['--headless=new', '--window-size=1360,900', '--no-first-run']
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

// --- main ----------------------------------------------------------------------
async function main() {
  const outDir = path.join(__dirname, 'reports', 'render')
  fs.mkdirSync(outDir, { recursive: true })

  const port = await findFreePort()
  const serverUrl = `http://localhost:${port}`
  const server = await startServer(port, '__BENCH_READY__')
  const browser = await launchBrowser()

  const shots = {} // name -> { state: file }

  try {
    for (const target of TARGETS) {
      console.log(`▶ ${target.name}`)
      const page = await browser.newPage()
      await page.goto(`${serverUrl}/${target.page}`, { waitUntil: 'networkidle0' })

      await page.evaluate((n) => window.__bench.create(n), 1000)
      // Screenshot the actual canvas surface (first canvas under #app):
      // Konva/Fabric wrap the canvas in containers with extra height, which
      // would break same-size comparison if we shot the wrapper.
      const el = await page.$('#app canvas')
      const f1 = path.join(outDir, `${target.page}-create.png`)
      await el.screenshot({ path: f1 })

      await page.evaluate(() => window.__bench.updateEvery10th())
      const f2 = path.join(outDir, `${target.page}-update.png`)
      await el.screenshot({ path: f2 })

      await page.evaluate((s) => window.__bench.debugStep(s), ANIM_STEPS)
      const f3 = path.join(outDir, `${target.page}-anim.png`)
      await el.screenshot({ path: f3 })

      shots[target.name] = { create: f1, update: f2, anim: f3 }
      await page.close()
    }
  } finally {
    await browser.close()
    try {
      server.kill('SIGKILL')
    } catch {}
  }

  // --- motion sanity: anim must differ from update on every target ----------
  console.log('\n=== Motion check (anim vs own update state) ===')
  for (const t of TARGETS) {
    const r = diffPngs(shots[t.name].update, shots[t.name].anim, '/tmp/motion-diff.png')
    const verdict = r.error ? `ERROR ${r.error}` : r.pct > 1 ? `moved (${r.pct.toFixed(1)}% px changed)` : `⚠️ NO MOVEMENT? (${r.pct.toFixed(2)}%)`
    console.log(`  ${t.name.padEnd(18)} ${verdict}`)
  }

  // --- equivalence vs vanilla baseline ---------------------------------------
  console.log(`\n=== Render diff vs ${BASELINE} (pixelmatch, threshold 0.1) ===`)
  let worst = { pct: -1, label: '' }
  for (const t of TARGETS) {
    if (t.name === BASELINE) continue
    for (const state of STATES) {
      const diffFile = path.join(outDir, `diff-${t.page}-${state}.png`)
      const r = diffPngs(shots[BASELINE][state], shots[t.name][state], diffFile)
      const label = `${t.name} / ${state}`
      if (r.error) {
        console.log(`  ${label.padEnd(34)} ERROR ${r.error}`)
        continue
      }
      if (r.pct > worst.pct) worst = { pct: r.pct, label }
      const verdict = r.pct < 1 ? 'OK' : r.pct < 5 ? 'MINOR' : 'DIFFERENT'
      console.log(
        `  ${label.padEnd(34)} ${r.pct.toFixed(3)}% differing (${r.mismatches} px) ${verdict}`
      )
    }
  }
  console.log(
    `\nworst: ${worst.label} — ${worst.pct.toFixed(3)}% ${worst.pct < 1 ? '✅ structurally identical (AA-level noise)' : worst.pct < 5 ? '⚠️ small differences (likely AA/edge handling)' : '❌ REAL RENDERING DIFFERENCE — investigate'}`
  )
  console.log(`screenshots + diff images in ${path.relative(process.cwd(), outDir)}/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
