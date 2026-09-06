/**
 * Spine binary animation timeline parser.
 *
 * Extracted from parser-spine-binary.ts: parses all animation timeline types
 * (bone transform, slot attachment/color, IK/transform/path constraint mixes,
 * deform FFD, sequences, draw order, events) into the AnimationData IR.
 */

import type { SkeletonData, AnimationData, SlotTimeline, CurveKeyframe } from '../types'
import {
  BinaryInput,
  ATTACHMENT_SEQUENCE,
  SLOT_ATTACHMENT,
  SLOT_RGBA,
  SLOT_RGB,
  SLOT_RGBA2,
  SLOT_RGB2,
  SLOT_ALPHA,
  BONE_ROTATE,
  BONE_TRANSLATE,
  BONE_TRANSLATEX,
  BONE_TRANSLATEY,
  BONE_SCALE,
  BONE_SCALEX,
  BONE_SCALEY,
  BONE_SHEAR,
  BONE_SHEARX,
  BONE_SHEARY,
  PATH_POSITION,
  PATH_SPACING,
  PATH_MIX,
  readCurve1D,
  readCurve2D,
  readCurveN,
  rgbaToHex,
  type Curve
} from './binary-common'

/** Merge X-only / Y-only 1D timelines into a single 2D timeline. */
function mergeXY(
  existing: Array<CurveKeyframe & { x?: number; y?: number }> | undefined,
  xs: Array<CurveKeyframe & { x?: number }> | undefined,
  ys: Array<CurveKeyframe & { y?: number }> | undefined
): Array<CurveKeyframe & { x?: number; y?: number; axis?: 'x' | 'y' }> {
  const base: Array<CurveKeyframe & { x?: number; y?: number; axis?: 'x' | 'y' }> = existing ? existing.slice() : []
  if (xs) {
    for (const kf of xs) {
      base.push({ time: (kf as CurveKeyframe).time, x: kf.x, y: 0, curve: kf.curve, axis: 'x' })
    }
  }
  if (ys) {
    for (const kf of ys) {
      base.push({ time: (kf as CurveKeyframe).time, x: 0, y: kf.y, curve: kf.curve, axis: 'y' })
    }
  }
  base.sort((a, b) => (a as CurveKeyframe).time - (b as CurveKeyframe).time)
  return base
}

export function readAnimation(
  input: BinaryInput,
  _name: string,
  skeletonData: SkeletonData,
  scale: number,
  _supportsSequence: boolean
): AnimationData {
  input.readInt(true) // timeline count (unused; we iterate by type below)
  const anim: AnimationData = {}

  // Internal accumulators use loose typing because binary timelines may carry
  // X/Y split variants (translateX/translateY, ...) that are merged into the
  // 2D IR fields before assignment.
  const bones: Record<string, any> = {}
  const slots: Record<string, SlotTimeline> = {}
  const ik: Record<string, Array<CurveKeyframe & Record<string, unknown>>> = {}
  const transform: Record<string, Array<CurveKeyframe & Record<string, unknown>>> = {}
  const path: Record<string, Record<string, any>> = {}
  const deform: any = {}
  const sequence: any = {}
  const events: AnimationData['events'] = []
  const draworder: NonNullable<AnimationData['draworder']> = []

  const ensureBone = (n: string): any => (bones[n] ??= {})
  const ensureSlot = (n: string): SlotTimeline => (slots[n] ??= {})

  // --- Slot timelines ---
  const slotTimelineCount = input.readInt(true)
  for (let i = 0; i < slotTimelineCount; i++) {
    const slotIndex = input.readInt(true)
    const slotName = skeletonData.slots[slotIndex]?.name ?? ''
    const tl = ensureSlot(slotName)
    const subCount = input.readInt(true)
    for (let ii = 0; ii < subCount; ii++) {
      const timelineType = input.readByte()
      const frameCount = input.readInt(true)
      const frameLast = frameCount - 1
      switch (timelineType) {
        case SLOT_ATTACHMENT: {
          const kfs: Array<CurveKeyframe & { name?: string }> = []
          for (let f = 0; f < frameCount; f++) {
            const time = input.readFloat()
            const att = input.readStringRef() ?? undefined
            kfs.push({ time, name: att })
          }
          tl.attachment = (tl.attachment ?? []).concat(kfs)
          break
        }
        case SLOT_RGBA:
        case SLOT_RGB: {
          input.readInt(true)
          const kfs: Array<CurveKeyframe & { color?: string }> = []
          let time = input.readFloat()
          let r = input.readUnsignedByte() / 255
          let g = input.readUnsignedByte() / 255
          let b = input.readUnsignedByte() / 255
          let a = timelineType === SLOT_RGB ? 1 : input.readUnsignedByte() / 255
          for (let f = 0; ; f++) {
            kfs.push({ time, color: rgbaToHex((r * 255) << 24 | (g * 255) << 16 | (b * 255) << 8 | a * 255) })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const r2 = input.readUnsignedByte() / 255
            const g2 = input.readUnsignedByte() / 255
            const b2 = input.readUnsignedByte() / 255
            const a2 = timelineType === SLOT_RGB ? 1 : input.readUnsignedByte() / 255
            kfs[f].curve = readCurveN(input, timelineType === SLOT_RGB ? 3 : 4)
            time = time2
            r = r2
            g = g2
            b = b2
            a = a2
          }
          tl.color = (tl.color ?? []).concat(kfs)
          break
        }
        case SLOT_RGBA2:
        case SLOT_RGB2: {
          input.readInt(true)
          const kfs: Array<CurveKeyframe & { light?: string; dark?: string }> = []
          let time = input.readFloat()
          let r = input.readUnsignedByte() / 255
          let g = input.readUnsignedByte() / 255
          let b = input.readUnsignedByte() / 255
          let a = timelineType === SLOT_RGB2 ? 1 : input.readUnsignedByte() / 255
          let r2 = input.readUnsignedByte() / 255
          let g2 = input.readUnsignedByte() / 255
          let b2 = input.readUnsignedByte() / 255
          for (let f = 0; ; f++) {
            const light = rgbaToHex((r * 255) << 24 | (g * 255) << 16 | (b * 255) << 8 | a * 255)
            const dark = rgbaToHex((r2 * 255) << 24 | (g2 * 255) << 16 | (b2 * 255) << 8 | 255)
            kfs.push({ time, light, dark })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const nr = input.readUnsignedByte() / 255
            const ng = input.readUnsignedByte() / 255
            const nb = input.readUnsignedByte() / 255
            const na = timelineType === SLOT_RGB2 ? 1 : input.readUnsignedByte() / 255
            const nr2 = input.readUnsignedByte() / 255
            const ng2 = input.readUnsignedByte() / 255
            const nb2 = input.readUnsignedByte() / 255
            kfs[f].curve = readCurveN(input, timelineType === SLOT_RGB2 ? 6 : 7)
            time = time2
            r = nr
            g = ng
            b = nb
            a = na
            r2 = nr2
            g2 = ng2
            b2 = nb2
          }
          tl.twoColor = (tl.twoColor ?? []).concat(kfs)
          break
        }
        case SLOT_ALPHA: {
          input.readInt(true)
          const kfs: Array<CurveKeyframe & { color?: string }> = []
          let time = input.readFloat()
          let a = input.readUnsignedByte() / 255
          for (let f = 0; ; f++) {
            const setup = skeletonData.slots[slotIndex]?.color ?? 'FFFFFFFF'
            const rgb = setup.slice(0, 6)
            kfs.push({ time, color: rgb + (a * 255 | 0).toString(16).padStart(2, '0').toUpperCase() })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const a2 = input.readUnsignedByte() / 255
            kfs[f].curve = readCurve1D(input)
            time = time2
            a = a2
          }
          tl.color = (tl.color ?? []).concat(kfs)
          break
        }
      }
    }
  }

  // --- Bone timelines ---
  const boneTimelineCount = input.readInt(true)
  for (let i = 0; i < boneTimelineCount; i++) {
    const boneIndex = input.readInt(true)
    const boneName = skeletonData.bones[boneIndex]?.name ?? ''
    const tl = ensureBone(boneName)
    const subCount = input.readInt(true)
    for (let ii = 0; ii < subCount; ii++) {
      const type = input.readByte()
      const frameCount = input.readInt(true)
      input.readInt(true) // bezier count (unused; read inline per frame)
      const frameLast = frameCount - 1
      switch (type) {
        case BONE_ROTATE: {
          const kfs: Array<CurveKeyframe & { angle?: number }> = []
          let time = input.readFloat()
          let value = input.readFloat()
          for (let f = 0; ; f++) {
            kfs.push({ time, angle: value })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const value2 = input.readFloat()
            kfs[f].curve = readCurve1D(input)
            time = time2
            value = value2
          }
          tl.rotate = (tl.rotate ?? []).concat(kfs)
          break
        }
        case BONE_TRANSLATE: {
          const kfs: Array<CurveKeyframe & { x?: number; y?: number }> = []
          let time = input.readFloat()
          let v1 = input.readFloat() * scale
          let v2 = input.readFloat() * scale
          for (let f = 0; ; f++) {
            kfs.push({ time, x: v1, y: v2 })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const nv1 = input.readFloat() * scale
            const nv2 = input.readFloat() * scale
            kfs[f].curve = readCurve2D(input)
            time = time2
            v1 = nv1
            v2 = nv2
          }
          tl.translate = (tl.translate ?? []).concat(kfs)
          break
        }
        case BONE_TRANSLATEX: {
          const kfs: Array<CurveKeyframe & { x?: number }> = []
          let time = input.readFloat()
          let v = input.readFloat() * scale
          for (let f = 0; ; f++) {
            kfs.push({ time, x: v })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const v2 = input.readFloat() * scale
            kfs[f].curve = readCurve1D(input)
            time = time2
            v = v2
          }
          tl.translateX = (tl.translateX ?? []).concat(kfs)
          break
        }
        case BONE_TRANSLATEY: {
          const kfs: Array<CurveKeyframe & { y?: number }> = []
          let time = input.readFloat()
          let v = input.readFloat() * scale
          for (let f = 0; ; f++) {
            kfs.push({ time, y: v })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const v2 = input.readFloat() * scale
            kfs[f].curve = readCurve1D(input)
            time = time2
            v = v2
          }
          tl.translateY = (tl.translateY ?? []).concat(kfs)
          break
        }
        case BONE_SCALE: {
          const kfs: Array<CurveKeyframe & { x?: number; y?: number }> = []
          let time = input.readFloat()
          let v1 = input.readFloat()
          let v2 = input.readFloat()
          for (let f = 0; ; f++) {
            kfs.push({ time, x: v1, y: v2 })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const nv1 = input.readFloat()
            const nv2 = input.readFloat()
            kfs[f].curve = readCurve2D(input)
            time = time2
            v1 = nv1
            v2 = nv2
          }
          tl.scale = (tl.scale ?? []).concat(kfs)
          break
        }
        case BONE_SCALEX: {
          const kfs: Array<CurveKeyframe & { x?: number }> = []
          let time = input.readFloat()
          let v = input.readFloat()
          for (let f = 0; ; f++) {
            kfs.push({ time, x: v })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const v2 = input.readFloat()
            kfs[f].curve = readCurve1D(input)
            time = time2
            v = v2
          }
          tl.scaleX = (tl.scaleX ?? []).concat(kfs)
          break
        }
        case BONE_SCALEY: {
          const kfs: Array<CurveKeyframe & { y?: number }> = []
          let time = input.readFloat()
          let v = input.readFloat()
          for (let f = 0; ; f++) {
            kfs.push({ time, y: v })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const v2 = input.readFloat()
            kfs[f].curve = readCurve1D(input)
            time = time2
            v = v2
          }
          tl.scaleY = (tl.scaleY ?? []).concat(kfs)
          break
        }
        case BONE_SHEAR: {
          const kfs: Array<CurveKeyframe & { x?: number; y?: number }> = []
          let time = input.readFloat()
          let v1 = input.readFloat()
          let v2 = input.readFloat()
          for (let f = 0; ; f++) {
            kfs.push({ time, x: v1, y: v2 })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const nv1 = input.readFloat()
            const nv2 = input.readFloat()
            kfs[f].curve = readCurve2D(input)
            time = time2
            v1 = nv1
            v2 = nv2
          }
          tl.shear = (tl.shear ?? []).concat(kfs)
          break
        }
        case BONE_SHEARX: {
          const kfs: Array<CurveKeyframe & { x?: number }> = []
          let time = input.readFloat()
          let v = input.readFloat()
          for (let f = 0; ; f++) {
            kfs.push({ time, x: v })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const v2 = input.readFloat()
            kfs[f].curve = readCurve1D(input)
            time = time2
            v = v2
          }
          tl.shearX = (tl.shearX ?? []).concat(kfs)
          break
        }
        case BONE_SHEARY: {
          const kfs: Array<CurveKeyframe & { y?: number }> = []
          let time = input.readFloat()
          let v = input.readFloat()
          for (let f = 0; ; f++) {
            kfs.push({ time, y: v })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const v2 = input.readFloat()
            kfs[f].curve = readCurve1D(input)
            time = time2
            v = v2
          }
          tl.shearY = (tl.shearY ?? []).concat(kfs)
          break
        }
      }
    }
  }

  // Merge X/Y split variants into the 2D IR fields
  for (const tl of Object.values(bones)) {
    if (tl.translateX || tl.translateY) {
      tl.translate = mergeXY(tl.translate, tl.translateX, tl.translateY)
      delete tl.translateX
      delete tl.translateY
    }
    if (tl.scaleX || tl.scaleY) {
      tl.scale = mergeXY(tl.scale, tl.scaleX, tl.scaleY)
      delete tl.scaleX
      delete tl.scaleY
    }
    if (tl.shearX || tl.shearY) {
      tl.shear = mergeXY(tl.shear, tl.shearX, tl.shearY)
      delete tl.shearX
      delete tl.shearY
    }
  }

  // --- IK timelines ---
  const ikCount = input.readInt(true)
  for (let i = 0; i < ikCount; i++) {
    const index = input.readInt(true)
    const ikName = skeletonData.ik?.[index]?.name ?? ''
    const frameCount = input.readInt(true)
    const frameLast = frameCount - 1
    input.readInt(true)
    const kfs: Array<CurveKeyframe & Record<string, unknown>> = []
    let time = input.readFloat()
    let mix = input.readFloat()
    let softness = input.readFloat() * scale
    for (let f = 0; ; f++) {
      const bendDirection = input.readByte()
      const bendPositive = bendDirection >= 0
      const compress = input.readBoolean()
      const stretch = input.readBoolean()
      kfs.push({ time, mix, softness, bendPositive, bendDirection, compress, stretch })
      if (f === frameLast) break
      const time2 = input.readFloat()
      const mix2 = input.readFloat()
      const softness2 = input.readFloat() * scale
      kfs[f].curve = readCurve2D(input)
      time = time2
      mix = mix2
      softness = softness2
    }
    ik[ikName] = kfs
  }

  // --- Transform timelines ---
  const tcCount = input.readInt(true)
  for (let i = 0; i < tcCount; i++) {
    const index = input.readInt(true)
    const tcName = skeletonData.transform?.[index]?.name ?? ''
    const frameCount = input.readInt(true)
    const frameLast = frameCount - 1
    input.readInt(true)
    const kfs: Array<CurveKeyframe & Record<string, unknown>> = []
    let time = input.readFloat()
    let mixRotate = input.readFloat()
    let mixX = input.readFloat()
    let mixY = input.readFloat()
    let mixScaleX = input.readFloat()
    let mixScaleY = input.readFloat()
    let mixShearY = input.readFloat()
    for (let f = 0; ; f++) {
      kfs.push({ time, mixRotate, mixX, mixY, mixScaleX, mixScaleY, mixShearY })
      if (f === frameLast) break
      const time2 = input.readFloat()
      const mixRotate2 = input.readFloat()
      const mixX2 = input.readFloat()
      const mixY2 = input.readFloat()
      const mixScaleX2 = input.readFloat()
      const mixScaleY2 = input.readFloat()
      const mixShearY2 = input.readFloat()
      kfs[f].curve = readCurveN(input, 6)
      time = time2
      mixRotate = mixRotate2
      mixX = mixX2
      mixY = mixY2
      mixScaleX = mixScaleX2
      mixScaleY = mixScaleY2
      mixShearY = mixShearY2
    }
    transform[tcName] = kfs
  }

  // --- Path timelines ---
  const pcCount = input.readInt(true)
  for (let i = 0; i < pcCount; i++) {
    const index = input.readInt(true)
    const pcName = skeletonData.path?.[index]?.name ?? ''
    const pc = path[pcName] ??= {}
    const subCount = input.readInt(true)
    for (let ii = 0; ii < subCount; ii++) {
      const type = input.readByte()
      const frameCount = input.readInt(true)
      input.readInt(true)
      const frameLast = frameCount - 1
      const data = skeletonData.path?.[index]
      const s = data?.positionMode === 'fixed' ? scale : 1
      const sp = data?.spacingMode === 'length' || data?.spacingMode === 'fixed' ? scale : 1
      switch (type) {
        case PATH_POSITION: {
          const kfs: Array<CurveKeyframe & { position?: number }> = []
          let time = input.readFloat()
          let value = input.readFloat() * s
          for (let f = 0; ; f++) {
            kfs.push({ time, position: value })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const value2 = input.readFloat() * s
            kfs[f].curve = readCurve1D(input)
            time = time2
            value = value2
          }
          pc.position = (pc.position ?? []).concat(kfs)
          break
        }
        case PATH_SPACING: {
          const kfs: Array<CurveKeyframe & { spacing?: number }> = []
          let time = input.readFloat()
          let value = input.readFloat() * sp
          for (let f = 0; ; f++) {
            kfs.push({ time, spacing: value })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const value2 = input.readFloat() * sp
            kfs[f].curve = readCurve1D(input)
            time = time2
            value = value2
          }
          pc.spacing = (pc.spacing ?? []).concat(kfs)
          break
        }
        case PATH_MIX: {
          const kfs: Array<CurveKeyframe & { mixRotate?: number; mixX?: number; mixY?: number }> = []
          let time = input.readFloat()
          let mixRotate = input.readFloat()
          let mixX = input.readFloat()
          let mixY = input.readFloat()
          for (let f = 0; ; f++) {
            kfs.push({ time, mixRotate, mixX, mixY })
            if (f === frameLast) break
            const time2 = input.readFloat()
            const mixRotate2 = input.readFloat()
            const mixX2 = input.readFloat()
            const mixY2 = input.readFloat()
            kfs[f].curve = readCurveN(input, 3)
            time = time2
            mixRotate = mixRotate2
            mixX = mixX2
            mixY = mixY2
          }
          pc.mix = (pc.mix ?? []).concat(kfs)
          break
        }
      }
    }
  }

  // --- Deform (FFD) timelines + sequence timelines ---
  const deformCount = input.readInt(true)
  for (let i = 0; i < deformCount; i++) {
    const skin = skeletonData.skins[input.readInt(true)]
    const skinName = skin?.name ?? 'default'
    const skinDeform = deform[skinName] ??= {}
    const skinSequence = sequence[skinName] ??= {}
    const subCount = input.readInt(true)
    for (let ii = 0; ii < subCount; ii++) {
      const slotIndex = input.readInt(true)
      const slotName = skeletonData.slots[slotIndex]?.name ?? ''
      const slotDeform = skinDeform[slotName] ??= {}
      const slotSequence = skinSequence[slotName] ??= {}
      const meshCount = input.readInt(true)
      for (let iii = 0; iii < meshCount; iii++) {
        const attachmentName = input.readStringRef()
        if (!attachmentName) throw new Error('attachmentName must not be null')
        const timelineType = _supportsSequence ? input.readByte() : 0
        const frameCount = input.readInt(true)
        if (timelineType === ATTACHMENT_SEQUENCE) {
          const kfs2: Array<{ time: number; mode: number; index: number; delay: number }> = []
          for (let f = 0; f < frameCount; f++) {
            const time2 = input.readFloat()
            const modeAndIndex = input.readInt32()
            const delay = input.readFloat()
            kfs2.push({ time: time2, mode: modeAndIndex & 15, index: modeAndIndex >> 4, delay })
          }
          slotSequence[attachmentName] = (slotSequence[attachmentName] ?? []).concat(kfs2)
          continue
        }
        input.readInt(true) // vertex count (implied by the attachment)
        const frameLast = frameCount - 1
        const kfs: Array<CurveKeyframe & { vertices?: number[] }> = []
        let time = input.readFloat()
        for (let f = 0; ; f++) {
          let vertices: number[] | undefined
          let end = input.readInt(true)
          if (end === 0) {
            vertices = undefined
          } else {
            vertices = new Array<number>(end)
            const start = input.readInt(true)
            end += start
            for (let v = start; v < end; v++) vertices[v] = input.readFloat() * scale
          }
          kfs.push({ time, vertices })
          if (f === frameLast) break
          const time2 = input.readFloat()
          kfs[f].curve = readCurve1D(input)
          time = time2
        }
        slotDeform[attachmentName] = (slotDeform[attachmentName] ?? []).concat(kfs)
      }
    }
  }

  // --- Draw order ---
  const drawOrderCount = input.readInt(true)
  for (let i = 0; i < drawOrderCount; i++) {
    const time = input.readFloat()
    const offsetCount = input.readInt(true)
    const offsets: Array<{ slot: string; offset: number }> = []
    for (let j = 0; j < offsetCount; j++) {
      const slotIndex = input.readInt(true)
      const offset = input.readInt(true)
      const slotName = skeletonData.slots[slotIndex]?.name ?? ''
      offsets.push({ slot: slotName, offset })
    }
    draworder.push({ time, offsets })
  }

  // --- Events ---
  const eventCount = input.readInt(true)
  for (let i = 0; i < eventCount; i++) {
    const time = input.readFloat()
    const eventIndex = input.readInt(true)
    const eventName = Object.keys(skeletonData.events ?? {})[eventIndex] ?? ''
    const ev = skeletonData.events?.[eventName]
    const intValue = input.readInt(false)
    const floatValue = input.readFloat()
    const stringValue = input.readBoolean() ? input.readString() ?? ev?.string : ev?.string
    let volume: number | undefined
    let balance: number | undefined
    if (ev?.audio) {
      volume = input.readFloat()
      balance = input.readFloat()
    }
    events.push({ time, name: eventName, int: intValue, float: floatValue, string: stringValue, volume, balance })
  }

  if (Object.keys(bones).length) anim.bones = bones
  if (Object.keys(slots).length) anim.slots = slots
  if (Object.keys(ik).length) anim.ik = ik
  if (Object.keys(transform).length) anim.transform = transform
  if (Object.keys(path).length) anim.path = path
  if (deform && Object.keys(deform).length) anim.deform = deform
  if (sequence && Object.keys(sequence).length) anim.sequence = sequence
  if (events.length) anim.events = events
  if (draworder.length) anim.draworder = draworder
  return anim
}
