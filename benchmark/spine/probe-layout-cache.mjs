#!/usr/bin/env node
/* eslint-disable */

/**
 * THE layout question, asked with realistic cache pressure.
 *
 * Every micro-benchmark in this project so far sized a single channel set and
 * looped it, i.e. everything stayed resident in L1/L2. That is why the sampler
 * measured 8 ns/call there but ~28 ns/call inside the app: the app touches
 * 200 skeletons' worth of channel data (~15 MB), so every sample is a handful
 * of cache misses, not arithmetic.
 *
 * That invalidates the earlier verdict on data layout. "Our parallel Float64
 * layout is 53% faster per call than official's interleaved Float32 one" was
 * measured L1-resident, where layout does not matter. Under real cache pressure
 * the number of distinct cache lines touched per sample is what dominates, and
 * ours touches more streams (times, values, types, curves, table pointers, then
 * the shared table) than official's does (frames + inline curve data).
 *
 * Variants, all driving the SAME loop shape and the same logical work
 * (binary search for the segment, then curve-eased interpolation):
 *
 *   A     ours: parallel times/v + types + curves + pointer to a SHARED
 *         512-entry table (what production does via curveTableCache)
 *   A_ns  ours, but each segment owns its own 512-entry table (no sharing), to
 *         separate "layout" from "table sharing"
 *   B     official: interleaved Float32 [time, value, ...] with the 9-sample
 *         bezier table inlined in a Float32Array next to the frames
 *
 * Usage: node probe-layout-cache.mjs [instances] [iterations]
 */

import fs from 'node:fs'
import { parseSpineBinary } from '../../packages/assets/dist/index.js'

const N = Number(process.argv[2] || 200)
const ITER = Number(process.argv[3] || 400)
const ROUNDS = 5
const TS = 512 // our table size
const BEZIER_SIZE = 18 // official's: 9 samples x 2 (x, y)

const data = parseSpineBinary(new Uint8Array(fs.readFileSync('public/c310_00.skel')), 1)
const anim = data.animations[Object.keys(data.animations)[0]]
const KINDS = ['rotate', 'translate', 'scale', 'shear']
const composition = []
let callCount = 0
for (const name of Object.keys(anim.bones ?? {})) {
  const tl = anim.bones[name]
  const kinds = []
  for (const k of KINDS) {
    if (tl[k] && tl[k].length) {
      kinds.push(k)
      callCount += k === 'rotate' ? 1 : 2
    }
  }
  if (kinds.length) composition.push(kinds)
}
console.log(`c310 "action": ${composition.length} entries, ${callCount} sampler calls/frame`)
console.log(`instances=${N} iterations=${ITER} rounds=${ROUNDS}\n`)

let seed = 987654321
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

// The editor's default ease repeats across the whole project, which is exactly
// why curveTableCache can share tables at all.
const SHARED512 = new Float32Array(TS)
for (let k = 0; k < TS; k++) {
  const x = k / (TS - 1)
  SHARED512[k] = x * x * (3 - 2 * x) * 0.5 + x * 0.5
}
const SHARED_EASE = [0.25, 0.1, 0.75, 0.9]
function easeYbeziers() {
  // crude but monotone: sample the same control points to fill official's table
  return SHARED512
}

/** Per-channel keyframe count mirrors the real average (~5.7). */
const kfCount = () => 1 + ((rnd() * 9) | 0)

// --- A: our production layout ------------------------------------------------
function makeChannelOurs(shareTables) {
  const n = kfCount()
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
  const curves = new Float64Array(segCount * 4)
  const tables = new Array(segCount)
  for (let i = 0; i < segCount; i++) {
    if (rnd() < 0.82) {
      types[i] = 2
      curves[i * 4] = SHARED_EASE[0]
      curves[i * 4 + 1] = SHARED_EASE[1]
      curves[i * 4 + 2] = SHARED_EASE[2]
      curves[i * 4 + 3] = SHARED_EASE[3]
      tables[i] = shareTables ? SHARED512 : SHARED512.slice()
    }
  }
  return { times, v, types, curves, tables }
}

function sampleOurs(ch, time) {
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
  const v0 = ch.v[lo]
  const v1 = ch.v[lo + 1]
  if (ch.types[lo] === 2) {
    const tbl = ch.tables[lo]
    if (tbl) {
      const t = f * (TS - 1)
      const i = t | 0
      if (i >= TS - 1) return v0 + (v1 - v0) * tbl[TS - 1]
      return v0 + (v1 - v0) * (tbl[i] + (tbl[i + 1] - tbl[i]) * (t - i))
    }
  }
  return v0 + (v1 - v0) * f
}

// --- B: official's layout ----------------------------------------------------
// Frames interleaved [time, value, time, value, ...] as Float32.
// Curve data: BEZIER_SIZE floats per segment appended after the frames, where
// the odd entries are y samples for the linear-in-x easing (official stores
// pairs (x, y) of the bezier curve samples).
function makeChannelOfficial() {
  const n = kfCount()
  const segCount = Math.max(1, n - 1)
  const frames = new Float32Array(n * 2)
  let t = 0
  for (let i = 0; i < n; i++) {
    t += 0.05 + rnd() * 0.1
    frames[i * 2] = t
    frames[i * 2 + 1] = rnd() * 100 - 50
  }
  const curves = new Float32Array(segCount * BEZIER_SIZE)
  for (let i = 0; i < segCount; i++) {
    if (rnd() < 0.82) {
      const base = i * BEZIER_SIZE
      for (let s = 0; s < BEZIER_SIZE / 2; s++) {
        const x = s / (BEZIER_SIZE / 2 - 1)
        curves[base + s * 2] = x
        curves[base + s * 2 + 1] = x * x * (3 - 2 * x) * 0.5 + x * 0.5
      }
    }
  }
  return { frames, curves, frameCount: n }
}

function sampleOfficial(ch, time) {
  const n = ch.frameCount
  if (n === 1) return ch.frames[1]
  if (time <= ch.frames[0]) return ch.frames[1]
  if (time >= ch.frames[(n - 1) * 2]) return ch.frames[(n - 1) * 2 + 1]
  // binary search over frames
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (ch.frames[mid * 2] <= time) lo = mid
    else hi = mid - 1
  }
  const ta = ch.frames[lo * 2]
  const span = ch.frames[(lo + 1) * 2] - ta
  const f = span <= 1e-7 ? 0 : (time - ta) / span
  const v0 = ch.frames[lo * 2 + 1]
  const v1 = ch.frames[(lo + 1) * 2 + 1]
  const base = lo * BEZIER_SIZE
  if (ch.curves[base] !== 0 || ch.curves[base + 1] !== 0) {
    // find the sample pair whose x <= f
    let c = 0
    const steps = BEZIER_SIZE / 2
    while (c < steps - 1 && ch.curves[base + (c + 1) * 2] <= f) c++
    const x0 = ch.curves[base + c * 2]
    const y0 = ch.curves[base + c * 2 + 1]
    const x1 = c < steps - 1 ? ch.curves[base + (c + 1) * 2] : 1
    const y1 = c < steps - 1 ? ch.curves[base + (c + 1) * 2 + 1] : 1
    const sub = x1 - x0 <= 1e-7 ? 0 : (f - x0) / (x1 - x0)
    const eased = y0 + (y1 - y0) * sub
    return v0 + (v1 - v0) * eased
  }
  return v0 + (v1 - v0) * f
}

// --- build instance pools ---------------------------------------------------
// The app parses the skeleton ONCE and constructs N skeletons from it
// (`skeletonData.value` is shared), so the channel data is a single hot copy
// while the Bone objects are per-instance. That makes the write side the cache
// problem, not the read side — model both.
function buildOursSharedChannels() {
  const template = buildOurs(true)
  const out = []
  for (let i = 0; i < N; i++) {
    const copy = []
    for (const e of template) {
      const c = { bone: { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 } }
      if (e.rotate) c.rotate = { setup: e.rotate.setup, ch: e.rotate.ch }
      if (e.translate) c.translate = { sx: e.translate.sx, sy: e.translate.sy, ch: e.translate.ch }
      if (e.scale) c.scale = { sx: e.scale.sx, sy: e.scale.sy, ch: e.scale.ch }
      if (e.shear) c.shear = { sx: e.shear.sx, sy: e.shear.sy, ch: e.shear.ch }
      copy.push(c)
    }
    out.push(copy)
  }
  return out
}

function buildOurs(shareTables) {
  const out = []
  for (const kinds of composition) {
    const e = { bone: { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 } }
    for (const k of kinds) {
      if (k === 'rotate') e.rotate = { setup: rnd(), ch: makeChannelOurs(shareTables) }
      else if (k === 'translate') e.translate = { sx: rnd(), sy: rnd(), ch: [makeChannelOurs(shareTables), makeChannelOurs(shareTables)] }
      else if (k === 'scale') e.scale = { sx: 1, sy: 1, ch: [makeChannelOurs(shareTables), makeChannelOurs(shareTables)] }
      else e.shear = { sx: 0, sy: 0, ch: [makeChannelOurs(shareTables), makeChannelOurs(shareTables)] }
    }
    out.push(e)
  }
  return out
}

function buildOfficial() {
  const out = []
  for (const kinds of composition) {
    const e = { bone: { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 } }
    for (const k of kinds) {
      if (k === 'rotate') e.rotate = { setup: rnd(), ch: [makeChannelOfficial()] }
      else if (k === 'translate') e.translate = { sx: rnd(), sy: rnd(), ch: [makeChannelOfficial(), makeChannelOfficial()] }
      else if (k === 'scale') e.scale = { sx: 1, sy: 1, ch: [makeChannelOfficial(), makeChannelOfficial()] }
      else e.shear = { sx: 0, sy: 0, ch: [makeChannelOfficial(), makeChannelOfficial()] }
    }
    out.push(e)
  }
  return out
}

function applyOurs(bones, time) {
  for (let i = 0, n = bones.length; i < n; i++) {
    const e = bones[i]
    const b = e.bone
    const rot = e.rotate
    if (rot) b.rotation = rot.setup + sampleOurs(rot.ch, time)
    const tr = e.translate
    if (tr) {
      b.x = tr.sx + sampleOurs(tr.ch[0], time)
      b.y = tr.sy + sampleOurs(tr.ch[1], time)
    }
    const sc = e.scale
    if (sc) {
      b.scaleX = sc.sx * sampleOurs(sc.ch[0], time)
      b.scaleY = sc.sy * sampleOurs(sc.ch[1], time)
    }
    const sh = e.shear
    if (sh) {
      b.shearX = sh.sx + sampleOurs(sh.ch[0], time)
      b.shearY = sh.sy + sampleOurs(sh.ch[1], time)
    }
  }
}

function applyOfficial(bones, time) {
  for (let i = 0, n = bones.length; i < n; i++) {
    const e = bones[i]
    const b = e.bone
    const rot = e.rotate
    if (rot) b.rotation = rot.setup + sampleOfficial(rot.ch[0], time)
    const tr = e.translate
    if (tr) {
      b.x = tr.sx + sampleOfficial(tr.ch[0], time)
      b.y = tr.sy + sampleOfficial(tr.ch[1], time)
    }
    const sc = e.scale
    if (sc) {
      b.scaleX = sc.sx * sampleOfficial(sc.ch[0], time)
      b.scaleY = sc.sy * sampleOfficial(sc.ch[1], time)
    }
    const sh = e.shear
    if (sh) {
      b.shearX = sh.sx + sampleOfficial(sh.ch[0], time)
      b.shearY = sh.sy + sampleOfficial(sh.ch[1], time)
    }
  }
}

function bench(label, instances, fn) {
  for (let r = 0; r < 15; r++) for (let i = 0; i < instances.length; i++) fn(instances[i], 0.5)
  let best = Infinity
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now()
    for (let k = 0; k < ITER; k++) {
      const t = 0.3 + (k % 100) * 0.02
      for (let i = 0; i < instances.length; i++) fn(instances[i], t)
    }
    const ms = performance.now() - t0
    if (ms < best) best = ms
  }
  const perInstance = (best * 1000) / (ITER * instances.length)
  const perCall = (best * 1e6) / (ITER * instances.length * callCount)
  console.log(`${label.padEnd(34)} ${perInstance.toFixed(3).padStart(8)} us/inst   ${perCall.toFixed(2).padStart(6)} ns/call`)
  return perInstance
}

const res = {}
for (const [key, builder, applier] of [
  ['A', () => buildOurs(true), applyOurs],
  ['A_app', buildOursSharedChannels, applyOurs],
  ['A_ns', () => buildOurs(false), applyOurs],
  ['B', buildOfficial, applyOfficial],
]) {
  const pool = []
  for (let i = 0; i < N; i++) pool.push(builder())
  const label =
    key === 'A'
      ? 'A: ours (parallel, shared tables)'
      : key === 'A_app'
        ? 'A_app: ours, SHARED channels (= app)'
        : key === 'A_ns'
          ? 'A_ns: ours (parallel, own tables)'
          : 'B: official (interleaved, inline)'
  res[key] = bench(label, pool, applier)
  void pool
}
console.log('')
console.log(`A_app vs A (read-side cache pressure removed): ${(((res.A_app - res.A) / res.A) * 100).toFixed(1)}%`)
console.log(`A_ns vs A (table sharing):                     ${(((res.A_ns - res.A) / res.A) * 100).toFixed(1)}% extra with unshared tables`)
console.log(`B vs A (layout):                               ${(((res.B - res.A) / res.A) * 100).toFixed(1)}% ${res.B < res.A ? 'faster' : 'slower'}`)
console.log(`B vs A_ns (layout only):                       ${(((res.B - res.A_ns) / res.A_ns) * 100).toFixed(1)}% ${res.B < res.A_ns ? 'faster' : 'slower'}`)
console.log('')
console.log(`In-app measurement of the SAME work (timelines+glue) is ~18.1 us/inst.`)
console.log('Compare A_app with it: if A_app is far below 18.1, the remainder is real glue,')
console.log('not sampling. If A_app is close to 18.1, the sampling loop already accounts for it.')
