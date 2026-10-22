/**
 * CPU profile of the running game, and its frame pacing.
 *
 * Answers "where does the frame go" with numbers instead of a guess: it drives
 * the hero, samples the page through the DevTools CPU profiler and prints the
 * self-time share of every function, plus the requestAnimationFrame delta
 * distribution (median / p95 / worst) over three seconds.
 *
 * The three-d layer's hot path is skinning, so a change there should move
 * `skinMeshInto` and the median together. Note the profile is taken in headless
 * Chromium with a SOFTWARE rasterizer: `(program)` is largely rasterization and
 * is much smaller on a real GPU, while the JavaScript entries are representative.
 *
 * Run (with the dev server up):
 *   node examples/arpg/tools/profile-arpg.mjs [url]
 */
import puppeteer from 'puppeteer'
import { writeFileSync } from 'node:fs'

const URL = process.argv[2] ?? 'http://localhost:3013/?skipTitle=1'
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 900, height: 640 })
page.on('pageerror', (error) => console.error('PAGEERROR', error.message))
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => globalThis.game !== undefined, { timeout: 60000 })
// The title screen waits for a key.
await page.keyboard.press('Space')
await new Promise((resolve) => setTimeout(resolve, 6000))

// Drive the hero, so locomotion and its skinning are actually exercised.
await page.evaluate(() => {
  const game = globalThis.game
  game.commands.path = [
    { x: game.hero.x + 6, y: game.hero.y + 4 },
    { x: game.hero.x - 5, y: game.hero.y + 7 },
  ]
  game.commands.pathIndex = 0
})

const client = await page.target().createCDPSession()
await client.send('Profiler.enable')
await client.send('Profiler.setSamplingInterval', { interval: 200 })
await client.send('Profiler.start')
await new Promise((resolve) => setTimeout(resolve, 6000))
const { profile } = await client.send('Profiler.stop')

const byId = new Map(profile.nodes.map((node) => [node.id, node]))
const selfTime = new Map()
const total = profile.samples.length
for (const id of profile.samples) {
  const node = byId.get(id)
  if (node === undefined) continue
  const frame = node.callFrame
  const key = `${frame.functionName || '(anon)'} @ ${(frame.url || '').split('/').pop()}:${frame.lineNumber + 1}`
  selfTime.set(key, (selfTime.get(key) ?? 0) + 1)
}
const rows = [...selfTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28)
const table = rows.map(([key, hits]) => `${((hits / total) * 100).toFixed(2).padStart(6)}%  ${key}`)

const pacing = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const deltas = []
      let last = performance.now()
      let frames = 0
      const tick = () => {
        const now = performance.now()
        deltas.push(now - last)
        last = now
        if (++frames < 180) {
          requestAnimationFrame(tick)
          return
        }
        deltas.sort((a, b) => a - b)
        resolve({
          median: +deltas[Math.floor(deltas.length / 2)].toFixed(2),
          p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(2),
          worst: +deltas[deltas.length - 1].toFixed(2),
        })
      }
      requestAnimationFrame(tick)
    }),
)

const report = `samples=${total}\nframe pacing: ${JSON.stringify(pacing)}\n\n${table.join('\n')}\n`
writeFileSync('/tmp/prof-arpg.txt', report)
console.log(`samples=${total} pacing=${JSON.stringify(pacing)}`)
console.log(table.slice(0, 10).join('\n'))
await browser.close()
