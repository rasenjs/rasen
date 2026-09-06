import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { parseSpineBinary, parseSpineAtlas, Skeleton, applyAnimation, computeAttachmentWorldVertices } from './dist/index.js'

const require = createRequire(import.meta.url)
const fs = require('fs')
const vm = require('vm')

const code = fs.readFileSync('/tmp/spine-compare/spine-webgl.js', 'utf8')
const sandbox = { window: {}, console, Float32Array, Uint8Array, ArrayBuffer, DataView, Math, Date, performance, TextDecoder }
sandbox.window = sandbox
vm.createContext(sandbox)
vm.runInContext(code, sandbox)
const sp = sandbox.spine

const atlasText = readFileSync('/tmp/c091_01_00.atlas', 'utf8')
const oa = new sp.TextureAtlas(atlasText)
oa.pages.forEach(p => { p.texture = {} })
const loader = new sp.AtlasAttachmentLoader(oa)
const data = new sp.SkeletonBinary(loader).readSkeletonData(new Uint8Array(readFileSync('/tmp/c091_01_00.skel')))
const ourData = parseSpineBinary(new Uint8Array(readFileSync('/tmp/c091_01_00.skel')))
const ourAtlas = parseSpineAtlas(atlasText)

const t = 1.3
const osk = new sp.Skeleton(data)
const st = new sp.AnimationState(new sp.AnimationStateData(data))
st.setAnimation(0, 'action', true)
st.update(t)
st.apply(osk)
osk.updateWorldTransform()

const sk = new Skeleton(ourData)
applyAnimation(sk, ourData.animations['action'], t, true)

for (const name of ['face', 'Hair_f_5', 'Hair_f_4', 'Hair_e_11', 'Hair_e_012', 'body']) {
  const o = osk.slots.find(s => s.data.name === name)
  const m = sk.slotMap.get(name)
  if (!o || !m || !o.getAttachment() || !m.attachment) { console.log(name.padEnd(16), 'skip: no attachment'); continue }
  const oAtt = o.getAttachment()
  const mAtt = m.attachment ? sk.findAttachment(m.data.name, m.attachment) : null
  if (!oAtt || !mAtt) { console.log(name.padEnd(16), 'skip: oAtt=' + !!oAtt + ' mAtt=' + !!mAtt); continue }
  if (!mAtt.uvs || !mAtt.uvs.length) { console.log(name.padEnd(16), 'skip: no UVs'); continue }
  const ob = new Float32Array(oAtt.worldVerticesLength * 2)
  oAtt.computeWorldVertices(o, 0, oAtt.worldVerticesLength, ob, 0, 2)
  const mb = new Float32Array(mAtt.uvs.length)
  computeAttachmentWorldVertices(mAtt, m, sk, ourAtlas, name, mb)
  const c = Math.min(ob.length, mb.length)
  let d = 0
  for (let i = 0; i < c; i++) d = Math.max(d, Math.abs(ob[i] - mb[i]))
  console.log(name.padEnd(16), 'maxDiff=' + d.toFixed(1), 'oLen=' + oAtt.worldVerticesLength, 'mLen=' + mAtt.uvs.length)
}
