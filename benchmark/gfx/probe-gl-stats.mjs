#!/usr/bin/env node
/* eslint-disable */

/**
 * GL call + frame-time baseline probe for the gfx batch renderer.
 *
 * Renders the deterministic scene in headless Chrome and instruments the REAL
 * WebGL context by wrapping prototype methods — counts every GL call per
 * frame (draw calls, buffer uploads + bytes, attrib pointers, uniforms,
 * texture binds) and collects rAF frame deltas. This is the BEFORE/AFTER
 * yardstick for the WebGL2 perf refactor:
 *
 *   VAO            → vertexAttribPointer / enableVertexAttribArray counts ↓
 *   bufferSubData  → bufferData reallocation count ↓ (bytes same)
 *   UBO            → uniformMatrix4fv / uniform1i counts ↓
 *   multi-texture  → drawArrays count ↓ (fewer group splits)
 *
 *   node probe-gl-stats.mjs             → measure, write reports/gl-stats.json,
 *                                         diff vs baseline if present
 *   node probe-gl-stats.mjs --baseline  → (re)write reports/gl-stats-baseline.json
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic, RAF_POLYFILL } from './server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPORTS = path.join(__dirname, 'reports')
const BASELINE = process.argv.includes('--baseline')
const FRAMES = 120
const WARMUP_FRAMES = 15

/** GL methods worth counting, grouped for the report. */
const WATCHED = [
  'drawArrays', 'drawElements', 'drawArraysInstanced',
  'bufferData', 'bufferSubData',
  'enableVertexAttribArray', 'disableVertexAttribArray', 'vertexAttribPointer',
  'useProgram', 'uniformMatrix4fv', 'uniformMatrix3fv', 'uniform1i', 'uniform1f', 'uniform2f', 'uniform3f', 'uniform4fv', 'uniform2fv', 'uniform3fv',
  'bindTexture', 'activeTexture', 'bindBuffer',
  'blendFunc', 'blendFuncSeparate', 'viewport', 'clear', 'enable', 'disable'
]

const INSTRUMENT = `
(() => {
  const stats = { calls: {}, bytes: 0 }
  window.__glStats = stats
  const wrap = (proto) => {
    if (!proto) return
    for (const name of Object.getOwnPropertyNames(proto)) {
      let orig
      try { orig = proto[name]; } catch { continue }
      if (typeof orig !== 'function') continue
      proto[name] = function (...args) {
        stats.calls[name] = (stats.calls[name] || 0) + 1
        if (name === 'bufferData' || name === 'bufferSubData') {
          const data = args.find((a) => a && (a.byteLength !== undefined || a.length !== undefined))
          if (data) stats.bytes += data.byteLength ?? data.length * 4
        }
        return orig.apply(this, args)
      }
    }
  }
  wrap(WebGLRenderingContext.prototype)
  wrap(WebGL2RenderingContext.prototype)
})()
`

function p95(arr) {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]
}

/** Same launch convention as benchmark/spine: system Chrome, --headless=new,
 * swiftshader WebGL — never --disable-gpu. */
async function launchBrowser() {
  const options = {
    headless: false,
    defaultViewport: { width: 640, height: 560 },
    args: [
      '--headless=new',
      '--window-size=640,560',
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

async function main() {
  fs.mkdirSync(REPORTS, { recursive: true })
  const { server, port } = await serveStatic()
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 640, height: 560 })
    await page.evaluateOnNewDocument(RAF_POLYFILL)
    await page.evaluateOnNewDocument(INSTRUMENT)
    page.on('pageerror', (e) => console.error('[pageerror]', e.message))
    await page.goto(`http://127.0.0.1:${port}/scenes.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction('window.__gfxReady !== undefined', { timeout: 20000 })
    await page.evaluate('window.__gfxReady')

    const gpu = await page.evaluate(() => {
      const gl = window.__gfx.gl
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
    })
    const isWebGL2 = await page.evaluate(() => !!window.__gfx.gl.drawArraysInstanced)

    // Warmup (shader compile, buffer capacity growth) — excluded from stats.
    await page.evaluate(`window.__glStats.calls = {}; window.__glStats.bytes = 0`)
    await page.evaluate(`window.__gfx.drawFrames(${WARMUP_FRAMES})`)

    // Measured run.
    await page.evaluate('window.__glStats.calls = {}; window.__glStats.bytes = 0')
    const { deltas } = await page.evaluate(`window.__gfx.drawFrames(${FRAMES})`)
    const stats = await page.evaluate('({ calls: window.__glStats.calls, bytes: window.__glStats.bytes })')

    // Normalize per ACTUAL renderer draw. The scene runs a continuousRender
    // loop whose rate is independent of the probe's rAF tick loop, so the
    // meaningful denominator is the number of render passes — `clear` is
    // called exactly once per RenderContext.draw().
    const draws = stats.calls.clear ?? 0
    if (!draws) throw new Error('no renderer draws observed (clear count 0)')

    const avgMs = deltas.reduce((s, d) => s + d, 0) / deltas.length
    const report = {
      meta: {
        date: new Date().toISOString(),
        gpu,
        webgl2: isWebGL2,
        scene: `batch: ${1200} textured quads / 4 textures / 3 blend modes + PMA + solid`,
        frames: FRAMES,
        warmupFrames: WARMUP_FRAMES,
        rendererDraws: draws,
        note: 'headless SwiftShader — absolute ms are environment-bound; only RELATIVE before/after diffs on the same machine are meaningful. GL stats are normalized per renderer draw (clear count).'
      },
      frame: {
        avgMs: +avgMs.toFixed(3),
        p95Ms: +p95(deltas).toFixed(3),
        minMs: +Math.min(...deltas).toFixed(3),
        maxMs: +Math.max(...deltas).toFixed(3)
      },
      glPerDraw: Object.fromEntries(
        Object.entries(stats.calls).map(([k, v]) => [k, +(v / draws).toFixed(2)])
      ),
      bytesPerDraw: Math.round(stats.bytes / draws)
    }

    const outPath = BASELINE
      ? path.join(REPORTS, 'gl-stats-baseline.json')
      : path.join(REPORTS, `gl-stats-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
    console.log(`✔ report: ${path.relative(process.cwd(), outPath)}`)

    // Compact view.
    console.log(`\nrenderer draws: ${draws} · tick avg ${report.frame.avgMs}ms · bytes/draw ${report.bytesPerDraw}`)
    const interesting = ['drawArrays', 'bufferData', 'bufferSubData', 'vertexAttribPointer', 'enableVertexAttribArray', 'disableVertexAttribArray', 'useProgram', 'uniformMatrix4fv', 'uniform1i', 'bindTexture', 'activeTexture', 'bindBuffer']
    console.log('GL calls / draw:')
    for (const k of interesting) {
      if (report.glPerDraw[k] !== undefined) console.log(`  ${k.padEnd(26)} ${report.glPerDraw[k]}`)
    }

    // Diff vs baseline.
    const baselinePath = path.join(REPORTS, 'gl-stats-baseline.json')
    if (!BASELINE && fs.existsSync(baselinePath)) {
      const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
      console.log('\n── vs baseline ──────────────────────────────')
      const fmt = (now, before) => {
        if (before === undefined || before === 0) return `${now} (n/a)`
        const pct = (((now - before) / before) * 100).toFixed(1)
        return `${now} (${pct > 0 ? '+' : ''}${pct}%)`
      }
      console.log(`tick avgMs  : ${fmt(report.frame.avgMs, base.frame.avgMs)}`)
      console.log(`tick p95Ms  : ${fmt(report.frame.p95Ms, base.frame.p95Ms)}`)
      console.log(`bytes/draw  : ${fmt(report.bytesPerDraw, base.bytesPerDraw)}`)
      for (const k of interesting) {
        const now = report.glPerDraw[k]
        const before = base.glPerDraw[k]
        if (now !== undefined || before !== undefined) {
          console.log(`${k.padEnd(26)}: ${fmt(now ?? 0, before ?? 0)}`)
        }
      }
    }
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
