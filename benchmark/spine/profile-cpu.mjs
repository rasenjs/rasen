/* eslint-disable */
/**
 * CPU sampling profile of one bench page's animate() phase via CDP.
 * Usage: node profile-cpu.mjs [instances] [page]
 *   PAGE env: rasen-webgl.html (default) | official-webgl.html
 *   HWGL env: 1 = hardware GL with bench.js launch config (default), 0 = SwiftShader
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'

const N = Number(process.argv[2] || 200)
const PAGE = process.env.PAGE || 'rasen-webgl.html'
const HWGL = process.env.HWGL !== '0'

function launchBrowser() {
  const args = ['--headless=new', '--window-size=1360,1360', '--js-flags=--expose-gc']
  if (!HWGL) args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader')
  const options = { args, defaultViewport: { width: 1360, height: 1360 } }
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

async function main() {
  const browser = await launchBrowser()
  const page = await browser.newPage()
  await page.goto(`http://localhost:5179/${PAGE}?bench=1`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })
  await page.evaluate(() => window.__bench.load())
  await page.evaluate((n) => window.__bench.createInstances(n), N)

  const session = await page.target().createCDPSession()
  await session.send('Profiler.enable')
  await session.send('Profiler.setSamplingInterval', { interval: 100 })
  await session.send('Profiler.start')
  const anim = await page.evaluate((n) => window.__bench.animate(4000, n), N)
  const { profile } = await session.send('Profiler.stop')
  await browser.close()

  // Aggregate self-time (hit count per node) over all samples.
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
  const self = new Map()
  for (const id of profile.samples) self.set(id, (self.get(id) || 0) + 1)
  const total = profile.samples.length
  const rows = [...self.entries()]
    .map(([id, hits]) => {
      const f = nodes.get(id)?.callFrame ?? { functionName: '?' }
      const name = f.functionName || '(anonymous)'
      const url = (f.url || '').replace(/^.*\//, '')
      return { hits, pct: (100 * hits) / total, name, loc: `${url}:${(f.lineNumber ?? 0) + 1}` }
    })
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 45)
  console.log(
    `PAGE=${PAGE} N=${N} HWGL=${HWGL} avgFrame=${anim.avgFrameMs?.toFixed(1) ?? '?'}ms frames=${anim.frames} samples=${total}`
  )
  for (const r of rows) {
    console.log(`${r.pct.toFixed(1).padStart(5)}% ${String(r.hits).padStart(6)}  ${r.name.padEnd(44)} ${r.loc}`)
  }
  const out = `profile-cpu-${PAGE.replace(/[.-]/g, '_')}-n${N}.json`
  fs.writeFileSync(out, JSON.stringify(profile))
  console.log(`(full profile → ${out})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
