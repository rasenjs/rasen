#!/usr/bin/env node
/* eslint-disable */

/**
 * Where does the remaining FRAME gap actually live — pose or render?
 *
 * Two numbers have been floating around and they measure different scopes:
 *   - poseOnly ratio (probe-ab-pose)  ~1.15x   covers ONLY packages/assets:
 *     st.update + st.apply + updateWorldTransform, no drawing at all
 *   - full frame ratio (ab-anim)      ~1.07x   covers the whole frame
 * Because pose is only a fraction of the frame, a pose-only win is diluted, and
 * that harness cannot resolve the diluted amount.
 *
 * This probe measures poseOnly AND avgFrameMs for BOTH runtimes in the SAME page
 * session and the SAME interleaved rounds, so `render = frame - pose` is a
 * like-for-like subtraction (both terms carry the same session conditions), and
 * the render share of the gap can be read directly instead of inferred from two
 * different harnesses.
 *
 * Caveat kept explicit in the output: avgFrameMs is wall time over an rAF-driven
 * window, so it is vsync-quantised and the render term absorbs any scheduling
 * slack. The RATIOS between the two runtimes are the meaningful output.
 *
 * Usage: HWGL=1 node probe-frame-split.mjs [instances] [durationMs] [rounds]
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)
const DURATION = Number(process.argv[3] || 2500)
const ROUNDS = Number(process.argv[4] || 5)
const HWGL = process.env.HWGL !== '0'
const PORT = Number(process.env.PORT || 5179)

function launch() {
  const args = ['--headless=new', '--window-size=1360,1360']
  if (!HWGL) args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader')
  const options = { args, defaultViewport: { width: 1360, height: 1360 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

const TARGETS = [
  { name: 'official', page: 'official-webgl.html' },
  { name: 'rasen', page: 'rasen-webgl.html' },
]

async function measure(page, page_, n, duration) {
  await page.goto(`http://localhost:${PORT}/${page_}?bench=1`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => !!window.__bench, { timeout: 30000 })
  await page.evaluate(() => window.__bench.load())
  await page.evaluate((k) => window.__bench.createInstances(k), n)
  await page.evaluate((t) => window.__bench.poseOnly(t), 40) // warm
  // Pose: deep min of 3.
  let pose = Infinity
  for (let i = 0; i < 3; i++) {
    const ms = await page.evaluate((t) => window.__bench.poseOnly(t), 250)
    if (ms < pose) pose = ms
  }
  // Frame: keep every animation window so the DISTRIBUTION is visible. Our
  // mean sits well above our min on this machine while official's does not,
  // and mean/p95 is what a user actually experiences as fps and stutter.
  const windows = []
  for (let i = 0; i < 3; i++) {
    const r = await page.evaluate((d, k) => window.__bench.animate(d, k), duration, n)
    if (r?.avgFrameMs) windows.push(r)
  }
  const frame = windows.length ? Math.min(...windows.map((w) => w.avgFrameMs)) : Infinity
  return { pose, frame, windows }
}

function stat(vals) {
  const s = [...vals].sort((a, b) => a - b)
  return { min: s[0], median: s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
}

async function main() {
  const browser = await launch()
  const acc = { official: [], rasen: [] }
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(120000)
    page.setDefaultNavigationTimeout(120000)
    for (let r = 0; r < ROUNDS; r++) {
      const line = []
      for (const t of TARGETS) {
        const m = await measure(page, t.page, N, DURATION)
        acc[t.name].push(m)
        line.push(`${t.name} pose=${m.pose.toFixed(3)} frame=${m.frame.toFixed(2)}`)
      }
      console.log(`round ${String(r + 1).padStart(2)}  ${line.join('   ')}`)
    }
  } finally {
    await browser.close()
  }

  const o = { pose: stat(acc.official.map((m) => m.pose)), frame: stat(acc.official.map((m) => m.frame)) }
  const s = { pose: stat(acc.rasen.map((m) => m.pose)), frame: stat(acc.rasen.map((m) => m.frame)) }

  // Pool every animation window per runtime for mean/p95/max/jank.
  const pool = (rows) => rows.flatMap((m) => m.windows || [])
  const agg = (rows) => {
    const w = pool(rows)
    if (!w.length) return null
    const mean = w.reduce((a, r) => a + r.avgFrameMs, 0) / w.length
    const p95 = w.reduce((a, r) => a + r.p95FrameMs, 0) / w.length
    const p99 = w.reduce((a, r) => a + (r.p99FrameMs ?? 0), 0) / w.length
    const max = Math.max(...w.map((r) => r.maxFrameMs))
    const jank = w.reduce((a, r) => a + (r.jankPct ?? 0), 0) / w.length
    const fps = w.reduce((a, r) => a + (r.avgFps ?? 0), 0) / w.length
    return { mean, p95, p99, max, jank, fps, n: w.length }
  }
  const oa = agg(acc.official)
  const sa = agg(acc.rasen)

  console.log('')
  console.log(`N=${N} duration=${DURATION}ms rounds=${ROUNDS} HWGL=${HWGL}`)
  console.log('')
  console.log('=== frame-time distribution (pooled animation windows) ===')
  if (oa && sa) {
    console.log('                    mean     p95     p99      max    jank%    fps    windows')
    console.log(`  official      ${oa.mean.toFixed(2).padStart(7)} ${oa.p95.toFixed(2).padStart(7)} ${oa.p99.toFixed(2).padStart(7)} ${oa.max.toFixed(2).padStart(8)} ${oa.jank.toFixed(1).padStart(7)} ${oa.fps.toFixed(1).padStart(6)} ${String(oa.n).padStart(9)}`)
    console.log(`  rasen         ${sa.mean.toFixed(2).padStart(7)} ${sa.p95.toFixed(2).padStart(7)} ${sa.p99.toFixed(2).padStart(7)} ${sa.max.toFixed(2).padStart(8)} ${sa.jank.toFixed(1).padStart(7)} ${sa.fps.toFixed(1).padStart(6)} ${String(sa.n).padStart(9)}`)
    console.log('')
    console.log(`  ratio mean    ${(sa.mean / oa.mean).toFixed(3)}x   <- what a user experiences`)
    console.log(`  ratio p95     ${(sa.p95 / oa.p95).toFixed(3)}x`)
    console.log(`  ratio max     ${(sa.max / oa.max).toFixed(3)}x`)
    console.log(`  mean - min:   official ${(oa.mean - o.min).toFixed(2)} ms   rasen ${(sa.mean - s.min).toFixed(2)} ms`)
  }
  console.log('')
  console.log('                     min      median')
  console.log(`  official pose    ${o.pose.min.toFixed(3).padStart(7)}  ${o.pose.median.toFixed(3).padStart(7)}`)
  console.log(`  rasen    pose    ${s.pose.min.toFixed(3).padStart(7)}  ${s.pose.median.toFixed(3).padStart(7)}`)
  console.log(`  official frame   ${o.frame.min.toFixed(2).padStart(7)}  ${o.frame.median.toFixed(2).padStart(7)}`)
  console.log(`  rasen    frame   ${s.frame.min.toFixed(2).padStart(7)}  ${s.frame.median.toFixed(2).padStart(7)}`)
  console.log('')
  const oRender = o.frame.min - o.pose.min
  const sRender = s.frame.min - s.pose.min
  console.log('  derived render+rest (frame - pose, same session, min basis):')
  console.log(`    official  ${oRender.toFixed(2)} ms`)
  console.log(`    rasen     ${sRender.toFixed(2)} ms`)
  console.log('')
  console.log('  ratios:')
  console.log(`    pose      ${(s.pose.min / o.pose.min).toFixed(3)}x   (packages/assets scope)`)
  console.log(`    frame     ${(s.frame.min / o.frame.min).toFixed(3)}x   (the number that matters)`)
  console.log(`    render    ${(sRender / oRender).toFixed(3)}x   (derived)`)
  console.log('')
  const poseShare = s.pose.min / s.frame.min
  console.log('')
  console.log(`  pose is ${(poseShare * 100).toFixed(1)}% of our best-case frame; render+rest is ${(100 - poseShare * 100).toFixed(1)}%`)
  if (oa && sa) {
    console.log(`  pose is ${((s.pose.min / sa.mean) * 100).toFixed(1)}% of our AVERAGE frame`)
  }
  console.log('')
  if (sRender > oRender + 0.5) {
    console.log('  => render+rest ALSO costs us more than official; the frame gap is not pose-only.')
  } else if (s.pose.min - o.pose.min > s.frame.min - o.frame.min - 0.3) {
    console.log('  => the frame gap is almost entirely pose; render+rest is at parity or better.')
    console.log('     Further pose cuts are the only lever, but each 1 ms buys only ~2% of frame.')
  } else {
    console.log('  => mixed; read the table above.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
