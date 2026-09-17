/**
 * Blink-phase breakdown for js-framework-benchmark traces.
 *
 * bench.js times an iteration as click -> first paint commit (see its
 * computeResultsCPU). This tool opens that same window and attributes it to
 * Blink's own phases — so you can tell whether a benchmark is dominated by JS
 * (FunctionCall), style recalc (UpdateLayoutTree), layout (Layout), paint or
 * commit. That is the difference between "optimize the reactive layer" and
 * "stop invalidating style/layout".
 *
 * Also prints per-event-type COUNTS inside the window: a benchmark that fires
 * 1 Layout is doing one clean pass, while 1000 Layouts means something forces a
 * synchronous layout per row.
 *
 * Usage:
 *   node analyze-blink-phases.mjs <traceDir> [<traceDir> ...]
 *
 * Multiple dirs are printed side by side (label = dir basename), so
 *   node analyze-blink-phases.mjs /tmp/tr-rasen /tmp/tr-vanillajs
 * gives the head-to-head.
 */
import fs from 'node:fs'
import path from 'node:path'

function relevantTypes(e, startLogicEventName) {
  if (e.name !== 'EventDispatch') return null
  const type = e.args?.data?.type
  // bench.js pushes BOTH a startLogicEvent AND a click entry for the click
  // dispatch. The click entry is what keeps work that happens *inside* the
  // dispatch in the window: `during` accepts `e.ts > click.end || type ===
  // 'click'`, so without it a benchmark whose work all runs inside the click
  // dispatch (04_select: the signal fan-out plus its microtask flush) yields an
  // empty window and the section silently disappears.
  const out = []
  if (type === startLogicEventName) out.push('startLogicEvent')
  if (type === 'click') out.push('click')
  if (type === 'mousedown') out.push('mousedown')
  if (type === 'pointerup') out.push('pointerup')
  return out.length ? out : null
}

/** Same window rule as bench.js computeResultsCPU (click ts -> commit end). */
function windowOf(traceEvents, startLogicEventName = 'click') {
  const events = []
  for (const e of traceEvents) {
    const rel = relevantTypes(e, startLogicEventName)
    if (rel) {
      for (const type of rel) {
        events.push({ type, ts: +e.ts, end: +e.ts + +(e.dur || 0), pid: e.pid })
      }
    } else if ((e.name === 'Commit' || e.name === 'Layout' || e.name === 'Paint') && e.ph === 'X')
      events.push({ type: e.name.toLowerCase(), ts: +e.ts, end: +e.ts + +e.dur, pid: e.pid })
    else if (e.name === 'FireAnimationFrame' && e.ph === 'X')
      events.push({ type: 'fireAnimationFrame', ts: +e.ts, end: +e.ts + +e.dur, pid: e.pid })
    else if (e.name === 'TimerFire' && e.ph === 'X')
      events.push({ type: 'timerFire', ts: +e.ts, end: +e.ts, pid: e.pid })
    else if (e.name === 'FunctionCall' && e.ph === 'X')
      events.push({ type: 'functioncall', ts: +e.ts, end: +e.ts, pid: e.pid })
  }
  events.sort((a, b) => a.end - b.end)
  const clicks = events.filter((e) => e.type === 'startLogicEvent')
  if (clicks.length !== 1) return null
  const click = clicks[0]
  const pid = click.pid
  const during = events.filter((e) => (e.ts > click.end || e.type === 'click') && e.pid === pid)
  const startFrom = during
    .filter((e) =>
      [startLogicEventName, 'fireAnimationFrame', 'timerFire', 'layout', 'functioncall'].includes(e.type)
    )
    .sort((a, b) => a.end - b.end)
  const startFromEvent = startFrom[startFrom.length - 1]
  if (!startFromEvent) return null
  const commits = during.filter((e) => e.type === 'commit').sort((a, b) => a.ts - b.ts)
  let commit = commits.find((e) => e.ts > startFromEvent.end)
  if (!commit) commit = commits[commits.length - 1]
  if (!commit) return null
  return { t0: click.ts, t1: commit.end, pid }
}

/** Self-time per event name inside the window (children durations removed). */
function breakdown(traceEvents, win) {
  const inside = traceEvents.filter(
    (e) =>
      e.ph === 'X' &&
      e.dur > 0 &&
      e.pid === win.pid &&
      e.ts >= win.t0 &&
      e.ts + e.dur <= win.t1
  )
  inside.sort((a, b) => a.ts - b.ts || b.dur - a.dur)

  const counts = new Map()
  for (const e of inside) counts.set(e.name, (counts.get(e.name) || 0) + 1)

  const stack = []
  const childDur = new Map()
  const selfDur = new Map()
  const flush = (top) => {
    const parent = stack[stack.length - 1]
    if (parent) childDur.set(parent, (childDur.get(parent) || 0) + top.dur)
  }
  for (const e of inside) {
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) {
      flush(stack.pop())
    }
    stack.push(e)
  }
  while (stack.length) flush(stack.pop())

  for (const e of inside) {
    const self = e.dur - (childDur.get(e) || 0)
    if (self <= 0) continue
    selfDur.set(e.name, (selfDur.get(e.name) || 0) + self)
  }
  return { selfDur, counts, evCount: inside.length }
}

function median(xs) {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function analyzeDir(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const byBench = new Map()
  for (const f of files) {
    const bench = f.split('_').slice(0, 2).join('_') // e.g. 01_run1k
    if (!byBench.has(bench)) byBench.set(bench, [])
    byBench.get(bench).push(path.join(dir, f))
  }

  const out = {}
  for (const [bench, paths] of [...byBench.entries()].sort()) {
    const windows = []
    const selfTotals = new Map()
    const countMed = new Map()
    const countSamples = new Map()
    let ok = 0
    for (const p of paths) {
      let trace
      try {
        trace = JSON.parse(fs.readFileSync(p, 'utf8'))
      } catch {
        continue
      }
      const evs = trace.traceEvents || []
      const win = windowOf(evs)
      if (!win) continue
      windows.push((win.t1 - win.t0) / 1000)
      const { selfDur, counts } = breakdown(evs, win)
      for (const [k, v] of selfDur) selfTotals.set(k, (selfTotals.get(k) || 0) + v)
      for (const [k, v] of counts) {
        if (!countSamples.has(k)) countSamples.set(k, [])
        countSamples.get(k).push(v)
      }
      ok++
    }
    if (!ok) continue
    for (const [k, arr] of countSamples) countMed.set(k, median(arr))
    out[bench] = {
      files: ok,
      medianWindowMs: median(windows),
      selfMs: [...selfTotals.entries()]
        .map(([k, us]) => [k, us / 1000 / ok])
        .sort((a, b) => b[1] - a[1]),
      counts: [...countMed.entries()].sort((a, b) => b[1] - a[1]),
    }
  }
  return out
}

const dirs = process.argv.slice(2)
if (!dirs.length) {
  console.error('usage: node analyze-blink-phases.mjs <traceDir> [...]')
  process.exit(1)
}

const results = dirs.map((d) => ({ label: path.basename(d), data: analyzeDir(d) }))
const benches = [...new Set(results.flatMap((r) => Object.keys(r.data)))].sort()

for (const bench of benches) {
  console.log(`\n${'='.repeat(78)}\n${bench}\n${'='.repeat(78)}`)
  for (const { label, data } of results) {
    const r = data[bench]
    if (!r) {
      console.log(`\n  ${label}: (no usable traces)`)
      continue
    }
    const win = r.medianWindowMs
    console.log(`\n  ── ${label} ── median window ${win.toFixed(1)}ms  (${r.files} traces)`)
    const top = r.selfMs.slice(0, 10)
    for (const [name, ms] of top) {
      const pct = win > 0 ? (100 * ms) / win : 0
      console.log(`     ${pct.toFixed(1).padStart(5)}%  ${ms.toFixed(2).padStart(7)}ms  ${name}`)
    }
    const interesting = r.counts.filter(([n]) =>
      [
        'Layout',
        'UpdateLayoutTree',
        'Paint',
        'Commit',
        'FunctionCall',
        'EventDispatch',
        'FireAnimationFrame',
        'TimerFire',
        'ParseHTML',
        'MajorGC',
        'MinorGC',
        'HitTest',
        'PrePaint',
        'Layerize',
        'RasterTask',
      ].includes(n)
    )
    console.log(
      `     counts: ${interesting.map(([n, c]) => `${n} ${c}`).join(' · ') || '(none)'}`
    )
  }
}
