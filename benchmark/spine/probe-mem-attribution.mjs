#!/usr/bin/env node
/* eslint-disable */

/**
 * Precise per-component attribution of the ~231 KB each skeleton costs.
 *
 * The working set is the suspected root cause of the remaining pose gap (pose
 * 1.36x official while the render side is at parity), and Bone/Slot/Map are all
 * traversed every frame. Before shrinking anything, find out what actually
 * dominates rather than guessing.
 *
 * Method: build instances from progressively stripped SkeletonData and take
 * differences, then calibrate the unit costs of the raw containers so the
 * residue can be explained rather than hand-waved.
 *
 *   A  full data                     -> bones + slots + maps + arrays
 *   B  slots emptied                 -> bones + boneMap + arrays
 *   C  bones and slots emptied       -> skeleton object + empty arrays/maps
 *
 *   slot cost ~= A - B      bone cost ~= B - C      base ~= C
 *
 * Run with: node --expose-gc probe-mem-attribution.mjs
 */

import fs from 'node:fs'
import { parseSpineBinary, Skeleton } from '../../packages/assets/dist/index.js'

if (!global.gc) {
  console.error('Run with: node --expose-gc probe-mem-attribution.mjs')
  process.exit(1)
}

const buf = new Uint8Array(fs.readFileSync('public/c310_00.skel'))
const data = parseSpineBinary(buf, 1)
const N = 200

function heap() {
  global.gc()
  global.gc()
  return process.memoryUsage().heapUsed
}

/** Bytes per item for `make()` over N items, after forced GC. */
function unit(label, count, make) {
  const base = heap()
  const keep = new Array(count)
  for (let i = 0; i < count; i++) keep[i] = make(i)
  const after = heap()
  const per = (after - base) / count
  void keep.length
  console.log(`    ${label.padEnd(42)} ${per.toFixed(1).padStart(8)} B each`)
  return per
}

function perInstance(label, makeData) {
  const d = makeData()
  const base = heap()
  const keep = new Array(N)
  for (let i = 0; i < N; i++) keep[i] = new Skeleton(d)
  const after = heap()
  const per = (after - base) / N / 1024
  void keep.length
  console.log(`  ${label.padEnd(44)} ${per.toFixed(1).padStart(8)} KB/instance`)
  return per
}

console.log('=== calibration: what the raw containers cost ===')
const uEmptyArray = unit('empty array []', 200000, () => [])
const uF32x4 = unit('Float32Array(4)', 200000, () => new Float32Array(4))
const uObj28 = unit(
  'plain object, 28 numeric fields',
  200000,
  () => ({
    a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1, j: 1, k: 1, l: 1, m: 1, n: 1,
    o: 1, p: 1, q: 1, r: 1, s: 1, t: 1, u: 1, v: 1, w: 1, x: 1, y: 1, z: 1, aa: 1, ab: 1,
  })
)
const uObj11 = unit(
  'plain object, 11 fields (mixed)',
  200000,
  () => ({ data: null, bone: null, color: 'FFFFFFFF', c0: 1, c1: 1, c2: 1, c3: 1, att: undefined, deform: null, seq: -1, extra: 0 })
)
const uMapEntry = (() => {
  const count = 200
  const base = heap()
  const keep = []
  for (let i = 0; i < 200; i++) {
    const m = new Map()
    for (let j = 0; j < count; j++) m.set(`bone_${j}_name`, { j })
    keep.push(m)
  }
  const after = heap()
  const per = (after - base) / 200 / count
  void keep.length
  console.log(`    ${'Map entry (string key -> value)'.padEnd(42)} ${per.toFixed(1).padStart(8)} B each`)
  return per
})()
console.log(`    ${'string (short, interned-ish)'.padEnd(42)} ${'~'.padStart(8)}`)

console.log('')
console.log('=== per-instance attribution ===')
const A = perInstance('A  full data (bones + slots)', () => data)
const B = perInstance('B  slots emptied (bones only)', () => ({ ...data, slots: [] }))
const C = perInstance('C  bones + slots emptied (base)', () => ({ ...data, bones: [], slots: [] }))

const boneCount = data.bones.length
const slotCount = data.slots.length
const slotKB = A - B
const boneKB = B - C
const baseKB = C

console.log('')
console.log('=== attribution summary ===')
console.log(`  bones   ${boneCount}   ${boneKB.toFixed(1)} KB  = ${((boneKB * 1024) / boneCount).toFixed(0)} B/bone`)
console.log(`  slots   ${slotCount}   ${slotKB.toFixed(1)} KB  = ${((slotKB * 1024) / slotCount).toFixed(0)} B/slot`)
console.log(`  base            ${baseKB.toFixed(1)} KB`)
console.log(`  total           ${A.toFixed(1)} KB`)
console.log('')
console.log('=== residue check ===')
const boneExpectedKB = (boneCount * (uObj28 + uEmptyArray)) / 1024
const slotExpectedKB = (slotCount * (uObj11 + uF32x4)) / 1024
const mapKB = ((boneCount + slotCount) * uMapEntry) / 1024
console.log(`  bones  raw objects + children arrays : ${boneExpectedKB.toFixed(1)} KB`)
console.log(`  slots  raw object + colorN Float32   : ${slotExpectedKB.toFixed(1)} KB`)
console.log(`  maps   boneMap + slotMap entries     : ${mapKB.toFixed(1)} KB`)
const explained = boneExpectedKB + slotExpectedKB + mapKB
console.log(`  explained                            : ${explained.toFixed(1)} KB`)
console.log(`  measured total                       : ${A.toFixed(1)} KB`)
console.log(`  residue                              : ${(A - explained).toFixed(1)} KB`)
console.log('')
console.log('If the residue is large, something else dominates and the object-field')
console.log('hunting above is not where the win is. If bones dominate, the 28-field')
console.log('Bone is the target (it is also the object updateWorldTransform walks).')
