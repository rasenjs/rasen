import puppeteer from 'puppeteer'
import fs from 'fs'

// CPU-profile the select hot path: click rows repeatedly, sample at 10µs.
const CLICKS = Number(process.argv[2] || 2000)

const browser = await puppeteer.launch({ headless: 'new' })
const page = await browser.newPage()
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' })
await page.click('#run')
await new Promise(r => setTimeout(r, 500))

const session = await page.createCDPSession()
await session.send('Profiler.enable')
await session.send('Profiler.setSamplingInterval', { interval: 10 }) // 10µs
await session.send('Profiler.start')

// In-page: hammer row clicks with no waits — pure hot path
await page.evaluate((clicks) => {
  const rows = document.querySelectorAll('tr .lbl')
  const t0 = performance.now()
  for (let i = 0; i < clicks; i++) {
    rows[(i * 137) % rows.length].click()
  }
  const ms = performance.now() - t0
  ;window.__selectMs = ms
}, CLICKS)

const ms = await page.evaluate(() => window.__selectMs)
console.log(`${CLICKS} selects in-page: ${ms.toFixed(1)}ms → ${(ms / CLICKS * 1000).toFixed(1)}µs/op`)

const { profile } = await session.send('Profiler.stop')
await browser.close()

const nodes = new Map(profile.nodes.map(n => [n.id, n]))
const selfHits = new Map()
let total = 0
for (const nodeId of profile.samples) {
  total++
  const n = nodes.get(nodeId)
  if (!n) continue
  const cf = n.callFrame
  const key = (cf.functionName || '(anon)') + ' @' + (cf.url ? cf.url.split('/').pop().slice(-24) : 'native')
  selfHits.set(key, (selfHits.get(key) || 0) + 1)
}
console.log('total samples:', total)
;[...selfHits.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).forEach(([k,v]) => {
  console.log(((v/total)*100).toFixed(1).padStart(5) + '%  ' + v.toString().padStart(6) + '  ' + k)
})
fs.writeFileSync('/tmp/select-cpu.json', JSON.stringify(profile))
