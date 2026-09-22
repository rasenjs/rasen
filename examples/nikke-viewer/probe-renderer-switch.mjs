#!/usr/bin/env node
/* eslint-disable */

/**
 * Renderer-switch check: after switching renderer, does the canvas actually draw?
 *
 * Reported symptom: "switching renderers sometimes needs a refresh to see the
 * result". A mode switch replaces the canvas element (each mode has its own
 * branch), so what has to hold is that the NEW canvas gets a camera and a draw
 * without any further user action.
 *
 * This clicks the real buttons and, after each switch, measures whether the
 * canvas holds a picture. The measurement is an element screenshot's size, which
 * works for every mode: a blank 1024x1024 frame is a few KB and a drawn one is
 * hundreds (measured: ~5KB vs ~300KB for WebGL, ~890KB for WebGPU). Nothing is
 * mode-specific, so this is the same yardstick for all three.
 *
 * It cycles every transition repeatedly, because the report is "sometimes" — a
 * single switch through each mode would miss a race that only loses when the
 * timing falls a certain way.
 *
 * Usage:
 *   node probe-renderer-switch.mjs [url] [char] [cycles]
 *   node probe-renderer-switch.mjs http://localhost:5191 c405 3
 */

import puppeteer from 'puppeteer'

const [urlArg, charArg, cyclesArg] = process.argv.slice(2)
const BASE = urlArg || 'http://localhost:5191'
const CHAR = charArg || 'c405'
const CYCLES = Number(cyclesArg || 3)

const MODES = [
  { label: 'WebGL', name: 'webgl' },
  { label: 'WebGPU', name: 'webgpu' },
  { label: 'Canvas 2D', name: 'canvas' }
]

/** Click the mode button by its visible label. */
async function clickMode(page, label) {
  const clicked = await page.evaluate((text) => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === text
    )
    if (!btn) return false
    btn.click()
    return true
  }, label)
  if (!clicked) throw new Error(`no button labelled "${label}"`)
}

/** Same yardstick for every mode: how big is a screenshot of the canvas? */
async function canvasBytes(page) {
  const el = await page.$('canvas')
  if (!el) return { bytes: 0, canvas: null }
  const b64 = await el.screenshot({ encoding: 'base64' })
  const s = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return c ? { w: c.width, h: c.height, ctx: !!(c.getContext('webgl2') || c.getContext('webgl')) ? 'gl' : 'other' } : null
  })
  return { bytes: Math.round(b64.length * 0.75), canvas: s }
}

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
    page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)))
    // Start in canvas mode so the first transition is a real switch.
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('nikke-viewer:settings', JSON.stringify({ bg: '#181820', renderMode: 'canvas' }))
      } catch {}
    })
    await page.goto(`${BASE}/char/${CHAR}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForFunction(() => typeof window.__nikkeFitState === 'function', { timeout: 60000 })
    // Wait for the model, so every measured switch has something to draw.
    await page.waitForFunction(
      () => {
        const s = window.__nikkeFitState && window.__nikkeFitState()
        return !!(s && s.atlasReady && s.skeletonReady)
      },
      { timeout: 120000, polling: 250 }
    )
    // Let the fit finish so a switch does not land mid-fit.
    await new Promise((r) => setTimeout(r, 2500))

    const baseline = await canvasBytes(page)
    console.log(`\n=== ${BASE}/char/${CHAR}  start=canvas  ${CYCLES} cycles ===`)
    console.log(`  drawn baseline: ${baseline.bytes} bytes (${baseline.canvas?.w}x${baseline.canvas?.h})`)

    // A drawn frame is ~100x a blank one, so a threshold in between is
    // unambiguous and does not need a per-mode calibration.
    const DRAWN = 30000
    let failures = 0
    const rows = []

    for (let c = 0; c < CYCLES; c++) {
      for (const mode of MODES) {
        const before = await page.evaluate(() => {
          const s = window.__nikkeFitState && window.__nikkeFitState()
          return s ? s.renderMode : null
        })
        if (before === mode.name) continue

        await clickMode(page, mode.label)
        // Give the new canvas time to mount, get its camera and draw. WebGPU
        // additionally has to fetch its device on first use.
        await new Promise((r) => setTimeout(r, 2200))

        const measured = await canvasBytes(page)
        const actual = await page.evaluate(() => {
          const s = window.__nikkeFitState && window.__nikkeFitState()
          return s ? { mode: s.renderMode, atlas: s.atlasReady, framing: s.framing } : null
        })
        const ok = measured.bytes >= DRAWN && actual?.atlas
        if (!ok) failures++
        rows.push({ cycle: c + 1, from: before, to: mode.label, bytes: measured.bytes, reported: actual?.mode, framing: actual?.framing, ok })
        console.log(
          `  #${c + 1} ${String(before).padEnd(7)} -> ${mode.label.padEnd(9)} ` +
            `${String(measured.bytes).padStart(8)} bytes  app=${String(actual?.mode).padEnd(7)} ` +
            `${ok ? 'drawn' : '✗ BLANK — a refresh would be needed'}`
        )
      }
    }

    console.log(`\n  ${rows.length} switches, ${failures} blank`)
    if (failures) {
      console.log('  ✗ switching renderer left the canvas blank — this is the reported defect')
      process.exitCode = 1
    } else {
      console.log('  ✅ every switch drew without a refresh')
    }
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
