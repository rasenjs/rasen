#!/usr/bin/env node
/** 全操作处理器探针：测量每个按钮点击的同步 JS 耗时 */
const puppeteer = require('puppeteer')

const url = process.argv[2]
const rounds = Number(process.argv[3] || 6)

;(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--window-size=1280,800',
      '--js-flags=--expose-gc',
      '--no-default-browser-check',
      '--disable-sync',
      '--no-first-run',
      '--ash-no-nudges',
      '--disable-extensions',
      '--disable-features=Translate,PrivacySandboxSettings4,IPH_SidePanelGenericMenuFeature'
    ],
    defaultViewport: { width: 1280, height: 800 }
  })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })

  const acc = { create: [], update: [], select: [], swap: [], remove: [], clear: [] }

  const timedClick = (sel) =>
    page.evaluate((s) => {
      const t0 = performance.now()
      const el = document.querySelector(s)
      el.click()
      return performance.now() - t0
    }, sel)

  for (let i = 0; i < rounds; i++) {
    // 预热一轮不计入（首轮 JIT）
    if (i === 0) {
      await timedClick('#run')
      await new Promise((r) => setTimeout(r, 150))
      await timedClick('#clear')
      await new Promise((r) => setTimeout(r, 150))
    }

    await page.evaluate(() => { window.gc && window.gc(); document.getElementById('clear')?.click() })
    await new Promise((r) => setTimeout(r, 120))

    acc.create.push(await timedClick('#run'))
    await new Promise((r) => setTimeout(r, 80))

    acc.update.push(await timedClick('#update'))
    await new Promise((r) => setTimeout(r, 80))

    acc.select.push(await timedClick('tbody tr:nth-of-type(3) td:nth-of-type(2) a'))
    await new Promise((r) => setTimeout(r, 80))

    acc.swap.push(await timedClick('#swaprows'))
    await new Promise((r) => setTimeout(r, 80))

    acc.remove.push(await timedClick('tbody tr:nth-of-type(2) td:nth-of-type(3) a'))
    await new Promise((r) => setTimeout(r, 80))

    acc.clear.push(await timedClick('#clear'))
    await new Promise((r) => setTimeout(r, 120))
  }

  console.log(`--- ${url} ---`)
  for (const [op, arr] of Object.entries(acc)) {
    // 去掉首个样本（JIT 残余）
    const s = arr.slice(1)
    const mean = s.reduce((a, b) => a + b, 0) / s.length
    const sorted = [...s].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    console.log(`  ${op.padEnd(8)} mean=${mean.toFixed(2)}ms  median=${med.toFixed(2)}ms`)
  }

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
