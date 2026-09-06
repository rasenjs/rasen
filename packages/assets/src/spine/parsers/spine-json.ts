/**
 * Spine JSON parser.
 *
 * Lowers the official Spine JSON export (https://esotericsoftware.com/spine-json-format)
 * into the normalized {@link SkeletonData} IR. Supports 3.x and 4.x layouts.
 *
 * We intentionally keep this permissive: unknown fields are ignored, missing
 * fields assume the documented Spine defaults. This maximizes compatibility
 * across Spine versions without version-specific branching.
 */

import type {
  SkeletonData,
  BoneData,
  SlotData,
  IkConstraintData,
  TransformConstraintData,
  PathConstraintData,
  SkinData,
  EventData,
  AnimationData,
  AttachmentData,
} from '../types'

/** Raw Spine JSON shape (only the parts we read). */
interface RawSpineJson {
  skeleton?: {
    hash?: string
    spine?: string
    x?: number
    y?: number
    width?: number
    height?: number
    images?: string
    audio?: string
    fps?: number
  }
  bones?: Array<Record<string, unknown>>
  slots?: Array<Record<string, unknown>>
  ik?: Array<Record<string, unknown>>
  transform?: Array<Record<string, unknown>>
  path?: Array<Record<string, unknown>>
  skins?: Array<Record<string, unknown>>
  events?: Record<string, Record<string, unknown>>
  animations?: Record<string, Record<string, unknown>>
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function parseBones(raw: RawSpineJson['bones']): BoneData[] {
  if (!raw) return []
  return raw.map((b) => ({
    name: str(b.name, ''),
    parent: b.parent as string | undefined,
    length: b.length as number | undefined,
    x: b.x as number | undefined,
    y: b.y as number | undefined,
    rotation: b.rotation as number | undefined,
    scaleX: b.scaleX as number | undefined,
    scaleY: b.scaleY as number | undefined,
    shearX: b.shearX as number | undefined,
    shearY: b.shearY as number | undefined,
    transform: b.transform as BoneData['transform'] | undefined,
    skin: b.skin as boolean | undefined,
  }))
}

function parseSlots(raw: RawSpineJson['slots']): SlotData[] {
  if (!raw) return []
  return raw.map((s) => ({
    name: str(s.name, ''),
    bone: str(s.bone, ''),
    color: s.color as string | undefined,
    dark: s.dark as string | undefined,
    attachment: s.attachment as string | undefined,
    blend: s.blend as SlotData['blend'] | undefined,
  }))
}

function parseIk(raw: RawSpineJson['ik']): IkConstraintData[] {
  if (!raw) return []
  return raw.map((c) => ({
    name: str(c.name, ''),
    order: c.order as number | undefined,
    bones: (c.bones as string[]) ?? [],
    target: str(c.target, ''),
    mix: c.mix as number | undefined,
    softness: c.softness as number | undefined,
    bendPositive: c.bendPositive as boolean | undefined,
    compress: c.compress as boolean | undefined,
    stretch: c.stretch as boolean | undefined,
    uniform: c.uniform as boolean | undefined,
  }))
}

function parseTransform(raw: RawSpineJson['transform']): TransformConstraintData[] {
  if (!raw) return []
  return raw.map((c) => {
    // Spine's SkeletonJson defaults missing mixes to 1, and mixY/mixScaleY to
    // their X counterparts when absent. Match that exactly.
    const mixX = (c.mixX as number | undefined) ?? (c.translateMix as number | undefined) ?? 1
    const mixScaleX = (c.mixScaleX as number | undefined) ?? (c.scaleMix as number | undefined) ?? 1
    return {
      name: str(c.name, ''),
      order: c.order as number | undefined,
      bones: (c.bones as string[]) ?? [],
      target: str(c.target, ''),
      // Spine 4.x uses offset*/mix*; older exports use x/y/rotation/scale*/shear*
      // and rotateMix/translateMix/scaleMix/shearMix. Accept both.
      mixRotate: (c.mixRotate as number | undefined) ?? (c.rotateMix as number | undefined) ?? 1,
      mixX,
      mixY: (c.mixY as number | undefined) ?? (c.translateMix as number | undefined) ?? mixX,
      mixScaleX,
      mixScaleY: (c.mixScaleY as number | undefined) ?? (c.scaleMix as number | undefined) ?? mixScaleX,
      mixShearY: (c.mixShearY as number | undefined) ?? (c.shearMix as number | undefined) ?? 1,
      offsetRotation: (c.offsetRotation as number | undefined) ?? (c.rotation as number | undefined) ?? 0,
      offsetX: (c.offsetX as number | undefined) ?? (c.x as number | undefined) ?? 0,
      offsetY: (c.offsetY as number | undefined) ?? (c.y as number | undefined) ?? 0,
      offsetScaleX: (c.offsetScaleX as number | undefined) ?? (c.scaleX as number | undefined) ?? 0,
      offsetScaleY: (c.offsetScaleY as number | undefined) ?? (c.scaleY as number | undefined) ?? 0,
      offsetShearY: (c.offsetShearY as number | undefined) ?? (c.shearY as number | undefined) ?? 0,
      local: c.local as boolean | undefined,
      relative: c.relative as boolean | undefined,
    }
  })
}

function parsePath(raw: RawSpineJson['path']): PathConstraintData[] {
  if (!raw) return []
  return raw.map((c) => ({
    name: str(c.name, ''),
    order: c.order as number | undefined,
    bones: (c.bones as string[]) ?? [],
    target: str(c.target, ''),
    positionMode: c.positionMode as PathConstraintData['positionMode'] | undefined,
    spacingMode: c.spacingMode as PathConstraintData['spacingMode'] | undefined,
    rotateMode: c.rotateMode as PathConstraintData['rotateMode'] | undefined,
    rotation: c.rotation as number | undefined,
    position: c.position as number | undefined,
    spacing: c.spacing as number | undefined,
    mixRotate: (c.mixRotate as number | undefined) ?? (c.rotateMix as number | undefined),
    mixX: (c.mixX as number | undefined) ?? (c.translateMix as number | undefined),
    mixY: (c.mixY as number | undefined) ?? (c.translateMix as number | undefined),
    rotateMix: c.rotateMix as number | undefined,
    translateMix: c.translateMix as number | undefined,
  }))
}

function parseSkins(raw: RawSpineJson['skins']): SkinData[] {
  if (!raw) return []
  return raw.map((skin) => {
    const attachments: Record<string, Record<string, AttachmentData>> = {}
    const rawAttach = (skin.attachments ?? {}) as Record<string, Record<string, Record<string, unknown>>>
    for (const slotName of Object.keys(rawAttach)) {
      const slotMap = rawAttach[slotName]
      const out: Record<string, AttachmentData> = {}
      for (const attName of Object.keys(slotMap)) {
        const a = slotMap[attName]
        out[attName] = {
          // Spine spec: an attachment with no `type` field is a region.
          type: (a.type as AttachmentData['type']) ?? 'region',
          name: a.name as string | undefined,
          path: a.path as string | undefined,
          // region
          x: a.x as number | undefined,
          y: a.y as number | undefined,
          scaleX: a.scaleX as number | undefined,
          scaleY: a.scaleY as number | undefined,
          rotation: a.rotation as number | undefined,
          width: a.width as number | undefined,
          height: a.height as number | undefined,
          color: a.color as string | undefined,
          // mesh
          uvs: a.uvs as number[] | undefined,
          triangles: a.triangles as number[] | undefined,
          vertices: a.vertices as number[] | undefined,
          hull: a.hull as number | undefined,
          edges: a.edges as number[] | undefined,
          skin: a.skin as string | undefined,
          parent: a.parent as string | undefined,
          deform: a.deform as boolean | undefined,
          // polygon
          vertexCount: a.vertexCount as number | undefined,
          closed: a.closed as boolean | undefined,
          constantSpeed: a.constantSpeed as boolean | undefined,
          lengths: a.lengths as number[] | undefined,
          end: a.end as string | undefined,
        }
      }
      attachments[slotName] = out
    }
    return {
      name: str(skin.name, ''),
      bones: skin.bones as string[] | undefined,
      ik: skin.ik as string[] | undefined,
      transform: skin.transform as string[] | undefined,
      path: skin.path as string[] | undefined,
      attachments,
    }
  })
}

function parseEvents(raw: RawSpineJson['events']): Record<string, EventData> {
  if (!raw) return {}
  const out: Record<string, EventData> = {}
  for (const name of Object.keys(raw)) {
    const e = raw[name]
    out[name] = {
      name,
      int: e.int as number | undefined,
      float: e.float as number | undefined,
      string: e.string as string | undefined,
      audio: e.audio as string | undefined,
      volume: e.volume as number | undefined,
      balance: e.balance as number | undefined,
    }
  }
  return out
}

function parseAnimations(raw: RawSpineJson['animations']): Record<string, AnimationData> {
  if (!raw) return {}
  const out: Record<string, AnimationData> = {}
  for (const name of Object.keys(raw)) {
    const a = raw[name]
    out[name] = {
      bones: a.bones as AnimationData['bones'],
      slots: a.slots as AnimationData['slots'],
      ik: a.ik as AnimationData['ik'],
      transform: a.transform as AnimationData['transform'],
      path: a.path as AnimationData['path'],
      deform: a.deform as AnimationData['deform'],
      events: a.events as AnimationData['events'],
      draworder: a.draworder as AnimationData['draworder'],
    }
  }
  return out
}

/**
 * Parse a Spine JSON export into normalized skeleton data.
 *
 * @param json - parsed Spine JSON object
 * @returns normalized {@link SkeletonData}
 */
export function parseSpineJson(json: RawSpineJson): SkeletonData {
  const skel = json.skeleton ?? {}
  return {
    format: 'spine',
    version: str(skel.spine, 'unknown'),
    hash: skel.hash,
    width: skel.width,
    height: skel.height,
    x: skel.x,
    y: skel.y,
    images: skel.images,
    fps: skel.fps ?? 30,
    bones: parseBones(json.bones),
    slots: parseSlots(json.slots),
    ik: parseIk(json.ik),
    transform: parseTransform(json.transform),
    path: parsePath(json.path),
    skins: parseSkins(json.skins),
    events: parseEvents(json.events),
    animations: parseAnimations(json.animations),
  }
}

/** Parse from a JSON string. */
export function parseSpineJsonString(text: string): SkeletonData {
  return parseSpineJson(JSON.parse(text) as RawSpineJson)
}

// Keep helpers referenced for downstream tree-shaking clarity.
void num
void bool
