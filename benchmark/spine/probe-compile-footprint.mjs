#!/usr/bin/env node
/* eslint-disable */

/**
 * Exact per-skeleton footprint of the compiled animation, measured in Node so
 * the renderer's buffers and reactivity cannot pollute the number.
 *
 * The app parses the skeleton ONCE and builds N skeletons from that data. Before
 * the shared-channel change, `compileAnim` ran per skeleton and rebuilt every
 * channel's times/values/types/curves/tables, so each instance carried a private
 * copy of immutable animation data. This measures how much that cost.
 *
 * Run with: node --expose-gc probe-compile-footprint.mjs
 */

import fs from 'node:fs'
import { parseSpineBinary, Skeleton, AnimationState } from '../../packages/assets/dist/index.js'

if (!global.gc) {
  console.error('Run with: node --expose-gc probe-compile-footprint.mjs')
  process.exit(1)
}

const buf = new Uint8Array(fs.readFileSync('public/c310_00.skel'))
const data = parseSpineBinary(buf, 1)
const animName = Object.keys(data.animations)[0]

function heapMB() {
  global.gc()
  global.gc()
  return process.memoryUsage().heapUsed / 1048576
}

const afterParse = heapMB()
console.log(`after parse              ${afterParse.toFixed(2)} MB`)

// Warm the compile cache for one skeleton so the base case is honest.
const warm = new AnimationState(new Skeleton(data))
warm.setAnimation(animName, true)
warm.update(0)
warm.apply()
const afterWarm = heapMB()
console.log(`after first skeleton     ${afterWarm.toFixed(2)} MB   (base)`)

for (const n of [1, 10, 50, 100, 200, 400]) {
  // Build a fresh set each round so we measure allocation, not reuse.
  const instances = []
  for (let i = 0; i < n; i++) {
    const sk = new Skeleton(data)
    const st = new AnimationState(sk)
    st.setAnimation(animName, true)
    st.update(0)
    st.apply()
    instances.push([sk, st])
  }
  const heap = heapMB()
  const per = ((heap - afterWarm) / n) * 1024
  console.log(`N=${String(n).padStart(3)}                     ${heap.toFixed(2)} MB   ${per.toFixed(1)} KB/instance`)
  // keep referenced until after the measurement
  void instances.length
}

// Sanity: pose them all once so the compiled structures are definitely built.
const all = []
for (let i = 0; i < 200; i++) {
  const sk = new Skeleton(data)
  const st = new AnimationState(sk)
  st.setAnimation(animName, true)
  all.push([sk, st])
}
for (const [, st] of all) {
  st.update(1 / 60)
  st.apply()
}
const after200 = heapMB()
console.log('')
console.log(`200 posed skeletons      ${after200.toFixed(2)} MB   ${(((after200 - afterWarm) / 200) * 1024).toFixed(1)} KB/instance`)
console.log('')
console.log('Channels in this animation: 258 timeline objects / 367 sampler calls.')
console.log('With SHARED channel data, per-instance cost should be bones + slots +')
console.log('lightweight entry objects (tens of KB); with per-skeleton duplication it')
console.log('would carry ~5-6 Float64Arrays per channel plus curve data.')
