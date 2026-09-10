#!/usr/bin/env node
/* eslint-disable */

/**
 * Why does a Bone cost 775 B when its 28 fields + children array should be ~300?
 *
 * Hypothesis: V8 stops keeping every property in-object once the literal gets
 * long, and puts the overflow in a separate "properties" backing store. That
 * costs both memory AND an extra indirection on every field access — and Bone
 * is read/written field-by-field 204 times per instance per frame by
 * updateWorldTransform, so it would be a genuine double hit.
 *
 * This probe sweeps the field count to find the cliff, then measures a literal
 * shaped exactly like `makeBone` (same names, same order, same value types).
 *
 * Run with: node --expose-gc probe-object-shape.mjs
 */

if (!global.gc) {
  console.error('Run with: node --expose-gc probe-object-shape.mjs')
  process.exit(1)
}

const N = 200000

function heap() {
  global.gc()
  global.gc()
  return process.memoryUsage().heapUsed
}

function bytesEach(label, make) {
  const base = heap()
  const keep = new Array(N)
  for (let i = 0; i < N; i++) keep[i] = make(i)
  const after = heap()
  const per = (after - base) / N
  void keep.length
  console.log(`  ${label.padEnd(46)} ${per.toFixed(1).padStart(7)} B`)
  return per
}

// A stable key set so every sample has the same shape (no megamorphic slack).
const ref = { tag: 0 }

console.log('=== field-count sweep (all-numeric literals) ===')
const names = ['f0','f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12','f13','f14',
  'f15','f16','f17','f18','f19','f20','f21','f22','f23','f24','f25','f26','f27','f28','f29','f30','f31']
const sweep = {}
for (const count of [4, 8, 12, 16, 18, 20, 22, 24, 26, 28, 30, 32]) {
  const src = names.slice(0, count).map((n) => `${n}: 1`).join(', ')
  // eslint-disable-next-line no-new-func
  const factory = new Function(`return function () { return { ${src} } }`)()
  sweep[count] = bytesEach(`${count} numeric fields`, factory)
}
console.log('')
console.log('  increments between consecutive sizes:')
const sizes = Object.keys(sweep).map(Number)
for (let i = 1; i < sizes.length; i++) {
  const d = sweep[sizes[i]] - sweep[sizes[i - 1]]
  const dn = sizes[i] - sizes[i - 1]
  console.log(`    ${sizes[i - 1]} -> ${sizes[i]} fields (+${dn}): ${d.toFixed(1)} B  (${(d / dn).toFixed(1)} B/field)`)
}

console.log('')
console.log('=== a literal shaped exactly like makeBone ===')
const boneLike = bytesEach('makeBone shape (28 fields, mixed) + children[]', () => ({
  data: ref,
  parent: null,
  children: [],
  skeleton: ref,
  x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0,
  transform: 'normal',
  length: 0,
  depth: 0,
  ax: 0, ay: 0, arotation: 0, ascaleX: 0, ascaleY: 0, ashearX: 0, ashearY: 0,
  sorted: false,
  active: true,
  worldX: 0, worldY: 0,
  a: 1, b: 0, c: 0, d: 1,
}))
const boneLikeNoChildren = bytesEach('same shape but children: null', () => ({
  data: ref,
  parent: null,
  children: null,
  skeleton: ref,
  x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0,
  transform: 'normal',
  length: 0,
  depth: 0,
  ax: 0, ay: 0, arotation: 0, ascaleX: 0, ascaleY: 0, ashearX: 0, ashearY: 0,
  sorted: false,
  active: true,
  worldX: 0, worldY: 0,
  a: 1, b: 0, c: 0, d: 1,
}))

console.log('')
console.log('=== a slot-shaped literal ===')
const slotLike = bytesEach('Slot shape (11 fields) + Float32Array(4)', () => ({
  data: ref,
  bone: ref,
  color: 'FFFFFFFF',
  colorN: new Float32Array(4),
  setupColorN: ref,
  setupColor: 'FFFFFFFF',
  attachment: undefined,
  deform: null,
  sequenceIndex: -1,
}))
const slotLikeNoF32 = bytesEach('Slot shape without colorN', () => ({
  data: ref,
  bone: ref,
  color: 'FFFFFFFF',
  setupColorN: ref,
  setupColor: 'FFFFFFFF',
  attachment: undefined,
  deform: null,
  sequenceIndex: -1,
}))

console.log('')
console.log('=== verdict ===')
console.log(`  measured real Bone cost           775.0 B`)
console.log(`  makeBone-shaped literal          ${boneLike.toFixed(1)} B`)
console.log(`  gap to explain                   ${(775 - boneLike).toFixed(1)} B/bone  (= ${(((775 - boneLike) * 204) / 1024).toFixed(1)} KB/instance)`)
console.log('')
console.log(`  measured real Slot cost           ~420 B  (74.2 KB / 181)`)
console.log(`  slot-shaped literal              ${slotLike.toFixed(1)} B`)
console.log('')
console.log('  children replaced by null saves  ' + (boneLike - boneLikeNoChildren).toFixed(1) + ' B/bone')
console.log('  colorN removed saves             ' + (slotLike - slotLikeNoF32).toFixed(1) + ' B/slot')
