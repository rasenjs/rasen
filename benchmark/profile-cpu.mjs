/**
 * CPU sampler for the Rasen js-framework-benchmark app.
 *
 * Captures V8 sampling profiles around a single Create-1000-rows phase and a
 * single Clear phase, then prints the top self-time functions for each phase.
 * Read-only diagnostics — no framework code is exercised beyond the app.
 *
 * Usage:
 *   node profile-cpu.mjs <baseUrl> [phase=create|clear|both]
 * The server must already be running (e.g. `vite preview`).
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://localhost:5801'
const phase = process.argv[3] ?? 'both'

function browserExecutablePath() {
  switch (process.platform) {
    case 'darwin': return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    case 'win32': return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    default: return 'chrome'
  }
}

const CHROME_ARGS = [
  '--window-size=1280,800',
  '--js-flags=--expose-gc',
  '--no-default-browser-check',
  '--disable-sync',
  '--no-first-run',
  '--ash-no-nudges',
  '--disable-extensions',
  '--disable-features=Translate,PrivacySandboxSettings4,IPH_SidePanelGenericMenuFeature'
]

async function launchBrowser() {
  const args = [...CHROME_ARGS, '--headless=new']
  const options = {
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args
  }
  const chromePath = browserExecutablePath()
  if (fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

/** Aggregate a raw V8 profile into self-time per function. */
function aggregate(profile) {
  const nodesById = new Map()
  for (const n of profile.nodes) nodesById.set(n.id, n)

  // self time (µs) per node id
  const selfUs = new Map()
  const { samples, timeDeltas } = profile
  for (let i = 0; i < samples.length; i++) {
    const dt = timeDeltas[i] ?? 0
    if (dt <= 0) continue
    const id = samples[i]
    selfUs.set(id, (selfUs.get(id) ?? 0) + dt)
  }

  // fold to function key
  const byFn = new Map()
  for (const [id, us] of selfUs) {
    const n = nodesById.get(id)
    if (!n) continue
    const fn = n.callFrame.functionName || '(anonymous)'
    let url = n.callFrame.url || ''
    // shorten: keep last two path segments
    url = url.replace(/^.*\/([^\/]+\/[^\/]+)$/, '$1').replace(/^.*\/([^\/]+)$/, '$1')
    const key = `${fn} @ ${url}:${n.callFrame.lineNumber + 1}`
    byFn.set(key, (byFn.get(key) ?? 0) + us)
  }

  const totalUs = [...selfUs.values()].reduce((a, b) => a + b, 0)
  const rows = [...byFn.entries()]
    .map(([k, us]) => ({ k, ms: us / 1000 }))
    .sort((a, b) => b.ms - a.ms)
  return { rows, totalMs: totalUs / 1000 }
}

function printTop(title, profile, topN = 22) {
  const { rows, totalMs } = aggregate(profile)
  console.log(`\n===== ${title} (sampled ${totalMs.toFixed(1)}ms on CPU) =====`)
  for (const r of rows.slice(0, topN)) {
    const pct = totalMs > 0 ? ((r.ms / totalMs) * 100).toFixed(1).padStart(5) : '  0.0'
    console.log(`${pct}%  ${r.ms.toFixed(2).padStart(8)}ms  ${r.k}`)
  }
}

const browser = await launchBrowser()
try {
  const page = await browser.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle0' })

  const client = await page.createCDPSession()
  await client.send('Profiler.enable')
  await client.send('Profiler.setSamplingInterval', { interval: 100 })

  if (phase === 'create' || phase === 'both') {
    await client.send('Profiler.start')
    await page.click('#run')
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length >= 1000, { timeout: 15000 })
    const r = await client.send('Profiler.stop')
    printTop('CREATE 1,000 rows', r.profile)
  }

  if (phase === 'clear' || phase === 'both') {
    // ensure rows exist
    const count = await page.evaluate(() => document.querySelectorAll('tbody tr').length)
    if (count === 0) {
      await page.click('#run')
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length >= 1000, { timeout: 15000 })
    }
    await client.send('Profiler.start')
    await page.click('#clear')
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 0, { timeout: 15000 })
    const r = await client.send('Profiler.stop')
    printTop('CLEAR all rows', r.profile)
  }

  if (phase === 'select' || phase === 'both') {
    // ensure rows exist, then sample N row-label clicks (selection flips)
    const count = await page.evaluate(() => document.querySelectorAll('tbody tr').length)
    if (count === 0) {
      await page.click('#run')
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length >= 1000, { timeout: 15000 })
    }
    // warm up once so lazy paths (delegation roots etc.) are hot
    await page.click('tbody tr:first-child a.lbl')
    await new Promise(r => setTimeout(r, 50))
    await client.send('Profiler.start')
    for (let i = 0; i < 20; i++) {
      const idx = i % 2 === 0 ? 500 + i : 300 + i
      await page.click(`tbody tr:nth-child(${idx}) a.lbl`)
      await new Promise(r => setTimeout(r, 5))
    }
    await new Promise(r => setTimeout(r, 50))
    const r = await client.send('Profiler.stop')
    printTop('SELECT row x20', r.profile)
  }

  await page.close()
} finally {
  await browser.close()
}
