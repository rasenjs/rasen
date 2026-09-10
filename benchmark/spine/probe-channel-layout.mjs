#!/usr/bin/env node
/* eslint-disable */

/**
 * Where does the per-sample cost go, and would a layout redesign help?
 *
 * Method: same data, same process, two implementations of identical work. That
 * is the only micro-benchmark shape that survived this project's earlier
 * failures — data-mutation variants were unusable because V8 optimizes
 * different workloads differently, and cross-runtime Node numbers were
 * inflated for the official bundle.
 *
 * Channel characteristics come from a real c310 'action' measurement:
 *   258 bone channels, keyframes-per-channel histogram HIST below,
 *   212 of them (82%) carrying bezier segments.
 *
 * Variants (both walk the FULL path including the bezier lookup, so the
 * comparison is the real per-sample cost, not just the linear case):
 *   A: our current shape — parallel Float64 times[]/v[], Uint8 types[],
 *      per-segment table objects reached through an (Float32Array|null)[],
 *      sampled through a sample1D() call.
 *   B: official's shape — ONE interleaved Float32 frames[] (time,value),
 *      one curves[] per timeline holding BEZIER_SIZE=18 floats per bezier
 *      segment, sampled inline with a binary search over the stored samples.
 *
 * Usage: node probe-channel-layout.mjs [channels] [iterations]
 */

const CHANNELS = Number(process.argv[2] || 258)
const ITER = Number(process.argv[3] || 20000)
const ROUNDS = 5

// c310 'action' keyframes-per-channel histogram, measured from the asset.
const HIST = [
  [1, 14], [2, 32], [3, 24], [4, 29], [5, 40], [6, 7], [7, 21],
  [8, 58], [9, 21], [10, 6], [12, 1], [14, 3], [20, 2]
]
const KF_COUNTS = []
for (const [n, count] of HIST) for (let i = 0; i < count; i++) KF_COUNTS.push(n)
while (KF_COUNTS.length < CHANNELS) KF_COUNTS.push(6)

let seed = 12345
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

const TS = 512 // our CURVE_TABLE_SIZE
const BEZIER_SIZE = 18 // official's per-bezier stride in floats

/** Cheap stand-in for the exact bezier solve: only the per-sample LOOKUP cost
 * is being compared, and table building happens once at compile time. */
const shapeT = (t) => t * t * (3 - 2 * t) * 0.5 + t * 0.5
const shapeY = (t) => t * t * (3 - 2 * t)

// --- A: our shape -----------------------------------------------------------
const A = KF_COUNTS.map((n, ci) => {
  const times = new Float64Array(n)
  const v = new Float64Array(n)
  let t = 0
  for (let i = 0; i < n; i++) {
    t += 0.05 + rnd() * 0.1
    times[i] = t
    v[i] = rnd() * 100 - 50
  }
  const segCount = Math.max(1, n - 1)
  const types = new Uint8Array(segCount)
  let curves = null
  let tables = null
  if (ci % 100 < 82) {
    // bezier channel, as 82% of c310's bone channels are
    curves = new Float64Array(segCount * 4)
    tables = new Array(segCount).fill(null)
    for (let i = 0; i < segCount; i++) {
      types[i] = 2
      curves[i * 4] = 0.25
      curves[i * 4 + 1] = 0.1
      curves[i * 4 + 2] = 0.75
      curves[i * 4 + 3] = 0.9
      const tbl = new Float32Array(TS)
      for (let k = 0; k < TS; k++) tbl[k] = shapeY(shapeT(k / (TS - 1)))
      tables[i] = tbl
    }
  } else {
    types.fill(0)
  }
  return { times, v, types, curves, tables }
})

function sample1D(ch, time) {
  const n = ch.times.length
  if (n === 1) return ch.v[0]
  if (time <= ch.times[0]) return ch.v[0]
  const last = n - 1
  if (time >= ch.times[last]) return ch.v[last]
  let lo = 0
  let hi = last - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (ch.times[mid] <= time) lo = mid
    else hi = mid - 1
  }
  const ta = ch.times[lo]
  const span = ch.times[lo + 1] - ta
  const f = span <= 1e-7 ? 0 : (time - ta) / span
  const type = ch.types[lo]
  const v0 = ch.v[lo]
  if (type === 1) return v0
  if (type === 2 && ch.curves) {
    const tbl = ch.tables ? ch.tables[lo] : null
    if (tbl) {
      const t = f * (TS - 1)
      const i = t | 0
      if (i >= TS - 1) return v0 + (ch.v[lo + 1] - v0) * tbl[TS - 1]
      const yn = tbl[i] + (tbl[i + 1] - tbl[i]) * (t - i)
      return v0 + (ch.v[lo + 1] - v0) * yn
    }
  }
  return v0 + (ch.v[lo + 1] - v0) * f
}

// --- B: official shape ------------------------------------------------------
const B = KF_COUNTS.map((n, ci) => {
  const frames = new Float32Array(n * 2) // interleaved (time, value)
  let t = 0
  for (let i = 0; i < n; i++) {
    t += 0.05 + rnd() * 0.1
    frames[i * 2] = t
    frames[i * 2 + 1] = rnd() * 100 - 50
  }
  let curves = null
  const segCount = Math.max(1, n - 1)
  if (ci % 100 < 82) {
    curves = new Float32Array(segCount * BEZIER_SIZE)
    for (let s = 0; s < segCount; s++) {
      const base = s * BEZIER_SIZE
      for (let ii = 0; ii < 9; ii++) {
        const tt = (ii + 1) / 10
        curves[base + ii * 2] = shapeT(tt)
        curves[base + ii * 2 + 1] = shapeY(tt)
      }
    }
  }
  return { frames, curves }
})

/** Official CurveTimeline1.getCurveValue + Curve.getBezierValue. */
function getCurveValue(ch, time) {
  const frames = ch.frames
  const n = frames.length / 2
  if (n === 1) return frames[1]
  if (time <= frames[0]) return frames[1]
  if (time >= frames[(n - 1) * 2]) return frames[(n - 1) * 2 + 1]
  let lo = 0
  let hi = n - 2
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid * 2] <= time) lo = mid + 1
    else hi = mid - 1
  }
  const i = hi * 2
  const ta = frames[i]
  const span = frames[i + 2] - ta
  const f = span <= 0 ? 0 : (time - ta) / span
  const v0 = frames[i + 1]
  const v1 = frames[i + 3]
  const curves = ch.curves
  if (curves) {
    const base = (i >> 1) * BEZIER_SIZE
    let start = base
    let end = base + BEZIER_SIZE - 2
    let m = 0
    while (start <= end) {
      m = start + (((end - start) / 2) & ~1)
      if (curves[m] < f) start = m + 2
      else if (curves[m] > f) end = m - 2
      else break
    }
    if (m < base) m = base
    const px = curves[m]
    const py = curves[m + 1]
    if (start > end) {
      const nx = curves[m + 2]
      const ny = curves[m + 3]
      const yn = py + ((ny - py) * (f - px)) / (nx - px)
      return v0 + (v1 - v0) * yn
    }
    return v0 + (v1 - v0) * py
  }
  return v0 + (v1 - v0) * f
}

let sink = 0
const run = (fn, chan) => (ticks) => {
  for (let k = 0; k < ticks; k++) {
    const time = 0.2 + ((k * 0.02) % 2.5)
    for (let i = 0; i < chan.length; i++) sink += fn(chan[i], time)
  }
}

function bench(label, fn) {
  for (let i = 0; i < 200; i++) fn(1)
  let best = Infinity
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now()
    fn(ITER)
    const ms = performance.now() - t0
    if (ms < best) best = ms
  }
  const perCall = (best * 1e6) / (ITER * CHANNELS)
  console.log(`${label.padEnd(32)} ${perCall.toFixed(2).padStart(6)} ns/call`)
  return perCall
}

console.log(`${CHANNELS} channels, avg ${(KF_COUNTS.reduce((a, b) => a + b, 0) / CHANNELS).toFixed(1)} keyframes, 82% bezier, min of ${ROUNDS}`)
console.log('')
const a = bench('A: ours (parallel + call)', run(sample1D, A))
const b = bench('B: official (interleaved, inline)', run(getCurveValue, B))
console.log('')
const CALLS = 73400
console.log(`B is ${(((a - b) / a) * 100).toFixed(1)}% ${b < a ? 'faster' : 'slower'} than A`)
console.log(`at 200 instances x 367 samples = ${CALLS} calls/frame:`)
console.log(`  A: ${((a * CALLS) / 1e6).toFixed(3)} ms/frame`)
console.log(`  B: ${((b * CALLS) / 1e6).toFixed(3)} ms/frame`)
console.log(`  => redesign would save ${(((a - b) * CALLS) / 1e6).toFixed(3)} ms/frame`)
if (sink === -1) console.log('')
