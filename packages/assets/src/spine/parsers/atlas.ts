/**
 * Spine atlas (.atlas) parser + attachment world-vertex evaluation.
 *
 * Lowers the official Spine `.atlas` text format (see
 * https://esotericsoftware.com/spine-atlas-format) into a normalized
 * {@link SpineAtlas} structure and provides the math to turn a parsed
 * {@link AttachmentData} into drawable world vertices + atlas UVs.
 *
 * The vertex math replicates Spine's `RegionAttachment.updateRegion` and
 * `Attachment.computeWorldVertices` so textured rendering lines up exactly
 * with the official runtimes.
 */

import type { AttachmentData, RegionAttachmentData, SkinData } from '../types'

// Minimal interfaces so atlas.ts doesn't depend on @rasenjs/spine runtime.
// The actual Skeleton/Slot classes satisfy these interfaces.
interface BoneRef {
  a: number; b: number; c: number; d: number
  worldX: number; worldY: number
}
interface SlotRef {
  bone: BoneRef
  data: { name: string }
  deform: number[] | null
  sequenceIndex: number
}
interface SkeletonRef {
  skin: string
  data: { skins: SkinData[] }
  bones: BoneRef[]
}

const DEG2RAD = Math.PI / 180

/** A single texture page (one atlas PNG). */
export interface AtlasPage {
  /** Image file name (relative to the atlas file). */
  name: string
  /** Page pixel size. */
  width: number
  height: number
  /** Premultiplied alpha. */
  pma: boolean
}

/** A named region inside an atlas page. */
export interface AtlasRegion {
  name: string
  page: string
  x: number
  y: number
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  offsetX: number
  offsetY: number
  /** Rotation in degrees (0, 90, 180, 270). */
  degrees: number
  index: number
  /** Normalized atlas UVs (0-1). */
  u: number
  v: number
  u2: number
  v2: number
  pma: boolean
}

/** Parsed Spine atlas. */
export interface SpineAtlas {
  pages: AtlasPage[]
  regions: Record<string, AtlasRegion>
}

/**
 * Parse a Spine `.atlas` text document into {@link SpineAtlas}.
 *
 * Tolerant of both the legacy (`xy` + `size` + `orig` + `offset`) and the
 * newer (`bounds` + `offsets`) field layouts. Unknown header/page fields are
 * ignored.
 */
export function parseSpineAtlas(text: string): SpineAtlas {
  const lines = text.split(/\r?\n/)
  const pages: AtlasPage[] = []
  const regions: Record<string, AtlasRegion> = {}
  let page: AtlasPage | null = null
  let region: AtlasRegion | null = null

  const finalizeRegion = (): void => {
    if (!region || !page) return
    if (region.originalWidth === 0 && region.originalHeight === 0) {
      region.originalWidth = region.width
      region.originalHeight = region.height
    }
    const pw = page.width
    const ph = page.height
    region.u = region.x / pw
    region.v = region.y / ph
    if (region.degrees === 90) {
      region.u2 = (region.x + region.height) / pw
      region.v2 = (region.y + region.width) / ph
    } else {
      region.u2 = (region.x + region.width) / pw
      region.v2 = (region.y + region.height) / ph
    }
    regions[region.name] = region
    region = null
  }

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (trimmed.length === 0) {
      // Blank line: end the current region. A new page starts on the next
      // name line (Spine's reader resets the page here too).
      finalizeRegion()
      page = null
      continue
    }
    const hasColon = trimmed.includes(':')
    if (!hasColon) {
      // A name line: starts a page (if none) or a new region.
      if (!page) {
        page = { name: trimmed, width: 0, height: 0, pma: false }
        pages.push(page)
      } else {
        finalizeRegion()
        region = {
          name: trimmed,
          page: page.name,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          originalWidth: 0,
          originalHeight: 0,
          offsetX: 0,
          offsetY: 0,
          degrees: 0,
          index: 0,
          u: 0,
          v: 0,
          u2: 0,
          v2: 0,
          pma: page.pma
        }
      }
      continue
    }
    // Field line (has a colon): page header field or region field.
    const colon = trimmed.indexOf(':')
    const key = trimmed.slice(0, colon).trim()
    const valueStr = trimmed.slice(colon + 1).trim()
    const values = valueStr.split(/[\s,]+/).filter(Boolean)
    if (!region) {
      if (key === 'size') {
        page!.width = Number(values[0])
        page!.height = Number(values[1])
      } else if (key === 'pma') {
        page!.pma = valueStr === 'true'
      }
      // format / filter / repeat / scale are ignored.
    } else {
      switch (key) {
        case 'xy':
          region.x = Number(values[0])
          region.y = Number(values[1])
          break
        case 'bounds':
          region.x = Number(values[0])
          region.y = Number(values[1])
          region.width = Number(values[2])
          region.height = Number(values[3])
          break
        case 'size':
          region.width = Number(values[0])
          region.height = Number(values[1])
          break
        case 'orig':
          region.originalWidth = Number(values[0])
          region.originalHeight = Number(values[1])
          break
        case 'offset':
          region.offsetX = Number(values[0])
          region.offsetY = Number(values[1])
          break
        case 'offsets':
          region.offsetX = Number(values[0])
          region.offsetY = Number(values[1])
          region.originalWidth = Number(values[2])
          region.originalHeight = Number(values[3])
          break
        case 'rotate':
          if (values[0] === 'true') region.degrees = 90
          else if (values[0] !== 'false') region.degrees = Number(values[0])
          break
        case 'index':
          region.index = Number(values[0])
          break
      }
    }
  }
  finalizeRegion()

  return { pages, regions }
}

/**
 * Compute a region attachment's 4 local vertices (`offset`, in the slot
 * bone's local space) and 4 atlas UVs, replicating Spine's
 * `RegionAttachment.updateRegion`.
 *
 * Vertex order is `[BR, BL, UL, UR]` (bottom-right, bottom-left, upper-left,
 * upper-right) — the same order Spine uses, so the quad triangles are
 * `[0,1,2]` and `[0,2,3]`.
 */
export function computeRegionLocal(
  att: RegionAttachmentData,
  region: AtlasRegion
): { offset: number[]; uvs: number[] } {
  const offset = new Array<number>(8).fill(0)
  const uvs = new Array<number>(8).fill(0)

  const attW = att.width ?? region.originalWidth
  const attH = att.height ?? region.originalHeight
  const scaleX = att.scaleX ?? 1
  const scaleY = att.scaleY ?? 1

  const regionScaleX = (attW / region.originalWidth) * scaleX
  const regionScaleY = (attH / region.originalHeight) * scaleY
  const localX = -(attW / 2) * scaleX + region.offsetX * regionScaleX
  const localY = -(attH / 2) * scaleY + region.offsetY * regionScaleY
  const localX2 = localX + region.width * regionScaleX
  const localY2 = localY + region.height * regionScaleY
  const radians = (att.rotation ?? 0) * DEG2RAD
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const x = att.x ?? 0
  const y = att.y ?? 0

  const localXCos = localX * cos + x
  const localXSin = localX * sin
  const localYCos = localY * cos + y
  const localYSin = localY * sin
  const localX2Cos = localX2 * cos + x
  const localX2Sin = localX2 * sin
  const localY2Cos = localY2 * cos + y
  const localY2Sin = localY2 * sin

  offset[0] = localXCos - localYSin
  offset[1] = localYCos + localXSin
  offset[2] = localXCos - localY2Sin
  offset[3] = localY2Cos + localXSin
  offset[4] = localX2Cos - localY2Sin
  offset[5] = localY2Cos + localX2Sin
  offset[6] = localX2Cos - localYSin
  offset[7] = localYCos + localX2Sin

  if (region.degrees === 90) {
    uvs[0] = region.u2
    uvs[1] = region.v2
    uvs[2] = region.u
    uvs[3] = region.v2
    uvs[4] = region.u
    uvs[5] = region.v
    uvs[6] = region.u2
    uvs[7] = region.v
  } else {
    uvs[0] = region.u
    uvs[1] = region.v2
    uvs[2] = region.u
    uvs[3] = region.v
    uvs[4] = region.u2
    uvs[5] = region.v
    uvs[6] = region.u2
    uvs[7] = region.v2
  }

  return { offset, uvs }
}

/** Drawable geometry for one attachment: world vertices + atlas UVs + triangles. */
export interface AttachmentGeometry {
  /** World-space vertices `[x0,y0,x1,y1,...]` in skeleton coordinates. */
  world: number[]
  /** Atlas UVs `[u0,v0,u1,v1,...]` normalized 0-1. */
  uvs: number[]
  /** Triangle indices into `world`/`uvs`. */
  triangles: number[]
}

/**
 * Compute the atlas region name for a sequence (animated frame) attachment at
 * the given frame index. Mirrors Spine's `Sequence.getPath`: the frame index is
 * offset by `start` and zero-padded to `digits` width, then appended to the
 * attachment's `path` (or `name`). Returns `basePath` unchanged when the
 * attachment is not a sequence.
 */
export function getSequenceRegionName(att: AttachmentData, index: number): string {
  const seq = att.sequence
  const base = att.path ?? att.name ?? ''
  if (!seq) return base
  let i = index
  if (i === -1) i = seq.setupIndex
  if (i >= seq.count) i = seq.count - 1
  if (i < 0) i = 0
  const frame = (seq.start + i).toString()
  let name = base
  for (let p = seq.digits - frame.length; p > 0; p--) name += '0'
  name += frame
  return name
}

/**
 * Resolve the atlas region name to use for an attachment, accounting for Spine
 * 4.1+ sequence (animated frame) attachments. For a sequence, the current frame
 * is derived from `slot.sequenceIndex`; for a `linkedmesh` whose parent carries
 * the sequence, the parent's frame is used. Falls back to the attachment's own
 * `region`/`path` for non-sequence attachments.
 */
export function resolveRegionName(att: AttachmentData, slot: SlotRef, skeleton: SkeletonRef): string {
  let target = att
  if (att.type === 'linkedmesh' && att.parent) {
    const skinName = att.skin ?? skeleton.skin
    const skin = skeleton.data.skins.find((s) => s.name === skinName) ?? skeleton.data.skins.find((s) => s.name === 'default')
    const parent = skin?.attachments[slot.data.name]?.[att.parent ?? '']
    if (parent && (parent.type === 'mesh' || parent.type === 'linkedmesh')) target = parent
  }
  if (target.sequence) return getSequenceRegionName(target, slot.sequenceIndex)
  return target.region ?? target.path ?? att.name ?? ''
}

/**
 * Resolve an attachment into drawable world geometry + atlas UVs.
 *
 * Handles `region` (and attachments with no `type`), `mesh`, and
 * `linkedmesh` (resolved through its parent mesh). Polygon-style attachments
 * (boundingbox / path / clipping / point) are skipped and `null` is returned.
 */
export function computeAttachmentWorld(
  att: AttachmentData,
  slot: SlotRef,
  skeleton: SkeletonRef,
  atlas: SpineAtlas,
  /** JSON attachment key; used as the atlas region name when `att.path`/`att.name` are absent. */
  attachmentName?: string
): AttachmentGeometry | null {
  const bone = slot.bone
  const type = att.type ?? 'region'

  if (type === 'boundingbox' || type === 'path' || type === 'clipping' || type === 'point') {
    return null
  }

  if (type === 'region') {
    const regionName = resolveRegionName(att, slot, skeleton) || attachmentName || ''
    const region = atlas.regions[regionName]
    if (!region) return null
    const { offset, uvs } = computeRegionLocal(att as RegionAttachmentData, region)
    const world = new Array<number>(8)
    for (let v = 0; v < 4; v++) {
      const lx = offset[2 * v]
      const ly = offset[2 * v + 1]
      world[2 * v] = lx * bone.a + ly * bone.b + bone.worldX
      world[2 * v + 1] = lx * bone.c + ly * bone.d + bone.worldY
    }
    return { world, uvs, triangles: [0, 1, 2, 0, 2, 3] }
  }

  // Mesh / linkedmesh: resolve source mesh data.
  let mesh = att
  if (type === 'linkedmesh') {
    const parentName = att.parent
    const skinName = att.skin ?? skeleton.skin
    const skin =
      skeleton.data.skins.find((s) => s.name === skinName) ??
      skeleton.data.skins.find((s) => s.name === 'default')
    const parentAtt = skin?.attachments[slot.data.name]?.[parentName ?? '']
    if (parentAtt && (parentAtt.type === 'mesh' || parentAtt.type === 'linkedmesh')) {
      mesh = parentAtt
    } else {
      return null
    }
  }

  const regionUvs = mesh.uvs
  const verts = mesh.vertices
  const triangles = mesh.triangles
  if (!regionUvs || !verts || !triangles) return null

  // Mesh UVs are normalized [0,1] *relative to the atlas region*. Remap them
  // into atlas space, replicating Spine's MeshAttachment.updateRegion exactly
  // (handles 90/180/270 rotated regions via offsetX/offsetY/original size).
  const regionName = resolveRegionName(att, slot, skeleton) || attachmentName || ''
  const region = atlas.regions[regionName]
  const uvs = new Array<number>(regionUvs.length)
  if (region) {
    const page = atlas.pages.find((p) => p.name === region.page)
    const textureWidth = page?.width ?? 1
    const textureHeight = page?.height ?? 1
    const n = uvs.length
    let u = region.u
    let v = region.v
    let width = 0
    let height = 0
    switch (region.degrees) {
      case 90:
        u -= (region.originalHeight - region.offsetY - region.height) / textureWidth
        v -= (region.originalWidth - region.offsetX - region.width) / textureHeight
        width = region.originalHeight / textureWidth
        height = region.originalWidth / textureHeight
        for (let i = 0; i < n; i += 2) {
          uvs[i] = u + regionUvs[i + 1] * width
          uvs[i + 1] = v + (1 - regionUvs[i]) * height
        }
        break
      case 180:
        u -= (region.originalWidth - region.offsetX - region.width) / textureWidth
        v -= region.offsetY / textureHeight
        width = region.originalWidth / textureWidth
        height = region.originalHeight / textureHeight
        for (let i = 0; i < n; i += 2) {
          uvs[i] = u + (1 - regionUvs[i]) * width
          uvs[i + 1] = v + (1 - regionUvs[i + 1]) * height
        }
        break
      case 270:
        u -= region.offsetY / textureWidth
        v -= region.offsetX / textureHeight
        width = region.originalHeight / textureWidth
        height = region.originalWidth / textureHeight
        for (let i = 0; i < n; i += 2) {
          uvs[i] = u + (1 - regionUvs[i + 1]) * width
          uvs[i + 1] = v + regionUvs[i] * height
        }
        break
      default:
        u -= region.offsetX / textureWidth
        v -= (region.originalHeight - region.offsetY - region.height) / textureHeight
        width = region.originalWidth / textureWidth
        height = region.originalHeight / textureHeight
        for (let i = 0; i < n; i += 2) {
          uvs[i] = u + regionUvs[i] * width
          uvs[i + 1] = v + regionUvs[i + 1] * height
        }
    }
  } else {
    for (let i = 0; i < regionUvs.length; i++) uvs[i] = regionUvs[i]
  }

  const vCount = uvs.length / 2
  const world = new Array<number>(vCount * 2)
  const weighted = verts.length !== vCount * 2
  const deform = slot.deform

  if (!weighted) {
    for (let v = 0; v < vCount; v++) {
      const lx = verts[2 * v] + (deform ? deform[2 * v] ?? 0 : 0)
      const ly = verts[2 * v + 1] + (deform ? deform[2 * v + 1] ?? 0 : 0)
      world[2 * v] = lx * bone.a + ly * bone.b + bone.worldX
      world[2 * v + 1] = lx * bone.c + ly * bone.d + bone.worldY
    }
  } else {
    let ptr = 0
    let f = 0
    for (let v = 0; v < vCount; v++) {
      const boneCount = verts[ptr++]
      let wx = 0
      let wy = 0
      for (let b = 0; b < boneCount; b++) {
        const boneIndex = verts[ptr++]
        const vx = verts[ptr++] + (deform ? deform[f] ?? 0 : 0)
        const vy = verts[ptr++] + (deform ? deform[f + 1] ?? 0 : 0)
        const weight = verts[ptr++]
        const bb = skeleton.bones[boneIndex]
        if (!bb) continue
        wx += (vx * bb.a + vy * bb.b + bb.worldX) * weight
        wy += (vx * bb.c + vy * bb.d + bb.worldY) * weight
        f += 2
      }
      world[2 * v] = wx
      world[2 * v + 1] = wy
    }
  }

  return { world, uvs, triangles }
}

/**
 * Lightweight per-frame world-vertex computation for a drawable attachment.
 *
 * Unlike {@link computeAttachmentWorld}, this does NOT recompute the (static)
 * atlas-space UVs — it only fills `out` with the world-space vertices for the
 * current pose. Callers that cache UVs/triangles (e.g. a WebGL mesh builder)
 * can rebuild the mesh every animation frame without re-allocating UV arrays.
 *
 * @returns the vertex count written to `out`, or 0 if the attachment is not
 * drawable (boundingbox/path/clipping/point or missing geometry).
 */
export function computeAttachmentWorldVertices(
  att: AttachmentData,
  slot: SlotRef,
  skeleton: SkeletonRef,
  atlas: SpineAtlas,
  attachmentName: string | undefined,
  out: Float32Array | number[]
): number {
  const bone = slot.bone
  const type = att.type ?? 'region'

  if (type === 'boundingbox' || type === 'path' || type === 'clipping' || type === 'point') {
    return 0
  }

  if (type === 'region') {
    const regionName = att.path ?? att.name ?? attachmentName ?? ''
    const region = atlas.regions[regionName]
    if (!region) return 0
    const { offset } = computeRegionLocal(att as RegionAttachmentData, region)
    for (let v = 0; v < 4; v++) {
      const lx = offset[2 * v]
      const ly = offset[2 * v + 1]
      out[2 * v] = lx * bone.a + ly * bone.b + bone.worldX
      out[2 * v + 1] = lx * bone.c + ly * bone.d + bone.worldY
    }
    return 4
  }

  // Mesh / linkedmesh: resolve source mesh data.
  let mesh = att
  if (type === 'linkedmesh') {
    const parentName = att.parent
    const skinName = att.skin ?? skeleton.skin
    const skin =
      skeleton.data.skins.find((s) => s.name === skinName) ??
      skeleton.data.skins.find((s) => s.name === 'default')
    const parentAtt = skin?.attachments[slot.data.name]?.[parentName ?? '']
    if (parentAtt && (parentAtt.type === 'mesh' || parentAtt.type === 'linkedmesh')) {
      mesh = parentAtt
    } else {
      return 0
    }
  }

  const verts = mesh.vertices
  const uvs = mesh.uvs
  if (!verts || !uvs) return 0
  const vCount = uvs.length / 2
  const weighted = verts.length !== vCount * 2
  const deform = slot.deform

  if (!weighted) {
    for (let v = 0; v < vCount; v++) {
      const lx = verts[2 * v] + (deform ? deform[2 * v] ?? 0 : 0)
      const ly = verts[2 * v + 1] + (deform ? deform[2 * v + 1] ?? 0 : 0)
      out[2 * v] = lx * bone.a + ly * bone.b + bone.worldX
      out[2 * v + 1] = lx * bone.c + ly * bone.d + bone.worldY
    }
  } else {
    // Weighted mesh: deform index is per bone influence (official
    // `computeWorldVertices` increments f by 2 per bone, not per vertex).
    let ptr = 0
    let f = 0
    for (let v = 0; v < vCount; v++) {
      const boneCount = verts[ptr++]
      let wx = 0
      let wy = 0
      for (let b = 0; b < boneCount; b++) {
        const boneIndex = verts[ptr++]
        const vx = verts[ptr++] + (deform ? deform[f] ?? 0 : 0)
        const vy = verts[ptr++] + (deform ? deform[f + 1] ?? 0 : 0)
        const weight = verts[ptr++]
        const bb = skeleton.bones[boneIndex]
        if (!bb) continue
        wx += (vx * bb.a + vy * bb.b + bb.worldX) * weight
        wy += (vx * bb.c + vy * bb.d + bb.worldY) * weight
        f += 2
      }
      out[2 * v] = wx
      out[2 * v + 1] = wy
    }
  }

  return vCount
}
