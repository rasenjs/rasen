import puppeteer from 'puppeteer'

// Controlled clear-scene measurement: repeat create(1000) -> clear cycles
// in-page and time only the clear step. Usage: node profile-clear.mjs [rounds]
const ROUNDS = Number(process.argv[2] || 30)

const browser = await puppeteer.launch({ headless: 'new' })
const page = await browser.newPage()
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' })
await page.click('#run')
await new Promise(r => setTimeout(r, 500))

const stats = await page.evaluate(async (rounds) => {
  const runBtn = document.getElementById('run')
  const clearBtn = document.getElementById('clear')
  const times = []
  // warmup
  for (let i = 0; i < 3; i++) {
    runBtn.click()
    clearBtn.click()
    await new Promise(r => setTimeout(r, 30))
  }
  for (let i = 0; i < rounds; i++) {
    runBtn.click()
    // let creation settle before timing the clear
    await new Promise(r => setTimeout(r, 50))
    const t0 = performance.now()
    clearBtn.click()
    // sample after a frame so pending microtasks/GC-visible work lands
    await new Promise(r => requestAnimationFrame(() => r()))
    times.push(performance.now() - t0)
  }
  return { times, residual: document.querySelectorAll('tr').length }
}, ROUNDS)

const t = stats.times.slice().sort((a, b) => a - b)
const med = t[Math.floor(t.length / 2)]
const mean = t.reduce((a, b) => a + b, 0) / t.length
console.log(`clear x${ROUNDS}: median=${med.toFixed(2)}ms mean=${mean.toFixed(2)}ms min=${t[0].toFixed(2)} max=${t[t.length - 1].toFixed(2)}`)
console.log('residual rows after clear:', stats.residual)
await browser.close()
