import puppeteer from 'puppeteer'
import fs from 'fs'

const browser = await puppeteer.launch({ headless: 'new' })
const page = await browser.newPage()
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle0' })
await page.click('#run')
await new Promise(r => setTimeout(r, 500))

const session = await page.createCDPSession()
await session.send('Profiler.enable')
await session.send('Profiler.setSamplingInterval', { interval: 10 }) // 10µs 密集采样
await session.send('Profiler.start')

// 密集触发：单次 evaluate 内连续 select 500 次（无等待，纯热路径）
const stats = await page.evaluate(() => {
  const rows = document.querySelectorAll('tr .lbl')
  const t0 = performance.now()
  for (let i = 0; i < 500; i++) {
    rows[(i * 137) % rows.length].click()
  }
  return { ms: performance.now() - t0, count: rows.length }
})
console.log('500 selects in-page:', stats.ms.toFixed(1), 'ms →', (stats.ms / 500 * 1000).toFixed(1), 'µs/op')

const { profile } = await session.send('Profiler.stop')
await browser.close()

const nodes = new Map(profile.nodes.map(n => [n.id, n]))
const agg = new Map()
let total = 0
for (const nodeId of profile.samples) {
  total++
  const n = nodes.get(nodeId)
  if (!n) continue
  const cf = n.callFrame
  const key = (cf.functionName || '(anon)') + ' @' + (cf.url ? cf.url.split('/').pop().slice(0, 20) : 'native')
  agg.set(key, (agg.get(key) || 0) + 1)
}
console.log('total samples:', total)
;[...agg.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25).forEach(([k,v]) => {
  console.log(((v/total)*100).toFixed(1).padStart(5) + '%  ' + v.toString().padStart(6) + '  ' + k)
})
fs.writeFileSync('/tmp/select-profile.json', JSON.stringify(profile))
