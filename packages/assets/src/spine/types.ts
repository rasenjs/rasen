/**
 * Spine / DragonBones / LoongBones shared types.
 *
 * The runtime is self-developed but aims to be compatible with the JSON
 * export formats of Esoteric Spine (3.x / 4.x) and DragonBones / LoongBones.
 * We model a single normalized skeleton data structure and provide
 * per-format parsers that lower their native shapes into it.
 *
 * Reference formats:
 * - Spine JSON:  https://esotericsoftware.com/spine-json-format
 * - DragonBones: https://github.com/DragonBones/DragonBonesJS
 * - LoongBones:  https://www.loongbones.com/ (DragonBones successor)
 */

/** Source format of a parsed skeleton. */
export type SkeletonFormat = 'spine' | 'dragonbones'

/** Bone inheritance mode (Spine `transform` field). */
export type BoneTransformMode =
  | 'normal'
  | 'onlyTranslation'
  | 'noRotationOrReflection'
  | 'noScale'
  | 'noScaleOrReflection'

/** Slot blend mode. */
export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen'

/** Attachment kinds we understand. */
export type AttachmentType =
  | 'region'
  | 'mesh'
  | 'linkedmesh'
  | 'boundingbox'
  | 'path'
  | 'point'
  | 'clipping'

/** A single bone in the setup pose. */
export interface BoneData {
  name: string
  parent?: string
  length?: number
  x?: number
  y?: number
  rotation?: number
  scaleX?: number
  scaleY?: number
  shearX?: number
  shearY?: number
  transform?: BoneTransformMode
  /** Bone only active when the active skin contains it (Spine). */
  skin?: boolean
}

/** A draw slot in the setup pose. */
export interface SlotData {
  name: string
  bone: string
  color?: string
  /** Two-color tint dark color (RGB), Spine only. */
  dark?: string
  attachment?: string
  blend?: BlendMode
}

/** IK constraint setup. */
export interface IkConstraintData {
  name: string
  order?: number
  bones: string[]
  target: string
  mix?: number
  softness?: number
  /** Spine `bendDirection`: -1, 0, or 1.  0 = positive (default). */
  bendDirection?: number
  bendPositive?: boolean
  compress?: boolean
  stretch?: boolean
  uniform?: boolean
}

/** Transform constraint setup. */
export interface TransformConstraintData {
  name: string
  order?: number
  bones: string[]
  target: string
  /** Rotation mix (Spine `mixRotate`). */
  mixRotate?: number
  /** Translation X mix (Spine `mixX`). */
  mixX?: number
  /** Translation Y mix (Spine `mixY`). */
  mixY?: number
  /** Scale X mix (Spine `mixScaleX`). */
  mixScaleX?: number
  /** Scale Y mix (Spine `mixScaleY`). */
  mixScaleY?: number
  /** Shear Y mix (Spine `mixShearY`). */
  mixShearY?: number
  /** Offset rotation (Spine `offsetRotation`). */
  offsetRotation?: number
  /** Offset translation X (Spine `offsetX`; JSON field `x`). */
  offsetX?: number
  /** Offset translation Y (Spine `offsetY`; JSON field `y`). */
  offsetY?: number
  /** Offset scale X (Spine `offsetScaleX`). */
  offsetScaleX?: number
  /** Offset scale Y (Spine `offsetScaleY`). */
  offsetScaleY?: number
  /** Offset shear Y (Spine `offsetShearY`). */
  offsetShearY?: number
  /** Local-space application (Spine `local`). */
  local?: boolean
  /** Relative application (Spine `relative`). */
  relative?: boolean
}

/** Path constraint setup. */
export interface PathConstraintData {
  name: string
  order?: number
  bones: string[]
  target: string
  positionMode?: 'fixed' | 'percent'
  spacingMode?: 'length' | 'fixed' | 'percent'
  rotateMode?: 'tangent' | 'chain' | 'chainScale'
  rotation?: number
  position?: number
  spacing?: number
  /** Rotation mix (Spine `mixRotate`). */
  mixRotate?: number
  /** Translation X mix (Spine `mixX`). */
  mixX?: number
  /** Translation Y mix (Spine `mixY`). */
  mixY?: number
  /** Legacy alias for mixRotate (older JSON exports). */
  rotateMix?: number
  /** Legacy alias for mixX (older JSON exports). */
  translateMix?: number
}

/** Spine 4.1+ sequence attachment metadata (grid of frames in one texture). */
export interface SequenceData {
  /** Number of frames. */
  count: number
  /** First frame index (added to the timeline/setup index). */
  start: number
  /** Zero-padding width of the frame index in the region name. */
  digits: number
  /** Frame shown in the setup pose (used when sequenceIndex === -1). */
  setupIndex: number
}

/** Base attachment descriptor. */
export interface AttachmentData {
  type?: AttachmentType
  name?: string
  /** Texture region key (defaults to attachment name). */
  path?: string
  /** Atlas region name for mesh attachments (Spine 4.x). */
  region?: string
  /** Present when the attachment is a Spine 4.1+ sequence (animated frames). */
  sequence?: SequenceData
  // Region transform (shared by region + DragonBones display).
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  width?: number
  height?: number
  color?: string
  // Mesh geometry (shared by mesh + DragonBones mesh display).
  uvs?: number[]
  triangles?: number[]
  vertices?: number[]
  /** Weighted bone indices (for path/mesh attachments). In official spine format:
   *  bones = [boneCount, boneIdx, boneIdx, ..., boneCount, ...] and
   *  vertices = [vx, vy, weight, vx, vy, weight, ...] (flat, not interleaved). */
  bones?: number[]
  hull?: number
  edges?: number[]
  skin?: string
  parent?: string
  deform?: boolean
  // Polygon (boundingbox / path / clipping / point).
  vertexCount?: number
  closed?: boolean
  constantSpeed?: boolean
  lengths?: number[]
  end?: string
}

/** Region (textured rectangle) attachment. */
export interface RegionAttachmentData extends AttachmentData {
  type?: 'region'
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  width: number
  height: number
  color?: string
}

/** Mesh (weighted or unweighted) attachment. */
export interface MeshAttachmentData extends AttachmentData {
  type: 'mesh' | 'linkedmesh'
  uvs: number[]
  triangles: number[]
  vertices: number[]
  hull?: number
  edges?: number[]
  /** linkedmesh: source skin/mesh. */
  skin?: string
  parent?: string
  deform?: boolean
  color?: string
  width?: number
  height?: number
}

/** Polygon attachment (boundingbox / clipping / path). */
export interface VertexAttachmentData extends AttachmentData {
  type: 'boundingbox' | 'path' | 'clipping' | 'point'
  vertexCount?: number
  vertices: number[]
  closed?: boolean
  constantSpeed?: boolean
  lengths?: number[]
  color?: string
  /** clipping only. */
  end?: string
}

/** A skin maps slot -> attachmentName -> attachment. */
export interface SkinData {
  name: string
  bones?: string[]
  ik?: string[]
  transform?: string[]
  path?: string[]
  attachments: Record<string, Record<string, AttachmentData>>
}

/** Named event with setup-pose values. */
export interface EventData {
  name: string
  int?: number
  float?: number
  string?: string
  audio?: string
  volume?: number
  balance?: number
}

/** Animation timeline keyframe with optional bezier curve.
 *  - `'stepped'` for hold interpolation
 *  - a 4-element array `[cx1, cy1, cx2, cy2]` for a 1D (or X-axis) bezier
 *  - an 8-element array `[Xc1, Xc2, Xc3, Xc4, Yc1, Yc2, Yc3, Yc4]` for a 2D bezier */
export interface CurveKeyframe {
  time: number
  curve?: 'stepped' | number[]
}

/** Bone animation timelines. */
export interface BoneTimeline {
  rotate?: Array<CurveKeyframe & { angle?: number }>
  translate?: Array<CurveKeyframe & { x?: number; y?: number }>
  scale?: Array<CurveKeyframe & { x?: number; y?: number }>
  shear?: Array<CurveKeyframe & { x?: number; y?: number }>
}

/** Slot animation timelines. */
export interface SlotTimeline {
  attachment?: Array<{ time: number; name?: string }>
  color?: Array<CurveKeyframe & { color?: string }>
  twoColor?: Array<CurveKeyframe & { light?: string; dark?: string }>
}

/** Deform (mesh vertex) timeline. */
export interface DeformTimeline {
  [skin: string]: {
    [slot: string]: {
      [mesh: string]: Array<CurveKeyframe & { offset?: number; vertices?: number[] }>
    }
  }
}

/** A single animation. */
export interface AnimationData {
  bones?: Record<string, BoneTimeline>
  slots?: Record<string, SlotTimeline>
  ik?: Record<string, Array<CurveKeyframe & { mix?: number; softness?: number; bendPositive?: boolean; compress?: boolean; stretch?: boolean; uniform?: boolean }>>
  transform?: Record<string, Array<CurveKeyframe & { rotateMix?: number; translateMix?: number; scaleMix?: number; shearMix?: number }>>
  path?: Record<string, Record<string, Array<CurveKeyframe & { position?: number; spacing?: number; rotateMix?: number; translateMix?: number; mixRotate?: number; mixX?: number; mixY?: number }>>>
  deform?: DeformTimeline
  /** Sequence (animated texture frame) timelines, keyed skin → slot → attachment. */
  sequence?: Record<string, Record<string, Record<string, Array<{ time: number; mode: number; index: number; delay: number }>>>>
  events?: Array<{ time: number; name: string; int?: number; float?: number; string?: string; volume?: number; balance?: number }>
  draworder?: Array<{ time: number; offsets?: Array<{ slot: string; offset: number }> }>
}

/** Normalized skeleton data — the single IR both formats lower into. */
export interface SkeletonData {
  format: SkeletonFormat
  /** Spine version or DragonBones version string. */
  version: string
  hash?: string
  /** Spine 3.x AABB / DragonBones canvas size. */
  width?: number
  height?: number
  x?: number
  y?: number
  /** Spine images path hint. */
  images?: string
  fps?: number
  bones: BoneData[]
  slots: SlotData[]
  ik?: IkConstraintData[]
  transform?: TransformConstraintData[]
  path?: PathConstraintData[]
  skins: SkinData[]
  events?: Record<string, EventData>
  animations: Record<string, AnimationData>
}
