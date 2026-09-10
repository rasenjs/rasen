#!/usr/bin/env node
/* eslint-disable */

/**
 * Is the applier LOOP the 1.5 ms? And would a flat record list beat today's
 * per-bone entry with four nullable slots?
 *
 * Prerequisite check before touching production code. The previous structural
 * hypothesis (bezier table layout) LOOKED better on paper and measured as a
 * 0.76 ms regression, so every structural idea gets measured here first.
 *
 * Structure under test is taken from the real c310 'action' animation: for
 * every bone that carries any timeline, which kinds it has (rotate / translate
 * / scale / shear, the latter three two-channel). Both variants call the SAME
 * sampler and make the SAME writes to the same Bone objects, so the only
 * difference measured is loop shape.
 *
 *   A: today — compiled.bones[i] entries each holding four nullable slots
 *      (rotate/translate/scale/shear), each with its own gate/setup/channel
 *      chain. Costs 6 property loads + 4 nullish checks per entry regardless of
 *      how many channels the bone actually has.
 *   B: flat — one record per (bone, kind) with an explicit kind tag, so absent
 *      kinds simply are not in the list and there is no descent chain.
 *
 * Usage: node probe-applier-loop.mjs [instances] [iterations]
 */

import fs from 'node:fs'
import { parseSpineBinary } from '../../packages/assets/dist/index.js'

const N = Number(process.argv[2] || 200)
const ITER = Number(process.argv[3] || 2000)
const ROUNDS = 5

const data = parseSpineBinary(new Uint8Array(fs.readFileSync('public/c310_00.skel')), 1)
const anim = data.animations[Object.keys(data.animations)[0]]

// --- real per-bone kind composition -----------------------------------------
const KINDS = ['rotate', 'translate', 'scale', 'shear']
const composition = []
let channelCount = 0
let trackCount = 0
for (const name of Object.keys(anim.bones ?? {})) {
  const tl = anim.bones[name]
  const kinds = []
  for (const k of KINDS) {
    const arr = tl[k]
    if (arr && arr.length) {
      kinds.push(k)
      // translate/scale/shear carry tx and ty → two sampler calls
      channelCount += k === 'rotate' ? 1 : 2
      trackCount++
    }
  }
  if (kinds.length) composition.push(kinds)
}
console.log(`c310 "${Object.keys(data.animations)[0]}": ${composition.length} bone entries, ${trackCount} timeline objects, ${channelCount} sampler calls`)

// --- shared channel data + sampler (mirrors the real one) -------------------
let seed = 987654321
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const TS = 512

function makeChannel(n) {
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
  if (rnd() < 0.82) {
    curves = new Float64Array(segCount * 4)
    tables = new Array(segCount).fill(null)
    for (let i = 0; i < segCount; i++) {
      types[i] = 2
      curves[i * 4] = 0.25
      curves[i * 4 + 1] = 0.1
      curves[i * 4 + 2] = 0.75
      curves[i * 4 + 3] = 0.9
      tables[i] = SHARED_TABLE
    }
  }
  return { times, v, types, curves, tables, lastTime: -1, lastSeg: -1 }
}
const SHARED_TABLE = new Float32Array(TS)
for (let k = 0; k < TS; k++) {
  const x = k / (TS - 1)
  const s = x * x * (3 - 2 * x) * 0.5 + x * 0.5
  SHARED_TABLE[k] = s
}

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
  if (type === 2 && ch.curves) {
    const tbl = ch.tables[lo]
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

// --- A: today's shape -------------------------------------------------------
function buildA() {
  const bonesA = []
  for (const kinds of composition) {
    const bone = { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 }
    const e = { bone, rotate: null, translate: null, scale: null, shear: null }
    for (const k of kinds) {
      const n = 1 + ((rnd() * 9) | 0)
      if (k === 'rotate') e.rotate = { gate: 0, setup: rnd(), ch: makeChannel(n) }
      else if (k === 'translate') e.translate = { gate: 0, setupX: rnd(), setupY: rnd(), ch: { tx: makeChannel(n), ty: makeChannel(n) } }
      else if (k === 'scale') e.scale = { gate: 0, setupX: 1, setupY: 1, ch: { tx: makeChannel(n), ty: makeChannel(n) } }
      else e.shear = { gate: 0, setupX: 0, setupY: 0, ch: { tx: makeChannel(n), ty: makeChannel(n) } }
    }
    bonesA.push(e)
  }
  return bonesA
}

function applyA(bones, time) {
  for (let i = 0, n = bones.length; i < n; i++) {
    const e = bones[i]
    const b = e.bone
    const rot = e.rotate
    if (rot && time >= rot.gate) b.rotation = rot.setup + sample1D(rot.ch, time)
    const tr = e.translate
    if (tr && time >= tr.gate) {
      b.x = tr.setupX + sample1D(tr.ch.tx, time)
      b.y = tr.setupY + sample1D(tr.ch.ty, time)
    }
    const sc = e.scale
    if (sc && time >= sc.gate) {
      b.scaleX = sc.setupX * sample1D(sc.ch.tx, time)
      b.scaleY = sc.setupY * sample1D(sc.ch.ty, time)
    }
    const sh = e.shear
    if (sh && time >= sh.gate) {
      b.shearX = sh.setupX + sample1D(sh.ch.tx, time)
      b.shearY = sh.setupY + sample1D(sh.ch.ty, time)
    }
  }
}

// --- B: flat records --------------------------------------------------------
const KIND_ROTATE = 0
const KIND_ADD = 1
const KIND_MUL = 2

function buildB() {
  const flat = []
  for (const kinds of composition) {
    const bone = { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 }
    for (const k of kinds) {
      const n = 1 + ((rnd() * 9) | 0)
      if (k === 'rotate') flat.push({ kind: KIND_ROTATE, bone, gate: 0, a: rnd(), b: 0, ch: makeChannel(n), ch2: null })
      else if (k === 'translate') flat.push({ kind: KIND_ADD, bone, gate: 0, a: rnd(), b: rnd(), ch: makeChannel(n), ch2: makeChannel(n) })
      else if (k === 'scale') flat.push({ kind: KIND_MUL, bone, gate: 0, a: 1, b: 1, ch: makeChannel(n), ch2: makeChannel(n) })
      else flat.push({ kind: KIND_ADD, bone, gate: 0, a: 0, b: 0, ch: makeChannel(n), ch2: makeChannel(n) })
    }
  }
  return flat
}

function applyB(list, time) {
  for (let i = 0, n = list.length; i < n; i++) {
    const r = list[i]
    if (time < r.gate) continue
    const b = r.bone
    if (r.kind === KIND_ROTATE) {
      b.rotation = r.a + sample1D(r.ch, time)
    } else if (r.kind === KIND_MUL) {
      b.scaleX = r.a * sample1D(r.ch, time)
      b.scaleY = r.b * sample1D(r.ch2, time)
    } else {
      b.x = r.a + sample1D(r.ch, time)
      b.y = r.b + sample1D(r.ch2, time)
    }
  }
}

function bench(label, instances, fn) {
  for (let r = 0; r < 20; r++) for (let i = 0; i < instances.length; i++) fn(instances[i], 0.5)
  let best = Infinity
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now()
    for (let k = 0; k < ITER; k++) {
      const t = 0.3 + ((k % 100) * 0.02)
      for (let i = 0; i < instances.length; i++) fn(instances[i], t)
    }
    const ms = performance.now() - t0
    if (ms < best) best = ms
  }
  const perInstance = (best * 1000) / (ITER * instances.length)
  console.log(`${label.padEnd(30)} ${perInstance.toFixed(3).padStart(8)} us/instance/frame`)
  return perInstance
}

console.log(`instances=${N} iterations=${ITER} rounds=${ROUNDS} (each instance is a DISTINCT skeleton)`)
console.log('')
const instA = []
for (let i = 0; i < N; i++) instA.push(buildA())
const instB = []
for (let i = 0; i < N; i++) instB.push(buildB())
const a = bench('A: today (4 nullable slots)', instA, applyA)
const b = bench('B: flat records + kind tag', instB, applyB)
console.log('')
console.log(`B is ${(((a - b) / a) * 100).toFixed(1)}% ${b < a ? 'faster' : 'slower'} than A`)
console.log(`measured timeline-loop cost per instance: A ${a.toFixed(3)} us, B ${b.toFixed(3)} us`)
console.log(`(the in-app attribution claims our timelines+glue is ~18 us/instance)`)
