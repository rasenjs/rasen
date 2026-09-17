/**
 * Profiling sweep for the DOM benchmark targets (js-framework-benchmark port).
 *
 * Purpose: answer "where does the time go, and what work is structurally
 * wasteful?" per benchmark phase, per target — so the two Rasen baselines
 * (reactive-vue / alien-signals) can be compared against a competitor (vapor)
 * and against raw DOM (vanillajs).
 *
 * Three independent instruments, each on its own page load so they cannot
 * contaminate each other:
 *
 *   1. TIMING   clean page, in-page performance.now() around the click plus a
 *               microtask flush (both runtimes batch effects on the microtask
 *               queue). Excludes layout/paint on purpose — this is the JS-side
 *               cost. End-to-end click→paint numbers come from bench.js.
 *   2. COUNTING a page whose DOM prototypes are wrapped before app code runs.
 *               Counts appendChild / setAttribute / classList.toggle / … per
 *               action. Deterministic, zero-noise, and the strongest signal for
 *               "we do N ops where the competition does M". Never use this page
 *               for timing — wrapping prototypes deoptimizes call sites.
 *   3. PROFILE  CDP CPU sampling. Repeatable phases (update/select/swap/remove)
 *               are run as ONE long window of `batch` actions so the action
 *               dominates the window; phases that need a reset between reps
 *               (create/clear) use one window per rep. Samples are rolled up
 *               into engine (V8 `program` + native DOM entry points) / GC /
 *               idle / driver / JS so the JS share is honest.
 *
 * The profiling build must be unminified or call frames are useless
 * (`e`, `t`, `In`). Build it first:
 *   for d in rasen rasen-alien vanillajs vapor; do
 *     (cd $d && ../../node_modules/.bin/vite build --no-minify --outDir dist-prof)
 *   done
 *
 * Usage:
 *   node dom-profile.mjs
 *   node dom-profile.mjs --dirs rasen,vapor --phases update,create1k
 *   node dom-profile.mjs --json /tmp/dom-prof.json
 */
import puppeteer from 'puppeteer'
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (i === -1) return dflt
  const a = argv[i]
  return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]
}
const DIRS = String(argOf('dirs', 'rasen,rasen-alien,vapor,vanillajs')).split(',').filter(Boolean)
const OUT_DIR = String(argOf('outDir', 'dist-prof'))
const TOP = Number(argOf('top', 14))
const JSON_OUT = argOf('json', null)
// Which instruments to run. Counting-only re-runs are fast and are all you need
// after touching the instrumentation.
const PASSES = new Set(String(argOf('passes', 'timing,counting,profiling')).split(','))

// reps = timed/verified reps (also used for the counting pass)
// batch = actions inside the single profiling window (null -> one window per rep)
const PHASES = {
  create1k: { reps: 15, batch: null },
  create10k: { reps: 6, batch: null },
  update: { reps: 20, batch: 200 },
  select: { reps: 25, batch: 300 },
  swap: { reps: 20, batch: 200 },
  remove: { reps: 20, batch: 150 },
  clear: { reps: 15, batch: null },
}
const PHASE_NAMES = Object.keys(PHASES)
const WANTED = String(argOf('phases', PHASE_NAMES.join(',')))
  .split(',')
  .filter((p) => PHASE_NAMES.includes(p))

// ---------------------------------------------------------------- chrome
// Same launch config as bench.js, minus the harness-only flags.
const CHROME_ARGS = [
  '--window-size=1280,800',
  '--js-flags=--expose-gc',
  '--no-default-browser-check',
  '--disable-sync',
  '--no-first-run',
  '--ash-no-nudges',
  '--disable-extensions',
  '--disable-features=Translate,PrivacySandboxSettings4,IPH_SidePanelGenericMenuFeature',
  '--headless=new',
]

function launchBrowser() {
  const options = { headless: false, defaultViewport: { width: 1280, height: 800 }, args: CHROME_ARGS }
  const chromePath =
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : 'chrome'
  if (process.platform === 'linux' || fs.existsSync(chromePath)) options.executablePath = chromePath
  return puppeteer.launch(options)
}

// ---------------------------------------------------------------- server
const findFreePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })

async function waitForServer(url, ms) {
  const start = Date.now()
  for (;;) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > ms) return false
    await new Promise((r) => setTimeout(r, 200))
  }
}

function startPreview(dir, port) {
  const vite = path.join(__dirname, '..', 'node_modules', '.bin', 'vite')
  const child = spawn(
    vite,
    ['preview', '--port', String(port), '--strictPort', '--outDir', OUT_DIR],
    { cwd: path.join(__dirname, dir), stdio: ['ignore', 'pipe', 'pipe'] }
  )
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  return child
}

// ---------------------------------------------------------------- instrument: DOM op counting
// Installed with evaluateOnNewDocument so it wraps prototypes before any app
// module evaluates. Counting only — never read timing from this page.
function installDomOpCounters() {
  const counts = Object.create(null)
  const bump = (k) => {
    counts[k] = (counts[k] || 0) + 1
  }
  // eslint-disable-next-line no-undef
  window.__domops = {
    reset() {
      for (const k of Object.keys(counts)) delete counts[k]
    },
    snap() {
      return Object.assign({}, counts)
    },
  }

  const wrapMethod = (proto, name, label) => {
    const orig = proto && proto[name]
    if (typeof orig !== 'function') return
    Object.defineProperty(proto, name, {
      configurable: true,
      writable: true,
      value: function (...args) {
        bump(label)
        return orig.apply(this, args)
      },
    })
  }

  const wrapSetter = (proto, prop, label) => {
    const desc = proto && Object.getOwnPropertyDescriptor(proto, prop)
    if (!desc || !desc.set) return
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(v) {
        bump(label)
        return desc.set.call(this, v)
      },
    })
  }

  // structure
  wrapMethod(Node.prototype, 'appendChild', 'appendChild')
  wrapMethod(Node.prototype, 'insertBefore', 'insertBefore')
  wrapMethod(Node.prototype, 'removeChild', 'removeChild')
  wrapMethod(Node.prototype, 'replaceChild', 'replaceChild')
  wrapMethod(Node.prototype, 'cloneNode', 'cloneNode')
  wrapMethod(Element.prototype, 'append', 'elem.append')
  wrapMethod(Element.prototype, 'remove', 'elem.remove')
  wrapMethod(Element.prototype, 'insertAdjacentHTML', 'insertAdjacentHTML')
  wrapMethod(Element.prototype, 'replaceChildren', 'replaceChildren')
  wrapMethod(Document.prototype, 'createElement', 'createElement')
  wrapMethod(Document.prototype, 'createTextNode', 'createTextNode')
  wrapMethod(Document.prototype, 'createDocumentFragment', 'createDocumentFragment')
  wrapMethod(Document.prototype, 'importNode', 'importNode')

  // attributes / classes
  wrapMethod(Element.prototype, 'setAttribute', 'setAttribute')
  wrapMethod(Element.prototype, 'removeAttribute', 'removeAttribute')
  wrapMethod(DOMTokenList.prototype, 'add', 'classList.add')
  wrapMethod(DOMTokenList.prototype, 'remove', 'classList.remove')
  wrapMethod(DOMTokenList.prototype, 'toggle', 'classList.toggle')

  // text / html / className writes
  wrapSetter(Node.prototype, 'textContent', 'textContent=')
  wrapSetter(Element.prototype, 'innerHTML', 'innerHTML=')
  wrapSetter(Element.prototype, 'className', 'className=')
  // Text-node data writes: both reference implementations (the official
  // vanillajs copy and vapor's compiled runtime) write labels through
  // nodeValue / CharacterData.data, NOT Element.textContent. Without these two
  // the comparison silently under-counts the competition by 2 ops per row.
  wrapSetter(Node.prototype, 'nodeValue', 'nodeValue=')
  wrapSetter(CharacterData.prototype, 'data', 'data=')

  // bulk-removal helpers an implementation may use instead of N x removeChild
  wrapMethod(Range.prototype, 'extractContents', 'range.extractContents')
  wrapMethod(Range.prototype, 'deleteContents', 'range.deleteContents')

  // style
  wrapMethod(CSSStyleDeclaration.prototype, 'setProperty', 'style.setProperty')
  wrapSetter(CSSStyleDeclaration.prototype, 'cssText', 'style.cssText=')

  // events
  wrapMethod(EventTarget.prototype, 'addEventListener', 'addEventListener')
  wrapMethod(EventTarget.prototype, 'removeEventListener', 'removeEventListener')
}

// ---------------------------------------------------------------- in-page driver
// Official js-framework-benchmark selectors = the same ones bench.js drives.
function installDriver() {
  const rows = () => document.querySelectorAll('tbody tr').length
  const q = (sel) => {
    const el = document.querySelector(sel)
    if (!el) throw new Error('missing selector: ' + sel)
    return el
  }
  const cell = (row, col) => {
    const tr = document.querySelector('tbody tr:nth-child(' + row + ')')
    if (!tr) return null
    const td = tr.children[col - 1]
    return td ? td.textContent : null
  }
  // Both runtimes flush effects on the microtask queue; three turns is plenty
  // and keeps the measured window tight around the action.
  const flush = async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }
  const danger = () => document.querySelectorAll('tbody tr.danger').length

  const REMOVE_SEL = 'tbody>tr:nth-of-type(4)>td:nth-of-type(3)>a>span:nth-of-type(1)'
  const needRows = (phase) => (phase === 'remove' ? 1000 : phase === 'create1k' || phase === 'create10k' ? 0 : 1000)

  /** Bring the table to the state the phase expects. Cheap when already there. */
  async function prep(phase) {
    const empty = phase === 'create1k' || phase === 'create10k'
    if (empty) {
      if (rows() > 0) {
        q('#clear').click()
        await flush()
      }
      return { rebuilt: true }
    }
    if (rows() < needRows(phase)) {
      if (rows() > 0) {
        q('#clear').click()
        await flush()
      }
      q('#run').click()
      await flush()
      return { rebuilt: true }
    }
    return { rebuilt: false }
  }

  /**
   * Perform one action. `check` adds the "did it actually happen" assertion and
   * the DOM queries it needs — skipped inside profiling batches, where the
   * extra querySelectorAll would land in the measured window.
   */
  async function run(phase, i, check = true) {
    let before = null
    let selIdx = -1
    let sel = null
    // the selector is needed whether or not we verify (it IS the action)
    if (phase === 'select') {
      selIdx = 2 + (i % 900)
      sel = `tbody tr:nth-child(${selIdx}) td:nth-child(2) a`
    }
    if (check) {
      if (phase === 'update') before = cell(991, 2)
      else if (phase === 'swap') before = cell(999, 1)
      else if (phase === 'remove') before = rows()
    }

    const t0 = performance.now()
    if (phase === 'create1k') q('#run').click()
    else if (phase === 'create10k') q('#runlots').click()
    else if (phase === 'update') q('#update').click()
    else if (phase === 'select') q(sel).click()
    else if (phase === 'swap') q('#swaprows').click()
    else if (phase === 'remove') q(REMOVE_SEL).click()
    else if (phase === 'clear') q('#clear').click()
    else throw new Error('unknown phase ' + phase)
    await flush()
    const ms = performance.now() - t0

    if (!check) return { ms, ok: true }

    let ok
    if (phase === 'create1k') ok = rows() >= 1000
    else if (phase === 'create10k') ok = rows() >= 10000
    else if (phase === 'update') ok = cell(991, 2) !== before
    else if (phase === 'select') {
      const tr = document.querySelector(`tbody tr:nth-child(${selIdx})`)
      ok = !!tr && tr.classList.contains('danger') && danger() === 1
    } else if (phase === 'swap') ok = cell(999, 1) !== before
    else if (phase === 'remove') ok = rows() === before - 1
    else if (phase === 'clear') ok = rows() === 0
    return { ms, ok }
  }

  /** Run `k` actions back to back, for one long profiling window. */
  async function runBatch(phase, k, start) {
    const times = []
    let failures = 0
    let rebuilds = 0
    let tracks = phase === 'remove' ? rows() : 0
    for (let j = 0; j < k; j++) {
      if (phase === 'remove' && tracks < 400) {
        await prep(phase)
        tracks = rows()
        rebuilds++
      }
      const r = await run(phase, start + j, false)
      if (phase === 'remove') tracks--
      times.push(r.ms)
      if (!r.ok) failures++
    }
    return { times, failures, rebuilds }
  }

  // eslint-disable-next-line no-undef
  window.__domprof = { prep, run, runBatch }
}

// ---------------------------------------------------------------- profile math
/** Merge one raw V8 profile into `acc` (self-time in µs, keyed by function). */
function accumulate(acc, profile) {
  const nodesById = new Map()
  for (const n of profile.nodes) nodesById.set(n.id, n)
  const { samples, timeDeltas } = profile
  for (let i = 0; i < samples.length; i++) {
    const dt = timeDeltas[i] ?? 0
    if (dt <= 0) continue
    const node = nodesById.get(samples[i])
    if (!node) continue
    const cf = node.callFrame
    const name = cf.functionName || '(anonymous)'
    let url = cf.url || ''
    if (url) url = url.replace(/^.*\/([^/]+\.js)$/, '$1')
    acc.set(`${name} @ ${url || 'native'}:${(cf.lineNumber ?? 0) + 1}`, (acc.get(`${name} @ ${url || 'native'}:${(cf.lineNumber ?? 0) + 1}`) ?? 0) + dt)
  }
}

const nameOf = (key) => key.slice(0, key.indexOf(' @ '))

function rollup(acc) {
  const cat = { engine: 0, gc: 0, idle: 0, driver: 0, js: 0 }
  for (const [k, us] of acc) {
    const n = nameOf(k)
    if (n === '(program)') cat.engine += us
    else if (n === '(garbage collector)') cat.gc += us
    else if (n === '(idle)') cat.idle += us
    else if (k.includes('pptr:evaluate')) cat.driver += us
    else if (k.includes(' @ native:')) cat.engine += us
    else cat.js += us
  }
  return cat
}

function summarize(acc, topN) {
  const total = [...acc.values()].reduce((a, b) => a + b, 0)
  const all = [...acc.entries()]
    .map(([k, us]) => ({ k, name: nameOf(k), ms: us / 1000, pct: total > 0 ? (100 * us) / total : 0 }))
    .sort((a, b) => b.ms - a.ms)
  const cat = rollup(acc)
  const pct = (v) => (total > 0 ? (100 * v) / total : 0)
  return {
    totalMs: total / 1000,
    rollup: {
      enginePct: pct(cat.engine),
      gcPct: pct(cat.gc),
      idlePct: pct(cat.idle),
      driverPct: pct(cat.driver),
      jsPct: pct(cat.js),
    },
    rows: all.slice(0, topN),
    all,
  }
}

// ---------------------------------------------------------------- per-phase passes
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function openPage(browser, base, instrument) {
  const page = await browser.newPage()
  page.setDefaultTimeout(60000)
  if (instrument) await page.evaluateOnNewDocument(installDomOpCounters)
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.evaluate(installDriver)
  return page
}

/** Pass 1 — timed + verified reps on a clean page. */
async function timingPass(page, phase, reps) {
  for (let i = 0; i < 2; i++) {
    await page.evaluate((p) => window.__domprof.prep(p), phase)
    const w = await page.evaluate(([p, i]) => window.__domprof.run(p, i, true), [phase, i])
    if (!w.ok) throw new Error(`${phase}: warmup assertion failed`)
  }
  const times = []
  for (let i = 0; i < reps; i++) {
    await page.evaluate((p) => window.__domprof.prep(p), phase)
    const r = await page.evaluate(([p, i]) => window.__domprof.run(p, i, true), [phase, i])
    if (r.ok) times.push(r.ms)
  }
  times.sort((a, b) => a - b)
  return { medianMs: times.length ? times[Math.floor(times.length / 2)] : NaN, minMs: times[0], reps: times.length }
}

/** Pass 2 — DOM op counts for exactly the same actions, on an instrumented page. */
async function countingPass(page, phase, reps) {
  await page.evaluate((p) => window.__domprof.prep(p), phase)
  const totals = Object.create(null)
  for (let i = 0; i < reps; i++) {
    await page.evaluate((p) => window.__domprof.prep(p), phase)
    await page.evaluate(() => window.__domops.reset())
    const r = await page.evaluate(([p, i]) => window.__domprof.run(p, i, true), [phase, i])
    if (!r.ok) continue
    const snap = await page.evaluate(() => window.__domops.snap())
    for (const [op, n] of Object.entries(snap)) totals[op] = (totals[op] || 0) + n
  }
  const perOp = Object.entries(totals)
    .map(([op, n]) => [op, n / reps])
    .sort((a, b) => b[1] - a[1])
  return { reps, perOp, totalPerRep: perOp.reduce((a, [, n]) => a + n, 0) }
}

/** Pass 3 — CPU samples, batched so the action dominates the window. */
async function profilingPass(page, phase, plan) {
  const client = await page.createCDPSession()
  await client.send('Profiler.enable')
  await client.send('Profiler.setSamplingInterval', { interval: 80 })
  const acc = new Map()
  let windowMs = 0
  try {
    if (plan.batch) {
      await page.evaluate((p) => window.__domprof.prep(p), phase)
      const t0 = Date.now()
      await client.send('Profiler.start')
      const batch = await page.evaluate(
        ([p, k]) => window.__domprof.runBatch(p, k, 0),
        [phase, plan.batch]
      )
      const { profile } = await client.send('Profiler.stop')
      windowMs = Date.now() - t0
      accumulate(acc, profile)
      const sum = batch.times.reduce((a, b) => a + b, 0)
      return {
        mode: 'batch',
        actions: plan.batch,
        windowMs,
        actionMs: sum,
        avgActionMs: sum / plan.batch,
        rebuilds: batch.rebuilds,
        failures: batch.failures,
        ...summarize(acc, TOP),
      }
    }
    // per-rep windows (phases that need a reset between actions)
    const reps = plan.reps
    const t0 = Date.now()
    for (let i = 0; i < reps; i++) {
      await page.evaluate((p) => window.__domprof.prep(p), phase)
      await client.send('Profiler.start')
      await page.evaluate(([p, i]) => window.__domprof.run(p, i, false), [phase, i])
      const { profile } = await client.send('Profiler.stop')
      accumulate(acc, profile)
    }
    windowMs = Date.now() - t0
    return { mode: 'perRep', actions: reps, windowMs, ...summarize(acc, TOP) }
  } finally {
    await client.detach().catch(() => {})
  }
}

// ---------------------------------------------------------------- main
async function profileTarget(dir, browser) {
  const port = await findFreePort()
  const server = startPreview(dir, port)
  const base = `http://localhost:${port}/`
  const result = {}
  let page = null

  try {
    if (!(await waitForServer(base, 30000))) throw new Error(`preview server for ${dir} never came up`)

    for (const phase of WANTED) {
      const plan = PHASES[phase]
      let timing = null
      let counting = null
      let profiling = null

      if (PASSES.has('timing')) {
        const p = await openPage(browser, base, false)
        timing = await timingPass(p, phase, plan.reps)
        await p.close()
      }
      if (PASSES.has('counting')) {
        const p = await openPage(browser, base, true)
        counting = await countingPass(p, phase, plan.reps)
        await p.close()
      }
      if (PASSES.has('profiling')) {
        const p = await openPage(browser, base, false)
        profiling = await profilingPass(p, phase, plan)
        await p.close()
      }
      page = null
      result[phase] = { timing, counting, profiling }

      const head =
        `\n──── ${dir} · ${phase}` +
        (timing ? ` ── ${timing.medianMs.toFixed(2)}ms/op JS (median of ${timing.reps})` : '') +
        (counting ? ` · DOM ops/op ${counting.totalPerRep.toFixed(0)}` : '')
      console.log(head)
      if (profiling) {
        const c = profiling.rollup
        console.log(
          `     profile: ${profiling.actions} ops in ${profiling.windowMs}ms window` +
            ` · engine ${c.enginePct.toFixed(1)}% · gc ${c.gcPct.toFixed(1)}% · js ${c.jsPct.toFixed(1)}%` +
            ` · driver ${c.driverPct.toFixed(1)}% · idle ${c.idlePct.toFixed(1)}%`
        )
      }
      if (counting) {
        console.log(
          `     top DOM ops/op: ${counting.perOp
            .slice(0, 7)
            .map(([o, n]) => `${o} ${n.toFixed(n < 10 ? 1 : 0)}`)
            .join(' · ') || '(none)'}`
        )
      }
      for (const row of profiling?.rows ?? []) {
        console.log(
          `${row.pct.toFixed(1).padStart(6)}% ${row.ms.toFixed(2).padStart(8)}ms  ${row.name.padEnd(30)} ${row.k.slice(row.k.indexOf(' @ ') + 3)}`
        )
      }
    }
  } finally {
    if (page) await page.close().catch(() => {})
    server.kill('SIGKILL')
    await sleep(300)
  }
  return result
}

async function main() {
  const browser = await launchBrowser()
  const results = {}
  try {
    for (const dir of DIRS) {
      const distProf = path.join(__dirname, dir, OUT_DIR)
      if (!fs.existsSync(distProf)) {
        console.error(`⚠️  ${dir}/${OUT_DIR} missing — build it first with --no-minify`)
        continue
      }
      console.log(`\n${'█'.repeat(78)}\n█ TARGET: ${dir}   (serving ${OUT_DIR}, unminified)\n${'█'.repeat(78)}`)
      results[dir] = await profileTarget(dir, browser)
    }
  } finally {
    await browser.close()
  }

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 1))
    console.log(`\n(full results → ${JSON_OUT})`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
