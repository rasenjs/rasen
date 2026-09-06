/**
 * Shared primitives for the Spine binary parsers (skeleton + animation).
 *
 * Extracted from parser-spine-binary.ts so the animation timeline parser
 * (parser-spine-binary-animation.ts) can reuse the same low-level readers
 * without coupling to the skeleton parser.
 */

import type { BoneTransformMode, BlendMode, SequenceData } from '../types'

/** Bezier curve handle data: `'stepped'`, a flat handle array, or linear. */
export type Curve = number[] | 'stepped' | undefined

// ---------------------------------------------------------------------------
// Binary format constants
// ---------------------------------------------------------------------------

export const CURVE_STEPPED = 1
export const CURVE_BEZIER = 2
export const ATTACHMENT_REGION = 0
export const ATTACHMENT_BOUNDINGBOX = 1
export const ATTACHMENT_MESH = 2
export const ATTACHMENT_LINKEDMESH = 3
export const ATTACHMENT_PATH = 4
export const ATTACHMENT_POINT = 5
export const ATTACHMENT_CLIPPING = 6
export const SLOT_ATTACHMENT = 0
export const SLOT_RGBA = 1
export const SLOT_RGB = 2
export const SLOT_RGBA2 = 3
export const SLOT_RGB2 = 4
export const SLOT_ALPHA = 5
export const BONE_ROTATE = 0
export const BONE_TRANSLATE = 1
export const BONE_TRANSLATEX = 2
export const BONE_TRANSLATEY = 3
export const BONE_SCALE = 4
export const BONE_SCALEX = 5
export const BONE_SCALEY = 6
export const BONE_SHEAR = 7
export const BONE_SHEARX = 8
export const BONE_SHEARY = 9
export const PATH_POSITION = 0
export const PATH_SPACING = 1
export const PATH_MIX = 2
export const ATTACHMENT_SEQUENCE = 1

export const TRANSFORM_MODES: BoneTransformMode[] = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection']
export const BLEND_MODES: BlendMode[] = ['normal', 'additive', 'multiply', 'screen']
export const POSITION_MODES: Array<'fixed' | 'percent'> = ['fixed', 'percent']
export const SPACING_MODES: Array<'length' | 'fixed' | 'percent'> = ['length', 'fixed', 'percent']
export const ROTATE_MODES: Array<'tangent' | 'chain' | 'chainScale'> = ['tangent', 'chain', 'chainScale']

// ---------------------------------------------------------------------------
// BinaryInput — little-endian binary reader
// ---------------------------------------------------------------------------

export class BinaryInput {
  data: DataView
  index: number
  strings: string[]

  constructor(bytes: Uint8Array, strings: string[] = [], index = 0) {
    const copy = bytes.slice(index)
    this.data = new DataView(copy.buffer, copy.byteOffset, copy.byteLength)
    this.index = 0
    this.strings = strings
  }

  readByte(): number {
    return this.data.getInt8(this.index++)
  }

  readUnsignedByte(): number {
    return this.data.getUint8(this.index++)
  }

  readShort(): number {
    const v = this.data.getInt16(this.index, false)
    this.index += 2
    return v
  }

  readInt32(): number {
    const v = this.data.getInt32(this.index, false)
    this.index += 4
    return v
  }

  /** Variable-length int (Spine's `readInt`). */
  readInt(optimizePositive: boolean): number {
    let b = this.readByte()
    let result = b & 127
    if ((b & 128) !== 0) {
      b = this.readByte()
      result |= (b & 127) << 7
      if ((b & 128) !== 0) {
        b = this.readByte()
        result |= (b & 127) << 14
        if ((b & 128) !== 0) {
          b = this.readByte()
          result |= (b & 127) << 21
          if ((b & 128) !== 0) {
            b = this.readByte()
            result |= (b & 127) << 28
          }
        }
      }
    }
    return optimizePositive ? result : (result >>> 1) ^ -(result & 1)
  }

  /** String reference into the string table; 0 means null. */
  readStringRef(): string | null {
    const i = this.readInt(true)
    return i === 0 ? null : this.strings[i - 1]
  }

  /** Install the decoded string table (called after the header). */
  setStrings(strings: string[]): void {
    this.strings = strings
  }

  /** Length-prefixed UTF-8 string (varint length). */
  readString(): string | null {
    const byteCount = this.readInt(true)
    if (byteCount === 0) return null
    if (byteCount === 1) return ''
    const len = byteCount - 1
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = this.readUnsignedByte()
    return new TextDecoder().decode(bytes)
  }

  readFloat(): number {
    const v = this.data.getFloat32(this.index, false)
    this.index += 4
    return v
  }

  readBoolean(): boolean {
    return this.readByte() !== 0
  }
}

// ---------------------------------------------------------------------------
// Value readers
// ---------------------------------------------------------------------------

export function readCurve1D(input: BinaryInput): Curve {
  const type = input.readByte()
  if (type === 0) return undefined // linear
  if (type === CURVE_STEPPED) return 'stepped'
  // Bezier
  const cx1 = input.readFloat()
  const cy1 = input.readFloat()
  const cx2 = input.readFloat()
  const cy2 = input.readFloat()
  return [cx1, cy1, cx2, cy2]
}

export function readCurve2D(input: BinaryInput): Curve {
  const type = input.readByte()
  if (type === 0) return undefined
  if (type === CURVE_STEPPED) return 'stepped'
  const cx1 = input.readFloat()
  const cy1 = input.readFloat()
  const cx2 = input.readFloat()
  const cy2 = input.readFloat()
  const cx3 = input.readFloat()
  const cy3 = input.readFloat()
  const cx4 = input.readFloat()
  const cy4 = input.readFloat()
  return [cx1, cy1, cx2, cy2, cx3, cy3, cx4, cy4]
}

export function readCurveN(input: BinaryInput, channels: number): Curve {
  const type = input.readByte()
  if (type === 0) return undefined
  if (type === CURVE_STEPPED) return 'stepped'
  const values: number[] = []
  for (let i = 0; i < channels * 4; i++) values.push(input.readFloat())
  return values
}

export function readFloatArray(input: BinaryInput, n: number, scale: number): number[] {
  const arr: number[] = []
  for (let i = 0; i < n; i++) arr.push(input.readFloat() * scale)
  return arr
}

export function readShortArray(input: BinaryInput): number[] {
  const n = input.readInt(true)
  const arr: number[] = []
  for (let i = 0; i < n; i++) arr.push(input.readShort())
  return arr
}

export function rgbaToHex(rgba: number): string {
  return (rgba >>> 0).toString(16).padStart(8, '0').toUpperCase()
}

export function isAtLeast41(version: string): boolean {
  const m = /^(\d+)\.(\d+)/.exec(version)
  if (!m) return true
  const major = parseInt(m[1], 10)
  const minor = parseInt(m[2], 10)
  return major > 4 || (major === 4 && minor >= 1)
}

export type { SequenceData }
