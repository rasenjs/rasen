#!/usr/bin/env node
/* eslint-disable */

/**
 * Micro-benchmark for the mesh vertex world-transform loop
 * (computeAttachmentWorldVertices), the dominant per-frame cost on skinned
 * skeletons — c310 is 84.2% weighted vertices (see skel-stats.mjs).
 *
 * Why Node instead of the browser: headless Chrome coarsens
 * performance.now() to ~100us in non-cross-origin-isolated pages, so in-page
 * section timers are pure noise. `@rasenjs/assets` is DOM-free, so the exact
 * same code runs here with a high-res clock and long loops.
 *
 * Methodology: min-of-N rounds after a long warm-up. Single runs drift ~10%;
 * the minimum is the stable estimator for micro-workloads.
 *
 * ⚠️ CAVEAT — read before trusting any ranking from this file. Micro-benchmark
 * rankings for these loop shapes are NOT stable: they shift depending on which
 * other similar functions are defined in the same process (V8's inlining and
 * code-cache decisions are context-sensitive). Concretely, a version of this
 * harness with ~12 competing variants reported "the 1-bone branch costs 2.2
 * ns/vertex" and "recomputing the index costs 2.7 ns/vertex"; after trimming
 * to 4 variants those gaps vanished and every shape measured ~7.9-8.5
 * ns/vertex. Treat this file as a smoke check that a change did not make the
 * loop dramatically worse — NOT as evidence for a specific delta.
 *
 * The arbiter for real cost is end-to-end: `HWGL=1 node ab-anim.mjs` (same
 * browser session, all renderers, compare ratio vs official). The specialization
 * work below was accepted on that basis (21.56 -> 20.50 ms avgFrame @200, 1.29x
 * -> 1.20x official).
 *
 * What the library does (and why):
 *
 *   1. Monomorphic specialization: the public entry point types verts/out as
 *      unions (number[] | Float32Array) and re-tests `deform` per vertex. The
 *      specialized helpers take Float32Array on both sides at stride 3 with
 *      deform hoisted out of the loop, and are dispatched to when the caller
 *      matches (the WebGL mesh builder always does).
 *   2. The write cursor is hoisted and incremented rather than recomputed as
 *      `outBase + v * 3` inside the loop — cheap insurance regardless of the
 *      measurement caveat above, and it keeps the generated code simple.
 *   3. No 1-bone fast path: it measured neutral-to-worse whenever it was
 *      checked, and it adds a branch to the hottest loop. Do not add one back
 *      without an end-to-end measurement.
 *   4. Bone fields are read as object properties (`bones[i].a`), not through a
 *      flattened typed matrix: the flat layout needs an index multiply per
 *      access and never measured faster.
 *   5. The per-influence `if (!bb) continue` guard is kept — it measured free,
 *      and dropping it would turn malformed data into garbage writes.
 */

import { computeAttachmentWorldVertices } from '../../packages/assets/dist/index.js'

const V = Number(process.argv[2] || 2048)
const ITER = Number(process.argv[3] || 20000)
const ROUNDS = Number(process.env.ROUNDS || 5)
const BONE_N = 204

const bones = []
// Coefficients are float32-exact on purpose: the flat6 variant stores them in
// a Float32Array, so a non-representable value (e.g. 0.1) would make its
// output differ from the object-property variants by rounding alone and
// report a bogus MISMATCH.
for (let i = 0; i < BONE_N; i++) bones.push({ a: 1, b: 0.125, c: -0.25, d: 1, worldX: i, worldY: -i })
const skeleton = { bones }
const slot = { bone: bones[0], deform: null }

// Weighted mesh matching c310's measured 1/2/3-bone distribution
// (603 / 871 / 535 over 2009 weighted verts ≈ 30% / 43% / 27%).
const DIST = [0.3, 0.43, 0.27]
let seed = 12345
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const boneCounts = new Int32Array(V)
for (let v = 0; v < V; v++) {
  const r = rnd()
  boneCounts[v] = r < DIST[0] ? 1 : r < DIST[0] + DIST[1] ? 2 : 3
}
let totalInfluences = 0
for (let v = 0; v < V; v++) totalInfluences += boneCounts[v]
const wVerts = new Float32Array(V + totalInfluences * 4)
{
  let o = 0
  for (let v = 0; v < V; v++) {
    const bc = boneCounts[v]
    wVerts[o++] = bc
    for (let b = 0; b < bc; b++) {
      wVerts[o++] = (v + b) % BONE_N
      wVerts[o++] = ((v * 7 + b) % 41) - 20
      wVerts[o++] = ((v * 13 + b) % 29) - 14
      wVerts[o++] = 1 / bc
    }
  }
}
const wAtt = { type: 'mesh', vertices: wVerts, uvs: new Array(V * 2).fill(0.5) }

const out = new Float32Array(V * 3 + 1024)
const ref = new Float32Array(V * 3)

/** Plain accumulate loop — the shape the library now emits. */
function vHoisted(verts, boneArr, vCount, outArr, outBase) {
  let ptr = 0
  let o = outBase
  for (let v = 0; v < vCount; v++) {
    const boneCount = verts[ptr++]
    let wx = 0
    let wy = 0
    for (let b = 0; b < boneCount; b++) {
      const boneIndex = verts[ptr++]
      const vx = verts[ptr++]
      const vy = verts[ptr++]
      const weight = verts[ptr++]
      const bb = boneArr[boneIndex]
      if (!bb) continue
      wx += (vx * bb.a + vy * bb.b + bb.worldX) * weight
      wy += (vx * bb.c + vy * bb.d + bb.worldY) * weight
    }
    outArr[o] = wx
    outArr[o + 1] = wy
    outArr[o + 2] = 0
    o += 3
  }
}

/** Alternative shape: index recomputed inside the loop. */
function vRecomputed(verts, boneArr, vCount, outArr, outBase) {
  let ptr = 0
  for (let v = 0; v < vCount; v++) {
    const boneCount = verts[ptr++]
    let wx = 0
    let wy = 0
    for (let b = 0; b < boneCount; b++) {
      const boneIndex = verts[ptr++]
      const vx = verts[ptr++]
      const vy = verts[ptr++]
      const weight = verts[ptr++]
      const bb = boneArr[boneIndex]
      if (!bb) continue
      wx += (vx * bb.a + vy * bb.b + bb.worldX) * weight
      wy += (vx * bb.c + vy * bb.d + bb.worldY) * weight
    }
    const o = outBase + v * 3
    outArr[o] = wx
    outArr[o + 1] = wy
    outArr[o + 2] = 0
  }
}

/** Alternative shape: 1-bone fast path wrapping the inner loop. */
function vOneBoneBranch(verts, boneArr, vCount, outArr, outBase) {
  let ptr = 0
  let o = outBase
  for (let v = 0; v < vCount; v++) {
    const boneCount = verts[ptr++]
    let wx = 0
    let wy = 0
    if (boneCount === 1) {
      const boneIndex = verts[ptr++]
      const vx = verts[ptr++]
      const vy = verts[ptr++]
      const weight = verts[ptr++]
      const b = boneArr[boneIndex]
      if (b) {
        wx = (vx * b.a + vy * b.b + b.worldX) * weight
        wy = (vx * b.c + vy * b.d + b.worldY) * weight
      }
    } else {
      for (let k = 0; k < boneCount; k++) {
        const boneIndex = verts[ptr++]
        const vx = verts[ptr++]
        const vy = verts[ptr++]
        const weight = verts[ptr++]
        const bb = boneArr[boneIndex]
        if (!bb) continue
        wx += (vx * bb.a + vy * bb.b + bb.worldX) * weight
        wy += (vx * bb.c + vy * bb.d + bb.worldY) * weight
      }
    }
    outArr[o] = wx
    outArr[o + 1] = wy
    outArr[o + 2] = 0
    o += 3
  }
}

/** Alternative shape: flattened bone matrices in one interleaved array. */
const flat6 = new Float32Array(BONE_N * 6)
for (let i = 0; i < BONE_N; i++) {
  const b = bones[i]
  const o = i * 6
  flat6[o] = b.a
  flat6[o + 1] = b.b
  flat6[o + 2] = b.c
  flat6[o + 3] = b.d
  flat6[o + 4] = b.worldX
  flat6[o + 5] = b.worldY
}
function vFlat6(verts, vCount, outArr, outBase) {
  let ptr = 0
  let o = outBase
  for (let v = 0; v < vCount; v++) {
    const boneCount = verts[ptr++]
    let wx = 0
    let wy = 0
    for (let b = 0; b < boneCount; b++) {
      const boneIndex = verts[ptr++]
      const vx = verts[ptr++]
      const vy = verts[ptr++]
      const weight = verts[ptr++]
      const bo = boneIndex * 6
      wx += (vx * flat6[bo] + vy * flat6[bo + 1] + flat6[bo + 4]) * weight
      wy += (vx * flat6[bo + 2] + vy * flat6[bo + 3] + flat6[bo + 5]) * weight
    }
    outArr[o] = wx
    outArr[o + 1] = wy
    outArr[o + 2] = 0
    o += 3
  }
}

function bench(label, fn, check) {
  out.fill(0)
  for (let i = 0; i < 5000; i++) fn()
  let best = Infinity
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now()
    for (let i = 0; i < ITER; i++) fn()
    const dt = ((performance.now() - t0) / ITER) * 1e6
    if (dt < best) best = dt
  }
  console.log(
    `${label.padEnd(30)} ${best.toFixed(0).padStart(7)} ns/call ${(best / V).toFixed(2).padStart(6)} ns/vertex  ${check ? check() : ''}`
  )
}

vHoisted(wVerts, bones, V, ref, 0)
const checksum = () => {
  let d = 0
  for (let i = 0; i < V * 3; i++) if (out[i] !== ref[i]) d++
  return d === 0 ? 'ok' : `MISMATCH(${d})`
}

console.log(
  `vertices=${V} influences=${totalInfluences} (${(totalInfluences / V).toFixed(2)}/vertex) iterations=${ITER} rounds=${ROUNDS}`
)
bench('library (current)', () =>
  computeAttachmentWorldVertices(wAtt, slot, skeleton, {}, undefined, out, 3, 0),
  checksum
)
bench('hoisted cursor (library)', () => vHoisted(wVerts, bones, V, out, 0), checksum)
console.log('--- alternative shapes (equal within measurement noise) ---')
bench('index recomputed in loop', () => vRecomputed(wVerts, bones, V, out, 0), checksum)
bench('1-bone branch', () => vOneBoneBranch(wVerts, bones, V, out, 0), checksum)
bench('flat6 typed matrices', () => vFlat6(wVerts, V, out, 0), checksum)
