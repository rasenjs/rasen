#!/usr/bin/env node
/* eslint-disable */

/**
 * Feasibility probe: does a skeleton's animation cover EVERY bone with a bone
 * timeline whose first keyframe sits at t <= 0? If so, setToSetupPose's bone
 * reset is provably redundant for that animation (the timelines overwrite
 * every bone before anything is read), and the runtime can skip it.
 *
 * Also reports the slot-side coverage (attachment / color / deform / sequence
 * timelines) for the same reason.
 *
 * Usage: node anim-coverage.mjs [path-to-skel]
 */

import fs from 'node:fs'
import { parseSpineBinary } from '../../packages/assets/dist/index.js'

const skelPath = process.argv[2] || 'public/c310_00.skel'
const data = parseSpineBinary(new Uint8Array(fs.readFileSync(skelPath)), 1)

const boneNames = new Set(data.bones.map((b) => b.name))
const slotNames = new Set(data.slots.map((s) => s.name))

const anims = Object.keys(data.animations ?? {})
console.log(`skeleton: ${skelPath}`)
console.log(`bones=${boneNames.size} slots=${slotNames.size} animations=${anims.length}`)
console.log('')

let fullBoneCoverage = 0
let fullSlotCoverage = 0

for (const name of anims) {
  const anim = data.animations[name]
  const boneTracks = Object.keys(anim.bones ?? {})
  const covered = new Set(boneTracks)
  const missing = [...boneNames].filter((b) => !covered.has(b))

  // First keyframe time of every bone track (a timeline that starts late
  // leaves the bone at whatever the previous frame left unless reset).
  let lateFirst = 0
  for (const track of boneTracks) {
    const tls = anim.bones[track]
    for (const kind of Object.keys(tls ?? {})) {
      const list = tls[kind]
      if (!Array.isArray(list) || list.length === 0) continue
      const t0 = list[0].time
      if (typeof t0 === 'number' && t0 > 1e-6) lateFirst++
    }
  }

  const hasIk = Object.keys(anim.ik ?? {}).length > 0
  const hasTransform = Object.keys(anim.transform ?? {}).length > 0
  const hasPath = Object.keys(anim.path ?? {}).length > 0

  // Slot-side: which slots have attachment / color / deform / sequence tracks.
  const slotAttTracks = Object.keys(anim.slots ?? {})
  const deformTracks = Object.keys(anim.deform ?? {})
  const seqTracks = Object.keys(anim.sequence ?? {})

  const bonesOk = missing.length === 0 && lateFirst === 0 && !hasIk && !hasTransform && !hasPath
  const slotsOk = slotAttTracks.length === 0 && deformTracks.length === 0 && seqTracks.length === 0

  if (bonesOk) fullBoneCoverage++
  if (slotsOk) fullSlotCoverage++

  console.log(
    `${name.padEnd(26)} bones: ${String(boneTracks.length).padStart(3)}/${boneNames.size} covered, ` +
      `missing=${String(missing.length).padStart(3)}, lateFirstKf=${String(lateFirst).padStart(3)}, ` +
      `ik=${hasIk ? 'Y' : 'n'} tr=${hasTransform ? 'Y' : 'n'} path=${hasPath ? 'Y' : 'n'} ` +
      `| slots: att=${slotAttTracks.length} deform=${deformTracks.length} seq=${seqTracks.length} ` +
      `=> ${bonesOk ? 'SKIP-BONE-RESET' : 'must reset'}`
  )
}

console.log('')
console.log(`animations where the bone reset is provably redundant: ${fullBoneCoverage}/${anims.length}`)
console.log(`animations where the slot reset is provably redundant: ${fullSlotCoverage}/${anims.length}`)
