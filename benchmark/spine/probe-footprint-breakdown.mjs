#!/usr/bin/env node
/* eslint-disable */

/**
 * Where does the 337 KB per skeleton go?
 *
 * Step-by-step allocation accounting, measured in Node with forced GC:
 *
 *   parse                      skeleton data only
 *   + new Skeleton(data)       per-instance object graph (bones, slots,
 *                              attachments) with NO animation involved
 *   + AnimationState + apply   adds the compiled animation structures
 *
 * If the Skeleton row is already hundreds of KB, the per-instance cost is the
 * object graph (attachment instances), not the animation compile — and the
 * remaining cache pressure has nothing to do with timeline data.
 *
 * Run with: node --expose-gc probe-footprint-breakdown.mjs
 */

import fs from 'node:fs'
import { parseSpineBinary, Skeleton, AnimationState } from '../../packages/assets/dist/index.js'

if (!global.gc) {
  console.error('Run with: node --expose-gc probe-footprint-breakdown.mjs')
  process.exit(1)
}

const buf = new Uint8Array(fs.readFileSync('public/c310_00.skel'))
const data = parseSpineBinary(buf, 1)
const animName = Object.keys(data.animations)[0]
const N = 100

function heapMB() {
  global.gc()
  global.gc()
  return process.memoryUsage().heapUsed / 1048576
}

function measure(label, build) {
  const base = heapMB()
  const keep = []
  for (let i = 0; i < N; i++) keep.push(build())
  const after = heapMB()
  const per = ((after - base) / N) * 1024
  console.log(`${label.padEnd(34)} ${per.toFixed(1).padStart(8)} KB/instance`)
  void keep.length
  return per
}

const rows = {}
rows.parse = measure('1. Skeleton instance only', () => new Skeleton(data))
rows.state = measure('2. + AnimationState', () => {
  const sk = new Skeleton(data)
  return new AnimationState(sk)
})
rows.applied = measure('3. + setAnimation + update + apply', () => {
  const sk = new Skeleton(data)
  const st = new AnimationState(sk)
  st.setAnimation(animName, true)
  st.update(1 / 60)
  st.apply()
  return [sk, st]
})

console.log('')
console.log(`  Skeleton object graph alone : ${rows.parse.toFixed(1)} KB`)
console.log(`  animation compile adds      : ${(rows.applied - rows.state).toFixed(1)} KB`)
console.log('')
console.log('Bones/slots in this skeleton: ' + data.bones.length + ' / ' + data.slots.length)
console.log('')
console.log('Reference points:')
console.log('  - 258 timeline objects, 367 sampler calls')
console.log('  - duplicated channel data was the suspect; it is part of row 3')
