import puppeteer from 'puppeteer'
import fs from 'fs'

// CPU-profile the clear hot path: create(1000) -> clear, sampled at 10µs.
const ROUNDS = Number(process.argv[2] || 60)

const browser = await puppeteer.launch({ headless: 'new' })
const page = await browser.newPage()
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' })
await page.click('#run')
await new Promise(r => setTimeout(r, 500))

const session = await page.createCDPSession()
await session.send('Profiler.enable')
await session.send('Profiler.setSamplingInterval', { interval: 10 }) // 10µs
await session.send('Profiler.start')

await page.evaluate(async (rounds) => {
  const runBtn = document.getElementById('run')
  const clearBtn = document.getElementById('clear')
  // warmup
  for (let i = 0; i < 3; i++) {
    runBtn.click(); clearBtn.click()
    await new Promise(r => setTimeout(r, 30))
  }
  for (let i = 0; i < rounds; i++) {
    runBtn.click()
    await new Promise(r => setTimeout(r, 40))
    const t0 = performance.now()
    clearBtn.click()
    await new Promise(r => requestAnimationFrame(() => r()))
    void t0
  }
}, ROUNDS)

const { profile } = await session.send('Profiler.stop')
await browser.close()

// Build id->node map and parent links for self-time attribution
const nodes = new Map(profile.nodes.map(n => [n.id, n]))
const parent = new Map()
for (const n of profile.nodes) {
  for (const c of (n.children || [])) parent.set(c, n.id)
}
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
fs.writeFileSync('/tmp/clear-cpu.json', JSON.stringify(profile))
