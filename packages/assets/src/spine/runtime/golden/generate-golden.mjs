#!/usr/bin/env node
/**
 * Golden-file generator for the spine runtime gate test.
 *
 * Run AFTER `yarn build` in packages/assets (uses the built dist) and after
 * verify-render + unit tests confirm the build is correct. Commit the result.
 *
 *   node generate-golden.mjs
 *
 * The golden file captures the RENDERER-VISIBLE data face for deterministic
 * (asset, animation, time) tuples. See README.md for the contract.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(here, '../../../../dist/index.js')
const R = await import(distPath)
const fx = (name) => path.resolve(here, '../__fixtures__', name)

const r5 = (v) => Math.round(v * 1e5) / 1e5 + 0
const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0

/** Extract the renderer-visible face of a posed skeleton. */
function extractPose(sk, atlas) {
  const bones = {}
  for (const b of sk.bones) {
    bones[b.data.name] = [
      r5(b.a), r5(b.b), r5(b.c), r5(b.d), r5(b.worldX), r5(b.worldY)
    ]
  }
  const drawOrder = sk.drawOrder.map((s) => s.data.name)
  const slots = {}
  const attachments = {}
  for (const slot of sk.drawOrder) {
    const attName = slot.attachment
    slots[slot.data.name] = {
      attachment: attName,
      color: slot.color,
      deform: slot.deform ? slot.deform.map(r5) : null
    }
    if (!attName) continue
    const att = sk.findAttachment(slot.data.name, attName)
    if (!att) continue
    const geo = R.computeAttachmentWorld(att, slot, sk, atlas, attName)
    if (!geo || !geo.world) continue
    attachments[slot.data.name] = {
      attachment: attName,
      world: geo.world.map(r4),
      uvs: geo.uvs.map(r5),
      triangles: geo.triangles
    }
  }
  return { bones, drawOrder, slots, attachments, counts: {
    bones: sk.bones.length,
    drawOrder: drawOrder.length,
    attachments: Object.keys(attachments).length
  } }
}

/** Pose a fresh skeleton at the given absolute time (no warm-up contamination). */
function poseAt(R, skelData, atlas, animName, time) {
  const sk = new R.Skeleton(skelData)
  const st = new R.AnimationState(sk)
  st.setAnimation(animName, true)
  st.update(time)
  st.apply()
  sk.updateWorldTransform()
  return extractPose(sk, atlas)
}

const EXAMPLES = path.resolve(here, '../../../../../../examples/canvas-2d')

const CASES = [
  {
    id: 'c310/action',
    skel: fx('c310.skel'),
    atlas: fx('c310.atlas'),
    binary: true,
    animation: 'action',
    times: [0, 0.3777, 0.9123, 1.5]
  },
  {
    id: 'c310/idle',
    skel: fx('c310.skel'),
    atlas: fx('c310.atlas'),
    binary: true,
    animation: 'idle',
    times: [0, 0.3777, 0.9123, 1.5]
  },
  {
    // JSON-format parser path (Spine 4.2 example asset, no deform on these)
    id: 'spineboy/idle',
    skel: path.join(EXAMPLES, 'src/spineboy-pro.json'),
    atlas: path.join(EXAMPLES, 'images/spineboy.atlas'),
    jsonParsed: true,
    animation: 'idle',
    times: [0, 0.3777, 0.9123]
  }
]

const out = { meta: { generator: 'generate-golden.mjs', note: 'renderer-visible face only; see README.md' }, cases: {} }

for (const c of CASES) {
  const skelData = c.binary
    ? R.parseSpineBinary(new Uint8Array(fs.readFileSync(c.skel)))
    : R.parseSpineJson(JSON.parse(fs.readFileSync(c.skel, 'utf8')))
  const atlas = c.atlas ? R.parseSpineAtlas(fs.readFileSync(c.atlas, 'utf8')) : null
  const st = new R.AnimationState(new R.Skeleton(skelData))
  if (!st.animationNames.includes(c.animation)) {
    console.error(`SKIP ${c.id}: animation "${c.animation}" not found (have: ${st.animationNames.join(', ')})`)
    continue
  }
  out.cases[c.id] = { animation: c.animation, times: {} }
  for (const t of c.times) {
    out.cases[c.id].times[String(t)] = poseAt(R, skelData, atlas, c.animation, t)
  }
  const first = Object.values(out.cases[c.id].times)[0]
  console.log(`${c.id}: ${first.counts.bones} bones, ${first.counts.drawOrder} slots, ${first.counts.attachments} drawable attachments`)
}

const outPath = path.join(here, 'spine-gate.json')
fs.writeFileSync(outPath, JSON.stringify(out))
const kb = (fs.statSync(outPath).size / 1024).toFixed(0)
console.log(`wrote ${path.relative(process.cwd(), outPath)} (${kb} KB)`)
