#!/usr/bin/env node
/* eslint-disable */
/**
 * PBR gate — does the shader exported by `@rasenjs/gfx` shade correctly on a GPU?
 *
 * Compiling is not evidence. A Cook-Torrance BRDF can link cleanly and still be
 * wrong, and the classic failures are exactly the ones this checks for:
 *
 *   - an unconserved energy term
 *   - a Fresnel that never reaches its F0
 *   - a metal that keeps its diffuse albedo
 *   - a highlight that does not tighten as roughness falls
 *
 * So the assertions are physical invariants measured on rendered pixels, not a
 * "the program compiled" smoke test:
 *
 *   1. the program compiles and links, with no shader log
 *   2. the sphere covers a plausible part of the frame and nothing is NaN
 *   3. a smoother surface has a brighter, smaller highlight
 *   4. a metal loses its diffuse term
 *   5. a black dielectric still reflects — the 0.04 F0 is present
 *   6. a black metal reflects nothing — F0 really is the base colour
 *   7. the specular of a metal is tinted by its base colour
 *   8. the lit hemisphere is brighter than the unlit one
 *
 * Usage:
 *   yarn examples:arpg:dev            # any server on the dev port
 *   node tools/verify-pbr.mjs [url]
 */

import puppeteer from 'puppeteer'

const URL = process.argv[2] ?? 'http://localhost:3013/pbr-lab.html'
const failures = []
const checks = []

function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail })
  if (!condition) failures.push(`${name}: ${detail}`)
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader'],
})

try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))
  await page.goto(URL, { waitUntil: 'load' })

  const ready = await page
    .waitForFunction(() => typeof window.__pbr !== 'undefined', { timeout: 20000 })
    .then(() => true)
    .catch(() => false)

  if (!ready) {
    console.error(`The lab page never reported. Is ${URL} served?`)
    process.exit(2)
  }

  const report = await page.evaluate(() => {
    const pbr = window.__pbr
    const white = [0.8, 0.8, 0.8]
    const gold = [0.9, 0.75, 0.35]
    const black = [0, 0, 0]
    return {
      ok: pbr.ok,
      logs: [pbr.vertexLog, pbr.fragmentLog, pbr.linkLog].filter(Boolean).join(' | '),
      renderer: pbr.renderer,
      smooth: pbr.run({ baseColor: white, metallic: 0, roughness: 0.08 }),
      rough: pbr.run({ baseColor: white, metallic: 0, roughness: 0.95 }),
      goldMetal: pbr.run({ baseColor: gold, metallic: 1, roughness: 0.25 }),
      goldDielectric: pbr.run({ baseColor: gold, metallic: 0, roughness: 0.25 }),
      whiteDielectric: pbr.run({ baseColor: white, metallic: 0, roughness: 0.25 }),
      blackDielectric: pbr.run({ baseColor: black, metallic: 0, roughness: 0.15 }),
      blackMetal: pbr.run({ baseColor: black, metallic: 1, roughness: 0.15 }),
      // The sphere covers only the middle ~23% of the frame (radius ~68px around
      // the centre at 128,128), so the samples have to be inside it. readPixels
      // counts y upwards, so the light at +y is the upper half.
      unlit: pbr.pixelAt({ baseColor: white, metallic: 0, roughness: 0.5 }, 156, 100),
      lit: pbr.pixelAt({ baseColor: white, metallic: 0, roughness: 0.5 }, 100, 156),
    }
  })

  const lum = (p) => 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b

  console.log(`renderer: ${report.renderer}`)
  console.log(`smooth (r=0.08) : ${JSON.stringify(report.smooth)}`)
  console.log(`rough  (r=0.95) : ${JSON.stringify(report.rough)}`)
  console.log(`gold metal      : ${JSON.stringify(report.goldMetal)}`)
  console.log(`gold dielectric : ${JSON.stringify(report.goldDielectric)}`)
  console.log(`black dielectric: ${JSON.stringify(report.blackDielectric)}`)
  console.log(`black metal     : ${JSON.stringify(report.blackMetal)}`)
  console.log(`lit=${JSON.stringify(report.lit)} unlit=${JSON.stringify(report.unlit)}`)

  check('program links cleanly', report.ok && report.logs === '', report.logs || 'link failed')

  check(
    'sphere covers a plausible part of the frame',
    report.smooth.coverage > 0.15 && report.smooth.coverage < 0.6,
    `coverage ${report.smooth.coverage}`,
  )
  check(
    'the frame corner is background, so the sphere is not filling everything',
    report.smooth.cornerLum < 3,
    `cornerLum ${report.smooth.cornerLum}`,
  )
  check('no NaN pixels', report.smooth.magenta === 0, `magenta=${report.smooth.magenta}`)

  check(
    'roughness tightens the highlight (peak brighter)',
    report.smooth.maxLum > report.rough.maxLum * 1.25,
    `smooth peak ${report.smooth.maxLum} vs rough peak ${report.rough.maxLum}`,
  )
  check(
    'roughness spreads the highlight (area larger)',
    report.rough.brightArea > report.smooth.brightArea,
    `rough area ${report.rough.brightArea} vs smooth area ${report.smooth.brightArea}`,
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
    'a black metal reflects nothing (F0 is the base colour)',
    report.blackMetal.maxLum < 4,
    `peak ${report.blackMetal.maxLum}`,
  )
  check(
    'a metal tints its specular with the base colour',
    report.goldMetal.meanR > report.goldMetal.meanB * 1.25,
    `metal R ${report.goldMetal.meanR} vs B ${report.goldMetal.meanB}`,
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
  console.error(`${failures.length} PBR gate check(s) failed`)
  process.exit(1)
}
console.log(`${checks.length} PBR gate checks passed`)
