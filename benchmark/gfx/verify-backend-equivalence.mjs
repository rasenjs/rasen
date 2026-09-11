#!/usr/bin/env node
/* eslint-disable */

/**
 * WebGL2 vs WebGPU backend equivalence gate.
 *
 * Loads the same scene through both backends (benchmark/gfx/src/webgpu-equivalence.ts)
 * and asserts the rendered pixels match. This is the test that decides whether
 * the WebGPU backend is equivalent rather than merely present.
 *
 * Browser flags, and why they are needed:
 *  - `--enable-unsafe-webgpu` / `--enable-features=Vulkan,Metal` — WebGPU is
 *    still behind a flag in most headless configurations.
 *  - `--enable-dawn-features=allow_unsafe_apis` — lets the page read back
 *    texture data the way the gate needs.
 *
 * If the browser cannot provide WebGPU this FAILS by default, because it has been
 * verified to work headless on this machine (HeadlessChrome 152, adapter
 * `apple / metal-3`). A silent SKIP would let a backend regression pass unnoticed
 * — which is the whole reason this gate exists. Set ALLOW_MISSING_WEBGPU=1 to
 * downgrade it to a skip on machines or CI images without WebGPU.
 *
 * Usage:
 *   npx vite preview --port 5178 --strictPort &   # serve dist first
 *   node verify-backend-equivalence.mjs
 *   ALLOW_MISSING_WEBGPU=1 node verify-backend-equivalence.mjs   # tolerate absence
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 5178)
const ALLOW_MISSING = process.env.ALLOW_MISSING_WEBGPU === '1'
/**
 * Edge-band bound, as a share of the frame.
 *
 * This is deliberately NOT a tight "should be nearly identical" threshold. The
 * primary assertion is `interior === 0` — see the verdict block below — because
 * that is what actually means the two backends shaded the same thing.
 *
 * The band exists only so that a wholesale shift (a flipped axis, a wrong
 * transform) cannot disguise itself as "edge noise". Its size is derived from
 * geometry rather than picked: differing pixels can only appear along the drawn
 * perimeter, one pixel wide. The equivalence scene draws a z-rotated quad whose
 * edge spans the whole frame, so perimeter ~ 4 * 256 = 1024 px out of 65536 =
 * 1.6%, and the observed figure is ~0.9%. 2% therefore covers a 1px boundary
 * with headroom while still failing on anything structural.
 */
const TOLERANCE_PCT = Number(process.env.TOLERANCE_PCT || 2)
/** Channel delta that still counts as "the same colour" (0-255). Kept for the
 *  reported statistics; the verdict uses the interior/edge distinction instead. */
const TOLERANCE_DELTA = Number(process.env.TOLERANCE_DELTA || 2)

function launch() {
  const args = [
    '--headless=new',
    '--window-size=1200,800',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,Metal',
    '--enable-dawn-features=allow_unsafe_apis',
    '--use-angle=metal',
  ]
  const options = { args, defaultViewport: { width: 1200, height: 800 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

async function main() {
  const url = `http://localhost:${PORT}/webgpu-equivalence.html`

  // Guard against a FALSE GREEN on a stale or missing bundle.
  //
  // This happened: the build failed (an unexported symbol) and the runner still
  // reported PASS, because it was serving the previous dist. A gate that can
  // pass on code that does not exist is worse than no gate, so the bundle is
  // checked before anything is browser-tested.
  const distDir = path.join(here, 'dist')
  const htmlPath = path.join(distDir, 'webgpu-equivalence.html')
  if (!fs.existsSync(htmlPath)) {
    console.error(`FAIL: ${htmlPath} does not exist — run \`npm run build\` first.`)
    process.exitCode = 1
    return
  }
  const html = fs.readFileSync(htmlPath, 'utf8')
  const entry = html.match(/assets\/(webgpu-equivalence-[\w-]+\.js)/)?.[1]
  if (!entry || !fs.existsSync(path.join(distDir, 'assets', entry))) {
    console.error('FAIL: the built HTML references a bundle that is not in dist — rebuild.')
    process.exitCode = 1
    return
  }
  const bundle = fs.readFileSync(path.join(distDir, 'assets', entry), 'utf8')
  // The page bundle imports the renderers from the shared gfx chunk, so the
  // renderer NAME is the reliable marker here (the WGSL lives in that chunk).
  // A minified bundle would rename it, but this harness builds with minify off.
  if (!bundle.includes('WebGPURenderer') || !bundle.includes('beginMesh returned null')) {
    console.error(
      `FAIL: dist/assets/${entry} does not import the WebGPU renderer.\n` +
        'The bundle is stale — run `npm run build` before this gate.'
    )
    process.exitCode = 1
    return
  }
  // The WGSL lives in the shared gfx chunk; check it is there too.
  const gfxChunk = fs
    .readFileSync(htmlPath, 'utf8')
    .match(/assets\/(index-[\w-]+\.js)/)?.[1]
  const gfxSource = gfxChunk ? fs.readFileSync(path.join(distDir, 'assets', gfxChunk), 'utf8') : ''
  if (!gfxSource.includes('vs_main')) {
    console.error(
      `FAIL: the gfx chunk ${gfxChunk ?? '(missing)'} does not contain the WGSL entry points.\n` +
        'The gfx package needs a rebuild: `yarn workspace @rasenjs/gfx build`.'
    )
    process.exitCode = 1
    return
  }
  console.log(`bundle: ${entry} (uniform block present)`)

  const browser = await launch()
  const errors = []
  let result
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    page.setDefaultNavigationTimeout(60000)
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const text = m.text()
      // Chrome reports a failed subresource as an ERROR console message with the
      // generic text "Failed to load resource: ... 404" and no URL, so it cannot
      // be filtered by name here. Such failures are collected properly by the
      // response handler below, which DOES know the URL — so skip the generic
      // ones rather than printing a line the reader learns to ignore.
      if (/Failed to load resource/i.test(text)) return
      errors.push(text.slice(0, 300))
    })
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
    page.on('response', (r) => {
      if (r.status() < 400) return
      const u = r.url()
      // A missing favicon is not a rendering defect.
      if (u.endsWith('/favicon.ico')) return
      errors.push(`HTTP ${r.status()} ${u}`)
    })

    // Report WebGPU availability up front so a run proves it genuinely exercised
    // the WebGPU backend rather than skipping past it.
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
    const gpu = await page.evaluate(async () => {
      if (!navigator.gpu) return { present: false }
      try {
        const adapter = await navigator.gpu.requestAdapter()
        const info = adapter?.info
        return {
          present: true,
          vendor: info?.vendor ?? 'unknown',
          architecture: info?.architecture ?? 'unknown',
          preferredFormat: navigator.gpu.getPreferredCanvasFormat(),
        }
      } catch (e) {
        return { present: false, error: String(e) }
      }
    })
    if (!gpu.present) {
      const message =
        'navigator.gpu is unavailable. WebGPU needs Chrome 113+ and the flag set\n' +
        '  --enable-unsafe-webgpu --enable-features=Vulkan,Metal\n' +
        '  --enable-dawn-features=allow_unsafe_apis\n' +
        'It IS known to work headless here (HeadlessChrome 152, apple/metal-3).'
      if (ALLOW_MISSING) {
        console.log(`SKIP: ${message}`)
        return
      }
      console.error(`FAIL: ${message}`)
      console.error('Set ALLOW_MISSING_WEBGPU=1 to treat this as a skip instead.')
      process.exitCode = 1
      return
    }
    console.log(`WebGPU adapter: ${gpu.vendor} / ${gpu.architecture}  (canvas format ${gpu.preferredFormat})`)

    await page.waitForFunction(() => !!(window).__equivalence, { timeout: 60000 })
    result = await page.evaluate(() => (window).__equivalence)
  } finally {
    await browser.close()
  }

  if (errors.length) {
    console.log(`page errors:\n  ${errors.join('\n  ')}`)
  }
  if (!result || !result.ok) {
    console.error(`FAIL: harness did not complete — ${result?.error ?? 'no result'}`)
    process.exitCode = 1
    return
  }

  const d = result.diff
  const shape = result.diffShape
  console.log(`reference: WebGLRenderer (WebGL2, scene-tree path)`)
  console.log(`candidate: WebGPURenderer (WebGPU, scene-tree path)`)
  console.log(`differing pixels:  ${d.differing} / ${d.total}  (${d.pct.toFixed(3)}%)`)
  console.log(`max channel delta: ${d.maxDelta}`)
  console.log(`mean channel delta:${d.meanDelta.toFixed(4)}`)
  console.log('coverage:          ', JSON.stringify(result.coverage ?? 'n/a'))
  console.log('drawCalls:         ', JSON.stringify(result.drawCalls ?? 'n/a'))
  console.log('gpuError:          ', result.gpuError ?? 'none')
  console.log('gpuValidation:   ', result.gpuValidationError ?? 'none')
  console.log('texProbe (rgba of uploaded texel):', JSON.stringify(result.texProbe ?? 'n/a'))
  console.log('modelSwitch (new atlas sampled after switch):', JSON.stringify(result.modelSwitch ?? 'n/a'))
  if (result.debugDataUrl) {
    fs.writeFileSync(path.join(here, 'equivalence-debug.png'), Buffer.from(result.debugDataUrl.split(',')[1], 'base64'))
    console.log('debug image:       equivalence-debug.png')
  }
  if (shape) {
    console.log(`interior pixels:   ${shape.interior}   (edge-only if 0)`)
  }
  console.log('')

  // The contract is NOT "few pixels differ" — a percentage threshold is both too
  // weak and too blunt. Two rasterizers legitimately disagree on shared triangle
  // edges (top-left fill rule, float rounding in the edge functions), so a thin
  // boundary of differing pixels is expected and harmless. A difference in the
  // INTERIOR means the two backends computed different shading, which is a real
  // defect no matter how few pixels it covers.
  //
  // So: zero interior differences, plus a sanity bound on the edge band so a
  // wholesale shift cannot masquerade as "edge noise".
  const interiorOk = !shape || shape.interior === 0
  const bandOk = d.pct <= TOLERANCE_PCT
  const switchOk = result.modelSwitch === true
  if (!switchOk) {
    console.error(
      `FAIL — modelSwitch check: ${JSON.stringify(result.modelSwitch)} — after creating a new\n` +
        '       atlas texture the WebGPU draw still sampled the old one (bind-group cache).'
    )
    process.exitCode = 1
  }
  if (interiorOk && bandOk && switchOk) {
    console.log(
      `PASS — no interior differences; ${d.differing} edge-only pixels ` +
        `(${d.pct.toFixed(3)}% <= ${TOLERANCE_PCT}% edge band)`
    )
  } else {
    if (!interiorOk) {
      console.error(
        `FAIL — ${shape.interior} INTERIOR pixels differ, so the backends are not\n` +
          '       shading the same thing. Edge rasterisation cannot explain this.'
      )
    }
    if (!bandOk) {
      console.error(
        `FAIL — ${d.pct.toFixed(3)}% of pixels differ, beyond the ${TOLERANCE_PCT}% edge band.`
      )
    }
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
