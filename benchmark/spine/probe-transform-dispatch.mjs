#!/usr/bin/env node
/* eslint-disable */

/**
 * String switch vs numeric enum for `bone.transform` (official uses numeric).
 *
 * The pose solve is now known to be INSTRUCTION-bound: per-instance cost is flat
 * from N=8 to N=200 and the official ratio is already 1.36x at N=1, so cache
 * footprint is not a factor for this workload. That makes a plain ns/op
 * micro-benchmark representative again — the earlier "micro-benchmarks need real
 * cache pressure" rule was derived from a cache-bound assumption that has since
 * been disproven for this code.
 *
 * Our `boneUpdateWorldTransformWith` switches on `bone.transform` with five
 * STRING cases; official switches on a numeric `TransformMode`. This measures
 * the same dispatch both ways on the same data.
 *
 * Usage: node probe-transform-dispatch.mjs [bones] [iterations]
 */

const BONES = Number(process.argv[2] || 204)
const ITER = Number(process.argv[3] || 200000)
const ROUNDS = 7

// Realistic mix: spine skeletons are overwhelmingly 'normal'; the NIKKE assets
// only use 'normal' and occasionally 'noScale'.
function makeStrings() {
  const out = new Array(BONES)
  for (let i = 0; i < BONES; i++) out[i] = i % 37 === 0 ? 'noScale' : 'normal'
  return out
}
function makeNumbers() {
  const out = new Array(BONES)
  for (let i = 0; i < BONES; i++) out[i] = i % 37 === 0 ? 4 : 0
  return out
}

const S = makeStrings()
const N = makeNumbers()

// The bodies mirror the real functions closely enough that the dispatch is the
// only difference under test: a few float ops and six field writes per bone.
function work(x, y, s) {
  return x * 1.5 + y * 0.5 + s
}

function updateString(bones, out) {
  for (let i = 0, n = bones.length; i < n; i++) {
    const t = bones[i]
    const x = out[i * 6]
    const y = out[i * 6 + 1]
    switch (t) {
      case 'normal': {
        out[i * 6] = work(x, y, 1)
        out[i * 6 + 1] = work(y, x, 2)
        out[i * 6 + 2] = work(x, x, 3)
        out[i * 6 + 3] = work(y, y, 4)
        break
      }
      case 'onlyTranslation': {
        out[i * 6] = work(x, y, 5)
        out[i * 6 + 1] = work(y, x, 6)
        out[i * 6 + 2] = work(x, x, 7)
        out[i * 6 + 3] = work(y, y, 8)
        break
      }
      case 'noRotationOrReflection': {
        out[i * 6] = work(x, y, 9)
        out[i * 6 + 1] = work(y, x, 10)
        out[i * 6 + 2] = work(x, x, 11)
        out[i * 6 + 3] = work(y, y, 12)
        break
      }
      case 'noScale':
      case 'noScaleOrReflection': {
        out[i * 6] = work(x, y, 13)
        out[i * 6 + 1] = work(y, x, 14)
        out[i * 6 + 2] = work(x, x, 15)
        out[i * 6 + 3] = work(y, y, 16)
        break
      }
      default: {
        out[i * 6] = x
        break
      }
    }
  }
}

function updateNumber(bones, out) {
  for (let i = 0, n = bones.length; i < n; i++) {
    const t = bones[i]
    const x = out[i * 6]
    const y = out[i * 6 + 1]
    switch (t) {
      case 0: {
        out[i * 6] = work(x, y, 1)
        out[i * 6 + 1] = work(y, x, 2)
        out[i * 6 + 2] = work(x, x, 3)
        out[i * 6 + 3] = work(y, y, 4)
        break
      }
      case 1: {
        out[i * 6] = work(x, y, 5)
        out[i * 6 + 1] = work(y, x, 6)
        out[i * 6 + 2] = work(x, x, 7)
        out[i * 6 + 3] = work(y, y, 8)
        break
      }
      case 2: {
        out[i * 6] = work(x, y, 9)
        out[i * 6 + 1] = work(y, x, 10)
        out[i * 6 + 2] = work(x, x, 11)
        out[i * 6 + 3] = work(y, y, 12)
        break
      }
      case 4:
      case 5: {
        out[i * 6] = work(x, y, 13)
        out[i * 6 + 1] = work(y, x, 14)
        out[i * 6 + 2] = work(x, x, 15)
        out[i * 6 + 3] = work(y, y, 16)
        break
      }
      default: {
        out[i * 6] = x
        break
      }
    }
  }
}

const buf = new Float64Array(BONES * 6)
for (let i = 0; i < buf.length; i++) buf[i] = i * 0.001

// One batch = one "instance frame". The app is 200 instances, so report the
// per-instance figure at the same 200-instance scale for comparability.
const INSTANCES = 200

function bench(label, fn, arg) {
  for (let i = 0; i < 200; i++) fn(arg, buf)
  let best = Infinity
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now()
    for (let k = 0; k < ITER; k++) fn(arg, buf)
    const ms = performance.now() - t0
    if (ms < best) best = ms
  }
  const nsPerBone = (best * 1e6) / (ITER * BONES)
  const msPerFrame = (best / ITER) * INSTANCES
  console.log(`${label.padEnd(34)} ${nsPerBone.toFixed(2).padStart(6)} ns/bone   ${msPerFrame.toFixed(3).padStart(7)} ms/frame @${INSTANCES}`)
  return { nsPerBone, msPerFrame }
}

console.log(`bones/instance=${BONES} iterations=${ITER} rounds=${ROUNDS}`)
console.log('')
const s = bench('string switch (ours)', updateString, S)
const n = bench('numeric switch (official)', updateNumber, N)
console.log('')
console.log(`  delta ${(s.nsPerBone - n.nsPerBone).toFixed(2)} ns/bone`)
console.log(`  => ${(s.msPerFrame - n.msPerFrame).toFixed(3)} ms/frame at ${INSTANCES} instances`)
console.log('')
console.log('Interpretation: if the delta is ~0 the dispatch is NOT worth changing;')
console.log('V8 already pointer-compares the interned string literals. If it is a')
console.log('meaningful fraction of a cycle per bone, converting `Bone.transform`')
console.log('(and `BoneData.transform`) to a numeric enum is worth doing.')
