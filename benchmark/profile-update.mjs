import puppeteer from 'puppeteer'
import fs from 'fs'

const browser = await puppeteer.launch({ headless: 'new' })
const page = await browser.newPage()
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' })
await page.click('#run')
await new Promise(r => setTimeout(r, 500))

const session = await page.createCDPSession()
await session.send('Profiler.enable')
await session.send('Profiler.setSamplingInterval', { interval: 10 })
await session.send('Profiler.start')

// 密集触发 update：50 次（每次变异 100 个 label）
const stats = await page.evaluate(() => {
  const d = window.__bench ? null : null
  // 直接调用页面暴露的 update？main.tsx 没挂 window —— 用按钮
  const btn = document.getElementById('update')
  const t0 = performance.now()
  for (let i = 0; i < 50; i++) btn.click()
  return { ms: performance.now() - t0 }
})
console.log('50 updates:', stats.ms.toFixed(1), 'ms →', (stats.ms / 50 * 1000).toFixed(0), 'µs/op')

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
;[...agg.entries()].sort((a,b)=>b[1]-a[1]).slice(0,28).forEach(([k,v]) => {
  console.log(((v/total)*100).toFixed(1).padStart(5) + '%  ' + v.toString().padStart(6) + '  ' + k)
})
fs.writeFileSync('/tmp/update-profile.json', JSON.stringify(profile))
