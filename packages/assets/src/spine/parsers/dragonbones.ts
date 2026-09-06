/**
 * DragonBones / LoongBones JSON parser.
 *
 * DragonBones exports an "armature" tree; LoongBones is the successor and
 * keeps the same JSON shape. We lower the first armature (or a chosen one)
 * into the normalized {@link SkeletonData} IR so the runtime can treat
 * Spine and DragonBones identically.
 *
 * DragonBones JSON top-level:
 * {
 *   "version": "5.x",
 *   "armature": [ { "name", "bone", "slot", "skin", "animation", "ik" } ],
 *   "TextureAtlas": [ { "SubTexture" } ]
 * }
 *
 * Reference: https://github.com/DragonBones/DragonBonesJS
 */

import type {
  SkeletonData,
  BoneData,
  SlotData,
  IkConstraintData,
  SkinData,
  AnimationData,
  AttachmentData,
} from '../types'
import type { SpineAtlas, AtlasPage, AtlasRegion } from './atlas'

interface RawDragonBones {
  version?: string
  frameRate?: number
  armature?: Array<Record<string, unknown>>
  TextureAtlas?: RawTextureAtlas[]
}

/** A DragonBones / LoongBones texture atlas page (one PNG). */
interface RawTextureAtlas {
  name: string
  width?: number
  height?: number
  SubTexture?: RawSubTexture[]
}

/** A named sub-rectangle inside a DragonBones texture atlas page. */
interface RawSubTexture {
  name: string
  x?: number
  y?: number
  width?: number
  height?: number
  /** Trim offset of the packed bitmap within the original (untrimmed) frame. */
  frameX?: number
  frameY?: number
  /** Original (untrimmed) frame size. */
  frameWidth?: number
  frameHeight?: number
}

interface RawArmature {
  name: string
  bone?: Array<Record<string, unknown>>
  slot?: Array<Record<string, unknown>>
  skin?: Array<Record<string, unknown>>
  animation?: Array<Record<string, unknown>>
  ik?: Array<Record<string, unknown>>
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

function parseBones(raw: RawArmature['bone']): BoneData[] {
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
  }))
}

function parseSlots(raw: RawArmature['slot']): SlotData[] {
  if (!raw) return []
  return raw.map((s) => ({
    name: str(s.name, ''),
    bone: str(s.parent, ''),
    color: s.color as string | undefined,
    attachment: s.attachment as string | undefined,
    blend: s.blendMode === 'add' ? 'additive' : (s.blendMode as SlotData['blend'] | undefined),
  }))
}

function parseIk(raw: RawArmature['ik']): IkConstraintData[] {
  if (!raw) return []
  return raw.map((c) => ({
    name: str(c.name, ''),
    bones: (c.bones as string[]) ?? [],
    target: str(c.target, ''),
    bendPositive: c.bendPositive as boolean | undefined,
  }))
}

function parseSkins(raw: RawArmature['skin']): SkinData[] {
  if (!raw) return []
  return raw.map((skin) => {
    const attachments: Record<string, Record<string, AttachmentData>> = {}
    const slotArr = (skin.slot as Array<Record<string, unknown>>) ?? []
    for (const slot of slotArr) {
      const slotName = str(slot.name, '')
      const displayArr = (slot.display as Array<Record<string, unknown>>) ?? []
      const out: Record<string, AttachmentData> = {}
      for (const d of displayArr) {
        const attName = str(d.name, slotName)
        const type = d.type === 'mesh' ? 'mesh' : 'region'
        out[attName] = {
          type,
          name: attName,
          path: d.path as string | undefined,
          width: d.width as number | undefined,
          height: d.height as number | undefined,
          // DragonBones mesh: vertices + uvs + triangles
          vertices: d.vertices as number[] | undefined,
          uvs: d.uvs as number[] | undefined,
          triangles: d.triangles as number[] | undefined,
          // region transform
          x: d.transform ? (d.transform as number[])[0] : undefined,
          y: d.transform ? (d.transform as number[])[1] : undefined,
          rotation: d.transform ? (d.transform as number[])[2] : undefined,
          scaleX: d.transform ? (d.transform as number[])[3] : undefined,
          scaleY: d.transform ? (d.transform as number[])[4] : undefined,
        }
      }
      attachments[slotName] = out
    }
    return { name: str(skin.name, 'default'), attachments }
  })
}

function parseAnimations(raw: RawArmature['animation']): Record<string, AnimationData> {
  if (!raw) return {}
  const out: Record<string, AnimationData> = {}
  for (const a of raw) {
    out[str(a.name, 'anim')] = {
      bones: a.bone as AnimationData['bones'],
      slots: a.slot as AnimationData['slots'],
      // DragonBones stores deform under slot timelines; kept as-is for now.
      deform: a.slot as unknown as AnimationData['deform'],
    }
  }
  return out
}

/**
 * Parse a DragonBones / LoongBones JSON export into normalized skeleton data.
 *
 * @param json - parsed DragonBones JSON
 * @param armatureName - optional armature to pick (defaults to first)
 */
export function parseDragonBonesJson(
  json: RawDragonBones,
  armatureName?: string
): SkeletonData {
  const armatures = (json.armature ?? []) as unknown as RawArmature[]
  if (armatures.length === 0) {
    throw new Error('[Rasen Spine] DragonBones JSON has no armature')
  }
  const arm = armatureName
    ? armatures.find((a) => a.name === armatureName)
    : armatures[0]
  if (!arm) {
    throw new Error(`[Rasen Spine] armature "${armatureName}" not found`)
  }
  return {
    format: 'dragonbones',
    version: str(json.version, 'unknown'),
    fps: json.frameRate ?? 30,
    bones: parseBones(arm.bone),
    slots: parseSlots(arm.slot),
    ik: parseIk(arm.ik),
    skins: parseSkins(arm.skin),
    animations: parseAnimations(arm.animation),
  }
}

/** Parse from a JSON string. */
export function parseDragonBonesJsonString(text: string, armatureName?: string): SkeletonData {
  return parseDragonBonesJson(JSON.parse(text) as RawDragonBones, armatureName)
}

/**
 * Parse a DragonBones / LoongBones `TextureAtlas` (embedded at the top level
 * of the skeleton JSON) into a normalized {@link SpineAtlas}.
 *
 * This lets the shared renderer map DragonBones attachments to texture
 * sub-rectangles with the exact same {@link computeAttachmentWorld} math used
 * for Spine. DragonBones packs regions unrotated, so `degrees` is always 0.
 * When a `SubTexture` carries `frameX/frameY/frameWidth/frameHeight` (trimmed
 * export) those map onto Spine's `offsetX/offsetY/originalWidth/originalHeight`.
 *
 * @param json - parsed DragonBones JSON (must contain `TextureAtlas`)
 */
export function parseDragonBonesAtlas(json: RawDragonBones): SpineAtlas {
  const pages: AtlasPage[] = []
  const regions: Record<string, AtlasRegion> = {}
  const atlases = (json.TextureAtlas ?? []) as unknown as RawTextureAtlas[]
  for (const atlas of atlases) {
    const pageName = str(atlas.name, 'texture')
    const pw = num(atlas.width, 0)
    const ph = num(atlas.height, 0)
    const page: AtlasPage = { name: pageName, width: pw, height: ph, pma: false }
    pages.push(page)
    for (const sub of (atlas.SubTexture ?? []) as unknown as RawSubTexture[]) {
      const name = str(sub.name, '')
      const x = num(sub.x, 0)
      const y = num(sub.y, 0)
      const w = num(sub.width, 0)
      const h = num(sub.height, 0)
      const hasFrame = sub.frameWidth !== undefined && sub.frameHeight !== undefined
      const originalWidth = hasFrame ? num(sub.frameWidth, w) : w
      const originalHeight = hasFrame ? num(sub.frameHeight, h) : h
      const offsetX = hasFrame ? num(sub.frameX, 0) : 0
      const offsetY = hasFrame ? num(sub.frameY, 0) : 0
      regions[name] = {
        name,
        page: pageName,
        x,
        y,
        width: w,
        height: h,
        originalWidth,
        originalHeight,
        offsetX,
        offsetY,
        degrees: 0,
        index: 0,
        u: pw ? x / pw : 0,
        v: ph ? y / ph : 0,
        u2: pw ? (x + w) / pw : 0,
        v2: ph ? (y + h) / ph : 0,
        pma: false,
      }
    }
  }
  return { pages, regions }
}

void num
