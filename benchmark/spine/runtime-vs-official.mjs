#!/usr/bin/env node
/* eslint-disable */

/**
 * LIKE-FOR-LIKE phase comparison: official spine-core vs the Rasen runtime,
 * SAME asset (c310), SAME instance count, SAME tick loop, same process.
 *
 * Why: attributing our own costs tells you where our time goes but NOT where
 * headroom exists — a phase can be 40% of our frame simply because it is
 * inherently expensive and the official pays it too. The only way to find real
 * headroom is to measure the opponent's identical phase.
 *
 * Protocol: min-of-ROUNDS (single samples here drift 20-30%; the minimum is
 * the stable estimator). Both runtimes get an identical warm-up.
 *
 * Usage: node runtime-vs-official.mjs [instances] [ticks] [rounds]
 */

import fs from 'node:fs'
import * as spine from '@esotericsoftware/spine-core'
import {
  parseSpineBinary,
  Skeleton,
  AnimationState,
  getAnimationDuration
} from '../../packages/assets/dist/index.js'

const N = Number(process.argv[2] || 200)
const TICKS = Number(process.argv[3] || 300)
const ROUNDS = Number(process.argv[4] || 5)
const WARMUP = 30
const DELTA = 1 / 60
const SKEL = 'public/c310_00.skel'

const bytes = new Uint8Array(fs.readFileSync(SKEL))

// --- official -----------------------------------------------------------------
// c310 is a Spine 4.1.20 binary; spine-core's binary reader needs an attachment
// loader, which normally comes from a real TextureAtlas. Pose-only work never
// samples pixels, so a stub atlas with the right GEOMETRY (page size + region
// rects) is enough: MeshAttachment.updateRegion() only needs region.u/v/degrees
// and the page's image size to compute UVs.
const REGION_SIZE = 2048

function stubImage() {
  return { width: REGION_SIZE, height: REGION_SIZE, src: '', addEventListener() {}, removeEventListener() {} }
}

function stubLoader() {
  const page = {
    texture: { getImage: () => stubImage() },
    width: REGION_SIZE,
    height: REGION_SIZE,
    name: 'stub',
    // TextureAtlasRegion's constructor pushes itself into page.regions.
    regions: []
  }
  const newRegion = (name) => {
    const r = new spine.TextureAtlasRegion(page, name)
    r.u = 0
    r.v = 0
    r.u2 = 0.5
    r.v2 = 0.5
    r.width = 64
    r.height = 64
    r.originalWidth = 64
    r.originalHeight = 64
    r.offsetX = 0
    r.offsetY = 0
    r.degrees = 0
    r.rotate = false
    return r
  }
  const attach = (att, name, path) => {
    att.region = newRegion(path ?? name)
    if (typeof att.updateRegion === 'function') att.updateRegion()
    return att
  }
  return {
    newRegionAttachment: (skin, name, path) => {
      const att = new spine.RegionAttachment(name)
      att.path = path
      return attach(att, name, path)
    },
    newMeshAttachment: (skin, name, path) => {
      const att = new spine.MeshAttachment(name)
      att.path = path
      return attach(att, name, path)
    },
    newBoundingBoxAttachment: (skin, name) => new spine.BoundingBoxAttachment(name),
    newPathAttachment: (skin, name) => new spine.PathAttachment(name),
    newPointAttachment: (skin, name) => new spine.PointAttachment(name),
    newClippingAttachment: (skin, name) => new spine.ClippingAttachment(name)
  }
}

const officialData = new spine.SkeletonBinary(stubLoader()).readSkeletonData(bytes)
const officialAnimName = officialData.animations[0].name
console.log(`official spine-core ${spine.VERSION ?? ''} parsed c310: bones=${officialData.bones.length} slots=${officialData.slots.length} animations=${officialData.animations.length}`)

// --- rasen --------------------------------------------------------------------
const rasenData = parseSpineBinary(bytes, 1)
const rasenAnimName = Object.keys(rasenData.animations)[0]
console.log(`rasen parsed c310: bones=${rasenData.bones.length} slots=${rasenData.slots.length} animations=${Object.keys(rasenData.animations).length}`)
console.log(`animation: official="${officialAnimName}" rasen="${rasenAnimName}" N=${N} ticks=${TICKS} rounds=${ROUNDS}`)
console.log('')

function makeOfficial() {
  const sk = new spine.Skeleton(officialData)
  const st = new spine.AnimationState(new spine.AnimationStateData(officialData))
  st.setAnimation(0, officialAnimName, true)
  st.update(0)
  st.apply(sk)
  sk.updateWorldTransform()
  return { sk, st }
}

function makeRasen() {
  const sk = new Skeleton(rasenData)
  const st = new AnimationState(sk)
  st.setAnimation(rasenAnimName, true)
  st.update(0)
  st.apply()
  sk.updateWorldTransform()
  return { sk, st }
}

const official = []
const rasen = []
for (let i = 0; i < N; i++) {
  official.push(makeOfficial())
  rasen.push(makeRasen())
}

/** min-of-ROUNDS ms/frame for a tick loop. */
function measure(fn) {
  for (let i = 0; i < WARMUP; i++) fn()
  let best = Infinity
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = performance.now()
    for (let i = 0; i < TICKS; i++) fn()
    const ms = (performance.now() - t0) / TICKS
    if (ms < best) best = ms
  }
  return best
}

const phases = [
  {
    name: 'tick (update+apply)', // official apply excludes uwt; ours includes it
    off: () => {
      for (const it of official) {
        it.st.update(DELTA)
        it.st.apply(it.sk)
      }
    },
    ras: () => {
      for (const it of rasen) {
        it.st.update(DELTA)
        it.st.apply()
      }
    }
  },
  { name: 'setToSetupPose', off: () => { for (const it of official) it.sk.setToSetupPose() }, ras: () => { for (const it of rasen) it.sk.setToSetupPose() } },
  { name: 'updateWorldTransform', off: () => { for (const it of official) it.sk.updateWorldTransform() }, ras: () => { for (const it of rasen) it.sk.updateWorldTransform() } }
]

console.log('phase                        official      rasen     delta')
console.log('                             ms/frame    ms/frame   ms/frame')
console.log('----------------------------------------------------------------')
for (const p of phases) {
  const o = measure(p.off)
  const r = measure(p.ras)
  const d = r - o
  console.log(
    `${p.name.padEnd(26)} ${o.toFixed(2).padStart(7)} ${r.toFixed(2).padStart(11)} ${(d >= 0 ? '+' : '') + d.toFixed(2)}`.padStart(0)
  )
}

// Full chain on both, so the tick comparison above can be normalized: official
// needs an explicit updateWorldTransform to match "ours includes it".
console.log('')
console.log('--- full chain (update + apply + uwt for BOTH) ---')
const fullOff = measure(() => {
  for (const it of official) {
    it.st.update(DELTA)
    it.st.apply(it.sk)
    it.sk.updateWorldTransform()
  }
})
const fullRas = measure(() => {
  for (const it of rasen) {
    it.st.update(DELTA)
    it.st.apply()
  }
})
console.log(`official ${fullOff.toFixed(2)} ms/frame   rasen ${fullRas.toFixed(2)} ms/frame   ratio ${(fullRas / fullOff).toFixed(3)}x   delta +${(fullRas - fullOff).toFixed(2)}ms`)

// ---------------------------------------------------------------------------
// Attribute `apply` to timeline KINDS on BOTH sides, by removing one kind at a
// time and taking the delta. Same technique on both runtimes so the numbers
// are comparable: a kind that is inherently expensive shows up as expensive on
// both sides, which is what distinguishes "intrinsic cost" from "our overhead".
// ---------------------------------------------------------------------------

const OFFICIAL_KINDS = {
  bone: ['RotateTimeline', 'TranslateTimeline', 'ScaleTimeline', 'ShearTimeline'],
  deform: ['DeformTimeline'],
  slot: ['AttachmentTimeline', 'ColorTimeline', 'AlphaTimeline', 'RGBTimeline', 'RGBA2Timeline', 'RGB2Timeline'],
  other: ['IkConstraintTimeline', 'TransformConstraintTimeline', 'PathConstraintTimeline', 'EventTimeline', 'DrawOrderTimeline']
}
const RASEN_KINDS = {
  bone: 'bones',
  deform: 'deform',
  slot: 'slots',
  other: null // ik/transform/path/draworder/events/sequence: measured together
}

const officialAnim = officialData.animations[0]
const officialTimelines = officialAnim.timelines
const kindName = (t) => t.constructor?.name ?? 'unknown'
console.log('')
console.log('--- official timelines by class ---')
const byClass = {}
for (const t of officialTimelines) byClass[kindName(t)] = (byClass[kindName(t)] ?? 0) + 1
for (const [k, v] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(30)} ${v}`)

/** ms/frame for official apply with the listed timeline classes removed. */
function officialApplyWithout(classes) {
  const keep = officialTimelines.filter((t) => !classes.includes(kindName(t)))
  const saved = officialAnim.timelines
  officialAnim.timelines = keep
  const ms = measure(() => {
    for (const it of official) it.st.apply(it.sk)
  })
  officialAnim.timelines = saved
  return ms
}

/** ms/frame for rasen applyAnimation with one data kind stripped. */
function rasenApplyWithout(field) {
  const clone = { ...rasenData.animations[rasenAnimName] }
  if (field === 'other') {
    clone.ik = {}
    clone.transform = {}
    clone.path = {}
    clone.draworder = []
    clone.events = []
    clone.sequence = {}
  } else {
    clone[field] = {}
  }
  const ms = measure(() => {
    for (const it of rasen) {
      // Drive applyAnimation through the public state hook with fixed time.
      it.st.current.anim = clone
      it.st.apply()
    }
  })
  // restore
  for (const it of rasen) it.st.current.anim = rasenData.animations[rasenAnimName]
  return ms
}

console.log('')
console.log('--- apply() cost with each timeline kind REMOVED (delta = that kind) ---')
console.log('kind        official base   delta      rasen base   delta     delta-gap')
console.log('-----------------------------------------------------------------------')

const offBase = measure(() => { for (const it of official) it.st.apply(it.sk) })
const rasBase = measure(() => { for (const it of rasen) it.st.apply() })

const rows = [
  { kind: 'bone', off: OFFICIAL_KINDS.bone, ras: 'bones' },
  { kind: 'deform', off: OFFICIAL_KINDS.deform, ras: 'deform' },
  { kind: 'slot', off: OFFICIAL_KINDS.slot, ras: 'slots' },
  { kind: 'other', off: OFFICIAL_KINDS.other, ras: 'other' }
]

let offSum = 0
let rasSum = 0
for (const row of rows) {
  const offDelta = offBase - officialApplyWithout(row.off)
  const rasDelta = rasBase - rasenApplyWithout(row.ras)
  offSum += offDelta
  rasSum += rasDelta
  const gap = rasDelta - offDelta
  console.log(
    `${row.kind.padEnd(11)} ${offBase.toFixed(2).padStart(9)} ${offDelta.toFixed(2).padStart(8)} ` +
      `${rasBase.toFixed(2).padStart(12)} ${rasDelta.toFixed(2).padStart(8)} ${(gap >= 0 ? '+' : '') + gap.toFixed(2)}`.padStart(0)
  )
}
console.log('-----------------------------------------------------------------------')
console.log(`apply() baseline: official ${offBase.toFixed(2)} ms   rasen ${rasBase.toFixed(2)} ms   ratio ${(rasBase / offBase).toFixed(3)}x   delta +${(rasBase - offBase).toFixed(2)}ms`)
console.log(`  sum of kinds : official ${offSum.toFixed(2)} ms   rasen ${rasSum.toFixed(2)} ms`)
console.log(`  glue/overhead: official ${(offBase - offSum).toFixed(2)} ms   rasen ${(rasBase - rasSum).toFixed(2)} ms`)
