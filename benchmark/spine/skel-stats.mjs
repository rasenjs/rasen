#!/usr/bin/env node
/* eslint-disable */

/**
 * Structural stats for a Spine skeleton: how many drawable attachments, their
 * unique-vertex totals, and the weighted/unweighted split. Drives which
 * vertex-transform loop in computeAttachmentWorldVertices deserves work.
 *
 * Usage: node skel-stats.mjs [path-to-skel] [path-to-atlas]
 */

import fs from 'node:fs'
import { parseSpineBinary, parseSpineAtlas } from '../../packages/assets/dist/index.js'

const skelPath = process.argv[2] || 'public/c310_00.skel'
const atlasPath = process.argv[3] || 'public/c310_00.atlas'

const bytes = new Uint8Array(fs.readFileSync(skelPath))
const data = parseSpineBinary(bytes, 1)
const atlas = parseSpineAtlas(fs.readFileSync(atlasPath, 'utf8'))

let attTotal = 0
let attWeighted = 0
let attUnweighted = 0
let attRegion = 0
let vertsTotal = 0
let vertsWeighted = 0
let vertsUnweighted = 0
let bonesPerVertex1 = 0
let bonesPerVertex2 = 0
let bonesPerVertex3 = 0
let hasDeform = 0

for (const skin of data.skins) {
  for (const slotName of Object.keys(skin.attachments)) {
    const atts = skin.attachments[slotName]
    for (const name of Object.keys(atts)) {
      const att = atts[name]
      if (!att || !att.type) continue
      attTotal++
      if (att.type === 'region') {
        attRegion++
        vertsTotal += 4
        vertsUnweighted += 4
        continue
      }
      if (att.type !== 'mesh' && att.type !== 'linkedmesh') continue
      const verts = att.vertices
      const uvs = att.uvs
      if (!verts || !uvs) continue
      const vCount = uvs.length / 2
      const weighted = verts.length !== vCount * 2
      vertsTotal += vCount
      if (weighted) {
        attWeighted++
        vertsWeighted += vCount
        // Walk the interleave to count bones-per-vertex.
        let p = 0
        for (let v = 0; v < vCount; v++) {
          const bc = verts[p++]
          if (bc === 1) bonesPerVertex1++
          else if (bc === 2) bonesPerVertex2++
          else bonesPerVertex3++
          p += bc * 4
        }
      } else {
        attUnweighted++
        vertsUnweighted += vCount
      }
    }
  }
}

console.log(`file: ${skelPath}`)
console.log(`atlas regions: ${Object.keys(atlas.regions).length}`)
console.log(`bones: ${data.bones.length}`)
console.log('')
console.log(`attachments       : ${attTotal} (region ${attRegion})`)
console.log(`  weighted mesh   : ${attWeighted}`)
console.log(`  unweighted mesh : ${attUnweighted}`)
console.log('')
console.log(`unique verts/frame: ${vertsTotal}`)
console.log(`  weighted        : ${vertsWeighted} (${((vertsWeighted / vertsTotal) * 100).toFixed(1)}%)`)
console.log(`  unweighted      : ${vertsUnweighted} (${((vertsUnweighted / vertsTotal) * 100).toFixed(1)}%)`)
console.log('')
console.log(`weighted bones/vertex: 1-bone ${bonesPerVertex1}, 2-bone ${bonesPerVertex2}, 3+ ${bonesPerVertex3}`)
