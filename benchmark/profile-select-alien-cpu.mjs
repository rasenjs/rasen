import puppeteer from 'puppeteer'
import fs from 'fs'

const browser = await puppeteer.launch({ headless: 'new' })
const page = await browser.newPage()
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle0' })
await page.click('#run')
await new Promise(r => setTimeout(r, 500))

const session = await page.createCDPSession()
await session.send('Profiler.enable')
await session.send('Profiler.setSamplingInterval', { interval: 10 })
await session.send('Profiler.start')

const ms = await page.evaluate(async () => {
  const rows = document.querySelectorAll('tr .lbl')
  const t0 = performance.now()
  for (let i = 0; i < 500; i++) {
    rows[(i * 137) % rows.length].click()
    if (i % 50 === 49) await new Promise(r => setTimeout(r, 0))
  }
  return performance.now() - t0
})
console.log('500 selects:', ms.toFixed(1), 'ms →', (ms / 500 * 1000).toFixed(1), 'µs/op')

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
;[...selfHits.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25).forEach(([k,v]) => {
  console.log(((v/total)*100).toFixed(1).padStart(5) + '%  ' + v.toString().padStart(6) + '  ' + k)
})
fs.writeFileSync('/tmp/select-alien-cpu.json', JSON.stringify(profile))
