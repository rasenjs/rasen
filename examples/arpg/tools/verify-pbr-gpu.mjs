#!/usr/bin/env node
/* eslint-disable */
/**
 * PBR gate, WebGPU — the same physical invariants as `verify-pbr.mjs`, checked
 * against the WGSL shader on the WebGPU backend.
 *
 * Two backends, two shading languages, one BRDF: if the WGSL port were wrong the
 * numbers here would disagree with the GL gate's, which is the point of running
 * both rather than trusting that a translation "looks equivalent".
 *
 * Usage: node tools/verify-pbr-gpu.mjs [url]
 */

import puppeteer from 'puppeteer'

const URL = process.argv[2] ?? 'http://localhost:3013/pbr-lab-gpu.html'
const failures = []
const checks = []
const check = (name, condition, detail) => {
  checks.push({ name, pass: !!condition, detail })
  if (!condition) failures.push(`${name}: ${detail}`)
}

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,Metal',
    '--enable-dawn-features=allow_unsafe_apis',
  ],
})

try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))
  await page.goto(URL, { waitUntil: 'load' })
  const ready = await page
    .waitForFunction(() => window.__pbrGpu && window.__pbrGpu.ok !== undefined, { timeout: 25000 })
    .then(() => true)
    .catch(() => false)

  if (!ready) {
    console.error(`The WebGPU lab never reported. Is ${URL} served?`)
    process.exit(2)
  }

  const report = await page.evaluate(async () => {
    const lab = window.__pbrGpu
    if (!lab.ok) return { ok: false, error: lab.error }
    const white = [0.8, 0.8, 0.8]
    const gold = [0.9, 0.75, 0.35]
    const black = [0, 0, 0]
    return {
      ok: true,
      adapter: lab.adapter,
      smooth: await lab.run({ baseColor: white, metallic: 0, roughness: 0.08 }),
      rough: await lab.run({ baseColor: white, metallic: 0, roughness: 0.95 }),
      goldMetal: await lab.run({ baseColor: gold, metallic: 1, roughness: 0.25 }),
      goldDielectric: await lab.run({ baseColor: gold, metallic: 0, roughness: 0.25 }),
      whiteDielectric: await lab.run({ baseColor: white, metallic: 0, roughness: 0.25 }),
      blackDielectric: await lab.run({ baseColor: black, metallic: 0, roughness: 0.15 }),
      blackMetal: await lab.run({ baseColor: black, metallic: 1, roughness: 0.15 }),
      // readback rows run top-down, so up-left (toward the light) is a smaller y.
      lit: await lab.pixelAt({ baseColor: white, metallic: 0, roughness: 0.5 }, 100, 100),
      unlit: await lab.pixelAt({ baseColor: white, metallic: 0, roughness: 0.5 }, 156, 156),
    }
  })

  if (!report.ok) {
    console.error(`WebGPU lab failed: ${report.error}`)
    process.exit(1)
  }

  const lum = (p) => 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b
  console.log(`adapter: ${JSON.stringify(report.adapter)}`)
  console.log(`smooth (r=0.08) : ${JSON.stringify(report.smooth)}`)
  console.log(`rough  (r=0.95) : ${JSON.stringify(report.rough)}`)
  console.log(`gold metal      : ${JSON.stringify(report.goldMetal)}`)
  console.log(`black dielectric: ${JSON.stringify(report.blackDielectric)}`)
  console.log(`black metal     : ${JSON.stringify(report.blackMetal)}`)
  console.log(`lit=${JSON.stringify(report.lit)} unlit=${JSON.stringify(report.unlit)}`)

  check('WGSL compiles on WebGPU', report.ok, report.error ?? '')
  check(
    'sphere covers a plausible part of the frame',
    report.smooth.coverage > 0.15 && report.smooth.coverage < 0.6,
    `coverage ${report.smooth.coverage}`,
  )
  check('the frame corner is background', report.smooth.cornerLum < 3, `cornerLum ${report.smooth.cornerLum}`)
  check(
    'roughness tightens the highlight (peak brighter)',
    report.smooth.maxLum > report.rough.maxLum * 1.25,
    `smooth ${report.smooth.maxLum} vs rough ${report.rough.maxLum}`,
  )
  check(
    'roughness spreads the highlight (area larger)',
    report.rough.brightArea > report.smooth.brightArea,
    `rough ${report.rough.brightArea} vs smooth ${report.smooth.brightArea}`,
  )
  check(
    'a metal loses its diffuse term',
    report.goldMetal.meanLum < report.goldDielectric.meanLum,
    `metal ${report.goldMetal.meanLum} vs dielectric ${report.goldDielectric.meanLum}`,
  )
  check(
    'a black dielectric still reflects (F0 = 0.04)',
    report.blackDielectric.maxLum > 8,
    `peak ${report.blackDielectric.maxLum}`,
  )
  check(
    'a black metal reflects nothing',
    report.blackMetal.maxLum < 4,
    `peak ${report.blackMetal.maxLum}`,
  )
  check(
    'a metal tints its specular with the base colour',
    report.goldMetal.meanR > report.goldMetal.meanB * 1.25,
    `R ${report.goldMetal.meanR} vs B ${report.goldMetal.meanB}`,
  )
  check(
    'a white dielectric stays neutral',
    Math.abs(report.whiteDielectric.meanR - report.whiteDielectric.meanB) <
      report.whiteDielectric.meanR * 0.2,
    `R ${report.whiteDielectric.meanR} vs B ${report.whiteDielectric.meanB}`,
  )
  check(
    'the lit hemisphere is brighter than the unlit one',
    lum(report.lit) > lum(report.unlit) * 1.15,
    `lit ${lum(report.lit).toFixed(1)} unlit ${lum(report.unlit).toFixed(1)}`,
  )
} finally {
  await browser.close()
}

console.log('')
for (const { name, pass, detail } of checks) {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${pass ? '' : ` — ${detail}`}`)
}
console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} WebGPU PBR check(s) failed`)
  process.exit(1)
}
console.log(`${checks.length} WebGPU PBR checks passed`)
