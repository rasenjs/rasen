#!/usr/bin/env node
/* eslint-disable */

/**
 * A/B technique-validation driver — runs the raw-WebGL2 micro-benchmarks
 * (ab.html) and prints adopt/reject verdicts per refactor point.
 *
 *   node ab.mjs            → run + print table + save reports/ab-results.json
 *
 * Only techniques with verdict ADOPT get implemented in the real renderer.
 */

import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic, RAF_POLYFILL } from './server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPORTS = path.join(__dirname, 'reports')

/** Same launch convention as benchmark/spine: system Chrome, --headless=new,
 * swiftshader WebGL — never --disable-gpu. */
async function launchBrowser() {
  const options = {
    headless: false,
    defaultViewport: { width: 320, height: 120 },
    args: [
      '--headless=new',
      '--window-size=320,120',
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
    await page.evaluateOnNewDocument(RAF_POLYFILL)
    page.on('pageerror', (e) => console.error('[pageerror]', e.message))
    await page.goto(`http://127.0.0.1:${port}/ab.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction('window.__abReady === true', { timeout: 30000 })

    const results = await page.evaluate('window.__ab.run()')

    console.log('\nA/B technique validation (raw WebGL2, degenerate geometry = pure call overhead)')
    console.log('workload: %d groups × %d verts · %d reps · median\n', 1200, 6, 12)
    console.log('experiment'.padEnd(28), 'old ms'.padStart(9), 'new ms'.padStart(9), 'Δ'.padStart(8), '  verdict  maps to')
    console.log('-'.repeat(100))
    for (const r of results) {
      const delta = (((r.newMs - r.oldMs) / r.oldMs) * 100).toFixed(1)
      console.log(
        r.name.padEnd(28),
        String(r.oldMs).padStart(9),
        String(r.newMs).padStart(9),
        (delta + '%').padStart(8),
        (' ' + r.verdict).padEnd(9),
        r.mapsTo
      )
    }

    const outPath = path.join(REPORTS, `ab-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(outPath, JSON.stringify({ date: new Date().toISOString(), results }, null, 2))
    console.log('\n✔ saved:', path.relative(process.cwd(), outPath))

    const rejected = results.filter((r) => r.verdict === 'REJECT')
    const neutral = results.filter((r) => r.verdict === 'NEUTRAL')
    if (rejected.length || neutral.length) {
      console.log('\n⚠ NOT adopted:')
      for (const r of [...rejected, ...neutral]) console.log(`   ${r.verdict.padEnd(8)} ${r.name}`)
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
