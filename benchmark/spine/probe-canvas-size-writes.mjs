#!/usr/bin/env node
/* eslint-disable */

/**
 * Counts drawing-buffer resizes during an animation.
 *
 * Assigning `canvas.width`/`canvas.height` resets the bitmap — the drawing buffer
 * is discarded — EVEN WHEN THE VALUE IS UNCHANGED. So every such assignment is a
 * frame that must be repainted from scratch, and if the repaint lands after the
 * frame is presented, one frame shows a cleared canvas. That is a flash, it is
 * backend-agnostic, and it is invisible to any check that compares final images.
 *
 * `@rasenjs/dom`'s canvas component assigns unconditionally inside a
 * `subscribe(() => [width, height, dpr])`, and nikke-viewer feeds those from a
 * ResizeObserver with `Math.round`, so a rounding mismatch can keep the observer
 * firing. This probe measures the rate rather than assuming it: a handful of
 * writes over an animation is normal (mount + a real resize); one per frame is a
 * feedback loop.
 *
 * Usage: node probe-canvas-size-writes.mjs <page> [seconds] [width] [height]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const RAF_POLYFILL = `
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`

/** Count size writes, and how many actually changed the value. */
const INSTRUMENT = `
window.__sizeWrites = { width: 0, height: 0, widthChanged: 0, heightChanged: 0, values: [] };
{
  const proto = HTMLCanvasElement.prototype;
  for (const prop of ['width', 'height']) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    const cap = prop === 'width' ? 'width' : 'height';
    Object.defineProperty(proto, prop, {
      configurable: true,
      get() { return desc.get.call(this) },
      set(v) {
        window.__sizeWrites[cap]++;
        const before = desc.get.call(this);
        if (before !== v) {
          window.__sizeWrites[cap + 'Changed']++;
          if (window.__sizeWrites.values.length < 40) {
            window.__sizeWrites.values.push(prop + ': ' + before + ' -> ' + v);
          }
        }
        desc.set.call(this, v);
      }
    });
  }
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

async function main() {
  const [pageFile, secsArg, wArg, hArg] = process.argv.slice(2)
  if (!pageFile) {
    console.error('usage: node probe-canvas-size-writes.mjs <page> [seconds]')
    process.exit(2)
  }
  const seconds = Number(secsArg || 3)
  const port = await findFreePort()
  const server = await startServer(port, '__BENCH_READY__')

  const options = {
    headless: false,
    defaultViewport: {
      width: Number(wArg || 1100),
      height: Number(hArg || 1100)
    },
    args: ['--headless=new', '--no-first-run', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  }
  const browser = await puppeteer.launch(options)
  try {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(RAF_POLYFILL)
    await page.evaluateOnNewDocument(INSTRUMENT)
    await page.goto(`http://localhost:${port}/${pageFile}?bench=1`, {
      waitUntil: 'networkidle0',
      timeout: 60000
    })
    await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })
    await page.evaluate(() => window.__bench.load())
    await new Promise((r) => setTimeout(r, 600))

    // Reset after load so only the animation window is counted.
    await page.evaluate(() => {
      window.__sizeWrites = { width: 0, height: 0, widthChanged: 0, heightChanged: 0, values: [] }
    })
    const anim = await page.evaluate(
      (ms) => window.__bench.animate(ms, 1),
      seconds * 1000
    )
    const w = await page.evaluate(() => window.__sizeWrites)

    const frames = anim.frames || Math.round(seconds * 60)
    console.log(`\n${pageFile}  ${seconds}s animation, ${frames} frames`)
    console.log(`  canvas.width  writes: ${w.width}  (value actually changed: ${w.widthChanged})`)
    console.log(`  canvas.height writes: ${w.height}  (value actually changed: ${w.heightChanged})`)
    console.log(`  → ${(w.width / frames).toFixed(2)} width writes per frame`)
    if (w.values.length) {
      console.log(`  observed transitions:`)
      for (const v of w.values.slice(0, 10)) console.log(`     ${v}`)
      if (w.values.length > 10) console.log(`     … ${w.values.length} total (capped)`)
    }
    const per = w.width / frames
    if (per > 0.5) {
      console.log(
        `\n⚠ the drawing buffer is being discarded roughly once per frame — every` +
          `\n  one of those frames has to be repainted from scratch, and any that is` +
          `\n  presented before the repaint shows a cleared canvas.`
      )
    } else if (w.widthChanged > 0) {
      console.log(`\n${w.widthChanged} real size change(s) — expected for a mount or a genuine resize`)
    } else {
      console.log(`\n✅ no redundant buffer resets`)
    }
    process.exitCode = per > 0.5 ? 1 : 0
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
