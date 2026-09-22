#!/usr/bin/env node
/* eslint-disable */

/**
 * Counts drawing-buffer resets and ResizeObserver activity in the nikke viewer.
 *
 * Assigning `canvas.width`/`canvas.height` discards the drawing buffer EVEN WHEN
 * THE VALUE IS UNCHANGED. The viewer drives its stage size from a ResizeObserver
 * with `Math.round`, and the canvas component writes both dimensions on every
 * notification — so any layout shift re-entering the observer clears the buffer,
 * and if that lands mid-animation one presented frame shows a cleared canvas:
 * a flash, backend-agnostic, invisible to any final-image check.
 *
 * That is why this is measured in the VIEWER specifically. The bench pages have a
 * fixed layout and reported zero writes; the viewer is the one with a responsive
 * layout, and the report is that the problem reproduces online (where fonts,
 * images and streaming assets keep shifting the layout) but not locally.
 *
 * Usage:
 *   node probe-viewer-size-writes.mjs [mode] [seconds] [width] [height]
 *   node probe-viewer-size-writes.mjs webgl 8 1400 900
 */

import puppeteer from 'puppeteer'

const VIEWER_URL = process.env.VIEWER_URL || 'http://localhost:5191/char/c405'

/** Records buffer writes (with whether the value changed) and RO callbacks. */
function instrumenter(mode) {
  return (m) => {
    try {
      localStorage.setItem('nikke-viewer:settings', JSON.stringify({ bg: '#181820', renderMode: m }))
    } catch {}

    const w = window
    w.__size = { writes: 0, changed: 0, ro: 0, raf: 0, log: [] }
    const log = (s) => {
      if (w.__size.log.length < 60) w.__size.log.push(`${Math.round(performance.now())}ms ${s}`)
    }

    const proto = HTMLCanvasElement.prototype
    for (const prop of ['width', 'height']) {
      const d = Object.getOwnPropertyDescriptor(proto, prop)
      Object.defineProperty(proto, prop, {
        configurable: true,
        get() { return d.get.call(this) },
        set(v) {
          const before = d.get.call(this)
          w.__size.writes++
          if (before !== v) {
            w.__size.changed++
            log(`${prop} ${before} -> ${v}`)
          } else {
            log(`${prop} rewritten with the SAME value (${v}) — buffer discarded`)
          }
          d.set.call(this, v)
        }
      })
    }

    const RO = window.ResizeObserver
    window.ResizeObserver = class extends RO {
      observe(t, o) {
        w.__size.ro++
        log('ResizeObserver.observe')
        return super.observe(t, o)
      }
    }

    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => raf((ts) => { w.__size.raf++; cb(ts) })
    return true
  }
}

async function run(browser, mode, seconds, width, height) {
  const page = await browser.newPage()
  await page.setViewport({ width, height })
  await page.evaluateOnNewDocument(instrumenter(mode), mode)
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 140)))
  await page.goto(VIEWER_URL, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 20000 })

  // Phase 1: load + layout settling (fonts/images/atlas arriving).
  await new Promise((r) => setTimeout(r, 4000))
  const duringLoad = await page.evaluate(() => ({ ...window.__size, log: [] }))

  // Phase 2: steady animation, no user input.
  await page.evaluate(() => {
    window.__size.writes = 0
    window.__size.changed = 0
    window.__size.raf = 0
    window.__size.log = []
  })
  await new Promise((r) => setTimeout(r, seconds * 1000))
  const duringAnim = await page.evaluate(() => ({ ...window.__size }))

  // Phase 3: a window resize during animation — the same code path a layout
  // shift takes, and a way to see the mechanism directly.
  await page.evaluate(() => {
    window.__size.writes = 0
    window.__size.changed = 0
    window.__size.log = []
  })
  await page.setViewport({ width: width - 120, height })
  await new Promise((r) => setTimeout(r, 1500))
  const afterResize = await page.evaluate(() => ({ ...window.__size }))
  await page.setViewport({ width, height })

  await page.close()
  return { mode, duringLoad, duringAnim, afterResize, seconds }
}

function show(label, s) {
  console.log(
    `  ${label.padEnd(22)} buffer writes=${String(s.writes).padStart(4)} (value changed: ${s.changed})  ` +
      `RO.observe=${s.ro}  rAF=${s.raf}`
  )
  for (const l of (s.log || []).slice(0, 6)) console.log(`      ${l}`)
}

async function main() {
  const [modeArg, secArg, wArg, hArg] = process.argv.slice(2)
  const mode = modeArg || 'webgl'
  const seconds = Number(secArg || 6)
  const width = Number(wArg || 1400)
  const height = Number(hArg || 900)

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width, height },
    args: [
      '--headless=new',
      `--window-size=${width},${height}`,
      '--use-angle=metal',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,Metal',
      '--enable-dawn-features=allow_unsafe_apis'
    ],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  })
  try {
    console.log(`\n=== viewer, mode=${mode}, viewport ${width}x${height} ===`)
    const r = await run(browser, mode, seconds, width, height)
    show('during load', r.duringLoad)
    show(`animation ${seconds}s`, r.duringAnim)
    show('window resize', r.afterResize)

    const anim = r.duringAnim
    if (anim.writes > 0) {
      console.log(
        `\n⚠ the drawing buffer is reset during animation: ${anim.writes} write(s), ` +
          `${anim.changed} with an actual size change.`
      )
      console.log(
        `   Each reset discards the bitmap; a frame presented before the repaint` +
          `\n   shows a cleared canvas, i.e. a flash — and it is backend-agnostic.`
      )
      process.exitCode = 1
    } else {
      console.log('\n✅ no buffer resets during steady animation')
    }
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
