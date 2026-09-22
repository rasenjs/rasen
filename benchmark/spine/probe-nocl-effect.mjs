#!/usr/bin/env node
/* eslint-disable */

/**
 * Verifies that the ?nocl=1 diagnostic seam actually changes what the renderer
 * uploads.
 *
 * `verify-clean-stream.mjs` concludes "the skip is sound" when the two runs are
 * pixel-identical. That conclusion is only worth anything if the seam really
 * disabled the skipping — otherwise the two runs are the same code and the test
 * is vacuous. Counting `bufferSubData` calls settles it: forcing every staging
 * copy and every stream upload must increase the count substantially. If the two
 * numbers are equal, the flag never reached the renderer and the A/B proved
 * nothing.
 *
 * Usage: node probe-nocl-effect.mjs <page> [instances] [seconds] [query]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const RAF_POLYFILL = `
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`

/** Count vertex/element uploads and their bytes, without touching renderer code. */
const INSTRUMENT = `
window.__up = { calls: 0, bytes: 0 };
{
  const proto = WebGL2RenderingContext.prototype;
  const raw = proto.bufferSubData;
  proto.bufferSubData = function (target, offset, data) {
    window.__up.calls++;
    window.__up.bytes += data?.byteLength ?? 0;
    return raw.apply(this, [target, offset, data]);
  };
}
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

async function measure(browser, url, steps) {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(RAF_POLYFILL)
  await page.evaluateOnNewDocument(INSTRUMENT)
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })
  await page.evaluate(() => window.__bench.load())
  await new Promise((r) => setTimeout(r, 900))
  const seen = await page.evaluate(() => ({
    search: location.search,
    noclMatches: /[?&]nocl=1/.test(location.search)
  }))
  // One debugStep call per frame: a single debugStep(30) advances 30 ticks but
  // awaits only ONE paint, so it uploads once and cannot show a per-frame rate.
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => {
      window.__up = { calls: 0, bytes: 0 }
    })
    await page.evaluate((s) => window.__bench.debugStep(s), 1)
  }
  const up = await page.evaluate(() => ({ ...window.__up }))
  const frame = await page.evaluate(() => {
    const c = document.querySelector('#app canvas')
    return { w: c.width, h: c.height }
  })
  await page.close()
  return { ...up, frame, ...seen }
}

async function main() {
  const [pageFile, instArg, secsArg, query] = process.argv.slice(2)
  if (!pageFile) {
    console.error('usage: node probe-nocl-effect.mjs <page> [instances] [seconds] [query]')
    process.exit(2)
  }
  const steps = Number(secsArg || 30)
  const port = await findFreePort()
  const server = await startServer(port, '__BENCH_READY__')
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1100, height: 1100 },
    args: ['--headless=new', '--window-size=1100,1100', '--no-first-run', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  })

  try {
    const base = `http://localhost:${port}/${pageFile}?bench=1`
    const q = query ? `&${query}` : ''
    const skip = await measure(browser, base + q, steps)
    const nocl = await measure(browser, base + q + '&nocl=1', steps)
    const perStep = (x) => (x.calls / steps).toFixed(1)

    console.log(`\n${pageFile}  ${steps} steps, canvas ${skip.frame.w}x${skip.frame.h}`)
    console.log(`  url query for the skip-OFF run: "${nocl.search}"  (regex saw nocl=1: ${nocl.noclMatches})`)
    console.log(`  skip ON  : ${String(skip.calls).padStart(6)} bufferSubData calls  ${String(skip.bytes).padStart(10)} bytes   (${perStep(skip)}/step)`)
    console.log(`  skip OFF : ${String(nocl.calls).padStart(6)} bufferSubData calls  ${String(nocl.bytes).padStart(10)} bytes   (${perStep(nocl)}/step)`)
    const ratio = nocl.calls / (skip.calls || 1)
    if (!nocl.noclMatches) {
      console.log(
        `\n❌ the page never saw ?nocl=1 in its location, so the seam cannot have fired.`
      )
      process.exitCode = 1
    } else if (ratio < 1.2) {
      console.log(
        `\n❌ only ${ratio.toFixed(2)}x — ?nocl=1 is NOT changing the uploads, so the A/B` +
          `\n   comparison in verify-clean-stream.mjs is vacuous (both runs are the same code).`
      )
      process.exitCode = 1
    } else {
      console.log(
        `\n✅ ?nocl=1 raises uploads ${ratio.toFixed(2)}x — the seam is live, so a` +
          `\n   pixel-identical A/B means the skipping really is redundant.`
      )
    }
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
