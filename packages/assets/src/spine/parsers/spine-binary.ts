/**
 * Spine binary (.skel) parser.
 *
 * Lowers the official Spine binary export into the normalized SkeletonData IR.
 * The binary layout mirrors Esoteric's `SkeletonBinary` (Spine 4.x). One
 * Nikke-specific quirk: the header stores the skeleton hash as TWO int32
 * values (low, high) instead of a length-prefixed string.
 */

import type {
  SkeletonData,
  BoneData,
  SlotData,
  IkConstraintData,
  TransformConstraintData,
  PathConstraintData,
  SkinData,
  AttachmentData,
  EventData,
  SequenceData
} from '../types'

import {
  BinaryInput,
  TRANSFORM_MODES,
  BLEND_MODES,
  POSITION_MODES,
  SPACING_MODES,
  ROTATE_MODES,
  ATTACHMENT_REGION,
  ATTACHMENT_BOUNDINGBOX,
  ATTACHMENT_MESH,
  ATTACHMENT_LINKEDMESH,
  ATTACHMENT_PATH,
  ATTACHMENT_POINT,
  ATTACHMENT_CLIPPING,
  readFloatArray,
  readShortArray,
  rgbaToHex,
  isAtLeast41
} from './binary-common'
import { readAnimation } from './spine-binary-animation'
export function parseSpineBinary(bytes: Uint8Array, scale = 1): SkeletonData {
  const input = new BinaryInput(bytes)
  const lowHash = input.readInt32()
  const highHash = input.readInt32()
  const hash = highHash === 0 && lowHash === 0 ? undefined : (lowHash >>> 0).toString(16).padStart(8, '0') + (highHash >>> 0).toString(16).padStart(8, '0')
  const version = input.readString() ?? 'unknown'
  const skeletonData: SkeletonData = {
    format: 'spine',
    version,
    hash,
    bones: [],
    slots: [],
    skins: [],
    animations: {}
  }
  const supportsSequence = isAtLeast41(version)
  skeletonData.x = input.readFloat()
  skeletonData.y = input.readFloat()
  skeletonData.width = input.readFloat()
  skeletonData.height = input.readFloat()
  const nonessential = input.readBoolean()
  if (nonessential) {
    skeletonData.fps = input.readFloat()
    skeletonData.images = input.readString() ?? undefined
    input.readString()
  }
  const strings: string[] = []
  const n = input.readInt(true)
  for (let i = 0; i < n; i++) {
    const str = input.readString()
    if (!str) throw new Error('String table entry must not be null')
    strings.push(str)
  }
  input.setStrings(strings)

  const boneCount = input.readInt(true)
  for (let i = 0; i < boneCount; i++) {
    const name = input.readString()
    if (!name) throw new Error('Bone name must not be null')
    const parent = i === 0 ? undefined : skeletonData.bones[input.readInt(true)]?.name
    const data: BoneData = {
      name,
      parent,
      rotation: input.readFloat(),
      x: input.readFloat() * scale,
      y: input.readFloat() * scale,
      scaleX: input.readFloat(),
      scaleY: input.readFloat(),
      shearX: input.readFloat(),
      shearY: input.readFloat(),
      length: input.readFloat() * scale,
      transform: TRANSFORM_MODES[input.readInt(true)] ?? 'normal',
      skin: input.readBoolean()
    }
    if (nonessential) input.readInt32()
    skeletonData.bones.push(data)
  }

  const slotCount = input.readInt(true)
  for (let i = 0; i < slotCount; i++) {
    const slotName = input.readString()
    if (!slotName) throw new Error('Slot name must not be null')
    const boneName = skeletonData.bones[input.readInt(true)]?.name
    const dark = input.readInt32()
    const data: SlotData = {
      name: slotName,
      bone: boneName ?? '',
      color: rgbaToHex(input.readInt32()),
      dark: dark !== -1 ? rgbaToHex(dark) : undefined,
      attachment: input.readStringRef() ?? undefined,
      blend: BLEND_MODES[input.readInt(true)] ?? 'normal'
    }
    skeletonData.slots.push(data)
  }

  const ikCount = input.readInt(true)
  skeletonData.ik = []
  for (let i = 0; i < ikCount; i++) {
    const name = input.readString()
    if (!name) throw new Error('IK constraint name must not be null')
    const data: IkConstraintData = {
      name,
      order: input.readInt(true),
      bones: [],
      target: ''
    }
    input.readBoolean()
    const bc = input.readInt(true)
    for (let b = 0; b < bc; b++) data.bones.push(skeletonData.bones[input.readInt(true)]?.name ?? '')
    data.target = skeletonData.bones[input.readInt(true)]?.name ?? ''
    data.mix = input.readFloat()
    data.softness = input.readFloat() * scale
    data.bendDirection = input.readByte()
    data.bendPositive = data.bendDirection >= 0
    data.compress = input.readBoolean()
    data.stretch = input.readBoolean()
    data.uniform = input.readBoolean()
    skeletonData.ik.push(data)
  }

  const tcCount = input.readInt(true)
  skeletonData.transform = []
  for (let i = 0; i < tcCount; i++) {
    const name = input.readString()
    if (!name) throw new Error('Transform constraint name must not be null')
    const data: TransformConstraintData = {
      name,
      order: input.readInt(true),
      bones: [],
      target: ''
    }
    input.readBoolean()
    const bc = input.readInt(true)
    for (let b = 0; b < bc; b++) data.bones.push(skeletonData.bones[input.readInt(true)]?.name ?? '')
    data.target = skeletonData.bones[input.readInt(true)]?.name ?? ''
    data.local = input.readBoolean()
    data.relative = input.readBoolean()
    data.offsetRotation = input.readFloat()
    data.offsetX = input.readFloat() * scale
    data.offsetY = input.readFloat() * scale
    data.offsetScaleX = input.readFloat()
    data.offsetScaleY = input.readFloat()
    data.offsetShearY = input.readFloat()
    data.mixRotate = input.readFloat()
    data.mixX = input.readFloat()
    data.mixY = input.readFloat()
    data.mixScaleX = input.readFloat()
    data.mixScaleY = input.readFloat()
    data.mixShearY = input.readFloat()
    skeletonData.transform.push(data)
  }

  const pcCount = input.readInt(true)
  skeletonData.path = []
  for (let i = 0; i < pcCount; i++) {
    const name = input.readString()
    if (!name) throw new Error('Path constraint name must not be null')
    const data: PathConstraintData = {
      name,
      order: input.readInt(true),
      bones: [],
      target: ''
    }
    input.readBoolean()
    const bc = input.readInt(true)
    for (let b = 0; b < bc; b++) data.bones.push(skeletonData.bones[input.readInt(true)]?.name ?? '')
    data.target = skeletonData.slots[input.readInt(true)]?.name ?? ''
    data.positionMode = POSITION_MODES[input.readInt(true)] ?? 'fixed'
    data.spacingMode = SPACING_MODES[input.readInt(true)] ?? 'length'
    data.rotateMode = ROTATE_MODES[input.readInt(true)] ?? 'tangent'
    data.rotation = input.readFloat()
    data.position = input.readFloat() * (data.positionMode === 'fixed' ? scale : 1)
    data.spacing = input.readFloat() * (data.spacingMode === 'length' || data.spacingMode === 'fixed' ? scale : 1)
    data.mixRotate = input.readFloat()
    data.mixX = input.readFloat()
    data.mixY = input.readFloat()
    skeletonData.path.push(data)
  }

  // Skins (default + named). Linked meshes are resolved afterwards.
  const linkedMeshes: LinkedMesh[] = []
  const defaultSkin = readSkin(input, skeletonData, true, nonessential, scale, linkedMeshes, supportsSequence)
  if (defaultSkin) skeletonData.skins.push(defaultSkin)
  const namedCount = input.readInt(true)
  for (let i = 0; i < namedCount; i++) {
    const skin = readSkin(input, skeletonData, false, nonessential, scale, linkedMeshes, supportsSequence)
    if (!skin) throw new Error('readSkin() should not have returned null')
    skeletonData.skins.push(skin)
  }

  // Events (named setup-pose definitions consumed by animation timelines).
  const eventCount = input.readInt(true)
  skeletonData.events = {}
  for (let i = 0; i < eventCount; i++) {
    const eventName = input.readStringRef()
    if (!eventName) throw new Error('Event name must not be null')
    const data: EventData = {
      name: eventName,
      int: input.readInt(false),
      float: input.readFloat(),
      string: input.readString() ?? undefined,
      audio: input.readString() ?? undefined
    }
    if (data.audio) {
      data.volume = input.readFloat()
      data.balance = input.readFloat()
    }
    skeletonData.events[eventName] = data
  }

  // Animations
  const animCount = input.readInt(true)
  for (let i = 0; i < animCount; i++) {
    const animationName = input.readString()
    if (!animationName) throw new Error('Animation name must not be null')
    skeletonData.animations[animationName] = readAnimation(input, animationName, skeletonData, scale, supportsSequence)
  }

  // Resolve linked meshes: copy geometry from their parent mesh.
  for (const linked of linkedMeshes) {
    const skin = linked.skin ? skeletonData.skins.find((s) => s.name === linked.skin) : undefined
    const parent = skin?.attachments[linked.parent ?? '']?.[linked.att.name ?? '']
      ?? skeletonData.skins[0]?.attachments[linked.parent ?? '']?.[linked.att.name ?? '']
    if (parent && (parent.type === 'mesh' || parent.type === 'linkedmesh')) {
      const att = linked.att as AttachmentData
      att.uvs = parent.uvs
      att.triangles = parent.triangles
      att.vertices = parent.vertices
      att.hull = parent.hull
      att.region = parent.region
      att.sequence = parent.sequence
    }
  }

  return skeletonData
}
function readSequence(input: BinaryInput): SequenceData | null {
  if (!input.readBoolean()) return null
  const count = input.readInt(true)
  const start = input.readInt(true)
  const digits = input.readInt(true)
  const setupIndex = input.readInt(true)
  return { count, start, digits, setupIndex }
}

function readVertices(input: BinaryInput, vertexCount: number, scale: number): number[] {
  const verticesLength = vertexCount << 1
  if (!input.readBoolean()) {
    return readFloatArray(input, verticesLength, scale)
  }
  const bonesArray: number[] = []
  const weights: number[] = []
  for (let i = 0; i < vertexCount; i++) {
    const boneCount = input.readInt(true)
    bonesArray.push(boneCount)
    for (let ii = 0; ii < boneCount; ii++) {
      bonesArray.push(input.readInt(true))
      weights.push(input.readFloat() * scale)
      weights.push(input.readFloat() * scale)
      weights.push(input.readFloat())
    }
  }
  // Interleave into the format the runtime expects:
  // [boneCount, boneIdx, vx, vy, weight, boneCount, ...]
  const interleaved: number[] = []
  let bi = 0
  let wi = 0
  for (let v = 0; v < vertexCount; v++) {
    const boneCount = bonesArray[bi++]
    interleaved.push(boneCount)
    for (let b = 0; b < boneCount; b++) {
      const boneIndex = bonesArray[bi++]
      const vx = weights[wi++]
      const vy = weights[wi++]
      const weight = weights[wi++]
      interleaved.push(boneIndex, vx, vy, weight)
    }
  }
  return interleaved
}

interface LinkedMesh {
  att: AttachmentData
  skin?: string
  parent?: string
}

function readSkin(
  input: BinaryInput,
  skeletonData: SkeletonData,
  defaultSkin: boolean,
  nonessential: boolean,
  scale: number,
  linkedMeshes: LinkedMesh[],
  supportsSequence: boolean
): SkinData | null {
  let skin: SkinData | null = null
  let slotCount = 0
  if (defaultSkin) {
    slotCount = input.readInt(true)
    if (slotCount === 0) return null
    skin = { name: 'default', attachments: {} }
  } else {
    const skinName = input.readStringRef()
    if (!skinName) throw new Error('Skin name must not be null')
    skin = { name: skinName, attachments: {} }
    const boneCount = input.readInt(true)
    skin.bones = []
    for (let i = 0; i < boneCount; i++) skin.bones.push(skeletonData.bones[input.readInt(true)]?.name ?? '')
    for (let c = 0; c < 3; c++) {
      const n = input.readInt(true)
      for (let i = 0; i < n; i++) input.readInt(true)
    }
    slotCount = input.readInt(true)
  }
  for (let i = 0; i < slotCount; i++) {
    const slotIndex = input.readInt(true)
    const slotName = skeletonData.slots[slotIndex]?.name ?? ''
    const attCount = input.readInt(true)
    const slotAttachments: Record<string, AttachmentData> = {}
    for (let ii = 0; ii < attCount; ii++) {
      const name = input.readStringRef()
      if (!name) throw new Error('Attachment name must not be null')
      const att = readAttachment(input, skeletonData, slotIndex, name, nonessential, scale, linkedMeshes, supportsSequence)
      if (att) slotAttachments[name] = att
    }
    skin.attachments[slotName] = slotAttachments
  }
  return skin
}

function readAttachment(
  input: BinaryInput,
  skeletonData: SkeletonData,
  _slotIndex: number,
  attachmentName: string,
  nonessential: boolean,
  scale: number,
  linkedMeshes: LinkedMesh[],
  supportsSequence: boolean
): AttachmentData | null {
  const name = input.readStringRef() ?? attachmentName
  switch (input.readByte()) {
    case ATTACHMENT_REGION: {
      const path = input.readStringRef() ?? name
      const rotation = input.readFloat()
      const x = input.readFloat()
      const y = input.readFloat()
      const scaleX = input.readFloat()
      const scaleY = input.readFloat()
      const width = input.readFloat()
      const height = input.readFloat()
      const color = rgbaToHex(input.readInt32())
      const sequence = supportsSequence ? readSequence(input) : null
      return {
        type: 'region',
        name,
        path,
        x: x * scale,
        y: y * scale,
        rotation,
        scaleX,
        scaleY,
        width: width * scale,
        height: height * scale,
        color,
        sequence: sequence ?? undefined
      }
    }
    case ATTACHMENT_BOUNDINGBOX: {
      const vertexCount = input.readInt(true)
      const verts = readVertices(input, vertexCount, scale)
      const color = nonessential ? rgbaToHex(input.readInt32()) : undefined
      return { type: 'boundingbox', name, vertexCount, vertices: verts, color }
    }
    case ATTACHMENT_MESH: {
      const path = input.readStringRef() ?? name
      const color = rgbaToHex(input.readInt32())
      const vertexCount = input.readInt(true)
      const uvs = readFloatArray(input, vertexCount << 1, 1)
      const triangles = readShortArray(input)
      const verts = readVertices(input, vertexCount, scale)
      const hullLength = input.readInt(true)
      const sequence = supportsSequence ? readSequence(input) : null
      let edges: number[] | undefined
      let width = 0
      let height = 0
      if (nonessential) {
        edges = readShortArray(input)
        width = input.readFloat()
        height = input.readFloat()
      }
      return {
        type: 'mesh',
        name,
        path,
        region: path,
        color,
        uvs,
        triangles,
        vertices: verts,
        hull: hullLength,
        edges,
        width: width * scale,
        height: height * scale,
        sequence: sequence ?? undefined
      }
    }
    case ATTACHMENT_LINKEDMESH: {
      const path = input.readStringRef() ?? name
      const color = rgbaToHex(input.readInt32())
      const skinName = input.readStringRef() ?? undefined
      const parent = input.readStringRef() ?? undefined
      input.readBoolean()
      const sequence = supportsSequence ? readSequence(input) : null
      let width = 0
      let height = 0
      if (nonessential) {
        width = input.readFloat()
        height = input.readFloat()
      }
      const att: AttachmentData = {
        type: 'linkedmesh',
        name,
        path,
        region: path,
        color,
        skin: skinName,
        parent,
        width: width * scale,
        height: height * scale,
        sequence: sequence ?? undefined
      }
      linkedMeshes.push({ att, skin: skinName, parent })
      return att
    }
    case ATTACHMENT_PATH: {
      const closed = input.readBoolean()
      const constantSpeed = input.readBoolean()
      const vertexCount = input.readInt(true)
      const isWeighted = input.readBoolean()
      let pathBones: number[] | undefined
      let pathVertices: number[]
      if (isWeighted) {
        const bonesArr: number[] = []
        const weightsArr: number[] = []
        for (let i = 0; i < vertexCount; i++) {
          const boneCount = input.readInt(true)
          bonesArr.push(boneCount)
          for (let ii = 0; ii < boneCount; ii++) {
            bonesArr.push(input.readInt(true))
            weightsArr.push(input.readFloat() * scale)
            weightsArr.push(input.readFloat() * scale)
            weightsArr.push(input.readFloat())
          }
        }
        pathBones = bonesArr
        pathVertices = weightsArr
      } else {
        pathVertices = readFloatArray(input, vertexCount * 2, scale)
      }
      const lengths = new Array<number>(vertexCount / 3).fill(0)
      for (let i = 0; i < lengths.length; i++) lengths[i] = input.readFloat() * scale
      const color = nonessential ? rgbaToHex(input.readInt32()) : undefined
      return {
        type: 'path',
        name,
        vertexCount,
        vertices: pathVertices,
        bones: pathBones,
        closed,
        constantSpeed,
        lengths,
        color
      }
    }
    case ATTACHMENT_POINT: {
      const rotation = input.readFloat()
      const x = input.readFloat()
      const y = input.readFloat()
      const color = nonessential ? rgbaToHex(input.readInt32()) : undefined
      return { type: 'point', name, x: x * scale, y: y * scale, rotation, color }
    }
    case ATTACHMENT_CLIPPING: {
      const endSlotIndex = input.readInt(true)
      const vertexCount = input.readInt(true)
      const verts = readVertices(input, vertexCount, scale)
      const color = nonessential ? rgbaToHex(input.readInt32()) : undefined
      return {
        type: 'clipping',
        name,
        vertexCount,
        vertices: verts,
        end: skeletonData.slots[endSlotIndex]?.name,
        color
      }
    }
  }
  return null
}
