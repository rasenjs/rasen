/**
 * Granny3D GR2 reader — Resurrected's 3D containers.
 *
 * `.model`, `.skeleton` and `.animations` files in `hd/` are RAD Granny3D GR2
 * files (64-bit little-endian, file format 7). This module decodes the
 * container, decompresses its sections with `decodeBitknit2`, applies the
 * pointer fixups, and materializes the self-describing object tree into typed
 * meshes, skeletons, materials and textures — everything the renderer needs.
 *
 * ## What is measured versus cited
 *
 * - **Measured** (over the real files in `.scratch/gr2` and
 *   `.scratch/model-probe`, reproduced by `tools/verify-gr2.ts`): the packed,
 *   unaligned member layout (a `u32` count is followed by the 8-byte pointer
 *   at +4), the 44-byte type-record stride, the
 *   `(typePtr:u64, count:u32, dataPtr:u64)` order of a variant array, and the
 *   position dequantization `i16 / 32767 * VertexScale` — verified because
 *   the decoded extremes reproduce the `bbMin`/`bbMax` the file itself stores
 *   (for `diablo/torso.model` all six values match to 1e-4). One exporter
 *   quirk, named rather than smoothed over: `bbMax` is stored clamped to zero
 *   (`max(decodedMax, 0)`); 17 of 156 box components across the samples are
 *   clamped and none disagrees with the rule.
 * - **Cited**: the field names and member semantics follow the MIT
 *   `CucFlavius/Zee-010-Templates` `DiabloIIResurrected/Model/*.bt` and
 *   `ModelExtracted/*.bt` templates, `Stitchuuuu/granny-ro-js`'s
 *   `docs/gr2-format.md` (MIT) member-type table, and the MIT `d2r-mobile`
 *   project (`Copyright (c) 2026 jhaizhou`), whose readers were the reference
 *   this module was written against.
 *
 * ## What this module deliberately does not do
 *
 * - **Animations**: `TrackGroups` / `Animations` are located and counted but
 *   their curves (12 quantized curve codecs) are not decoded here.
 * - **Mixed-marshalling tables**: parsed and reported (`mixedMarshalling`),
 *   never applied — they describe cross-endian inline flips and D2R is
 *   all little-endian.
 * - **Morph targets and vertex annotations**: reported as counts, not read.
 * - The `Images` member of a texture object stays raw: the pixels live in the
 *   external `.texture` files named by `FromFileName` (see `texture.ts`), and
 *   the embedded pointers are writer-side values that were never meant to be
 *   followed (they are not in the fixup tables).
 */

import { decodeBitknit2, isBitknit2 } from './bitknit2'

export const GR2_MAGIC = '5e499be5141f636fa9eb131ec4edbe90'

/**
 * True when the bytes start with the GR2 magic quad. Fetchers check this
 * before decoding: a dev server's SPA fallback answers a MISSING asset with
 * `200 text/html` and the page's own markup, so "the request succeeded" is
 * not evidence of a game file.
 */
export function isGr2(bytes: Uint8Array): boolean {
  return bytes.length >= 16 && magicHex(bytes) === GR2_MAGIC
}

/** Section slots in the order the section array stores them. */
export const GR2_SECTION_SLOTS = [
  'main',
  'rigid_vertex',
  'rigid_index',
  'deformable_vertex',
  'deformable_index',
  'texture',
  'discardable',
  'unloaded',
] as const
export type Gr2SectionSlot = (typeof GR2_SECTION_SLOTS)[number]

/** `compression` values seen in the section records. */
export const GR2_COMPRESSION_NONE = 0
export const GR2_COMPRESSION_BITKNIT2 = 4

export interface Gr2Section {
  slot: Gr2SectionSlot
  compression: number
  dataOffset: number
  dataSize: number
  expandedSize: number
  alignment: number
  first16bit: number
  first8bit: number
  fixupOffset: number
  fixupCount: number
  mixedMarshallingOffset: number
  mixedMarshallingCount: number
}

export interface Gr2Header {
  headerSize: number
  version: number
  totalSize: number
  crc: number
  sectionCount: number
  rootType: { section: number; offset: number }
  rootObject: { section: number; offset: number }
  typeTag: number
}

export interface GrannyTransform {
  flags: number
  hasPosition: boolean
  hasOrientation: boolean
  hasScaleShear: boolean
  position: [number, number, number]
  /** Quaternion in x, y, z, w order, as Granny stores it. */
  orientation: [number, number, number, number]
  /** Row-major 3x3 scale-shear. */
  scaleShear: number[]
}

export interface Gr2Bone {
  name: string
  parentIndex: number
  localTransform: GrannyTransform
  /** Row-major 4x4 inverse world matrix (16 floats). */
  inverseWorld: Float32Array
  lodError: number
}

export interface Gr2Skeleton {
  name: string
  lodType: number
  bones: Gr2Bone[]
}

export interface Gr2Texture {
  fromFileName: string
  textureType: number
  width: number
  height: number
  encoding: number
  subFormat: number
}

export interface Gr2MaterialMap {
  usage: string
  material: number | null
}

export interface Gr2Material {
  name: string
  /** Path of the `.texture` the material samples, when it names one. */
  textureFile: string | null
  maps: Gr2MaterialMap[]
}

export interface Gr2BoneBinding {
  boneName: string
  obbMin: [number, number, number]
  obbMax: [number, number, number]
}

export interface Gr2TriangleGroup {
  materialIndex: number
  triFirst: number
  triCount: number
}

export interface Gr2Mesh {
  name: string
  /** Dequantized positions, 3 per vertex (mesh space, already scaled). */
  positions: Float32Array
  /** Unit normals, 3 per vertex. */
  normals: Float32Array | null
  /** Tangents, 4 per vertex (xyz + handedness in w). */
  tangents: Float32Array | null
  /** Texture coordinates, 2 per vertex. */
  uvs: Float32Array | null
  /** Skin weights, 4 per vertex (raw `u8 / 255`, not renormalized). */
  boneWeights: Float32Array | null
  /** Skin bone indices, 4 per vertex. */
  boneIndices: Uint8Array | null
  vertexCount: number
  /** Triangle list; 16-bit when the file stored `Indices16`, else 32-bit. */
  indices: Uint16Array | Uint32Array
  groups: Gr2TriangleGroup[]
  materialBindings: number[]
  boneBindings: Gr2BoneBinding[]
  bbMin: [number, number, number] | null
  bbMax: [number, number, number] | null
  /** The position dequantization scale stated by the file. */
  vertexScale: number
  renderLayer: number
}

export interface Gr2Model {
  name: string
  skeleton: number | null
  initialPlacement: GrannyTransform
  meshBindings: number[]
}

export interface Gr2File {
  header: Gr2Header
  sections: Gr2Section[]
  /** Per-section decompressed sizes, in section order. */
  expandedSizes: number[]
  /** `(to, section, from)` pointer fixups applied, per section index. */
  fixupsApplied: number[]
  /** Mixed-marshalling record counts, per section index (never applied). */
  mixedMarshalling: number[]
  fromFileName: string
  textures: Gr2Texture[]
  materials: Gr2Material[]
  skeletons: Gr2Skeleton[]
  meshes: Gr2Mesh[]
  models: Gr2Model[]
  /** Top-level counts for what this module does not decode. */
  trackGroupCount: number
  animationCount: number
}

// ---------------------------------------------------------------------------
// Primitive decoding
// ---------------------------------------------------------------------------

function halfToFloat(bits: number): number {
  const sign = (bits & 0x8000) !== 0 ? -1 : 1
  const exp = (bits >> 10) & 0x1f
  const frac = bits & 0x3ff
  if (exp === 0) return sign * frac * 2 ** -24
  if (exp === 31) return frac === 0 ? sign * Infinity : NaN
  return sign * (1 + frac / 1024) * 2 ** (exp - 15)
}

const MEMBER_TYPE_NAMES = [
  'end',
  'inline',
  'reference',
  'reference_to_array',
  'array_of_references',
  'variant_reference',
  'unsupported',
  'reference_to_variant_array',
  'string',
  'transform',
  'real32',
  'int8',
  'uint8',
  'binormal_int8',
  'normal_uint8',
  'int16',
  'uint16',
  'binormal_int16',
  'normal_uint16',
  'int32',
  'uint32',
  'real16',
  'empty_reference',
] as const

// Exported below for `gr2-anim.ts`, which walks the same object tree to
// decode animation curves. Exports are additive only — no behavior changes.
export interface TypeMember {
  type: number
  name: string
  /** Merged-buffer offset of the referenced type chain (0 when absent). */
  reference: number
  arrayWidth: number
}

/** A materialized object: member name to value, in declaration order. */
export type Gr2Object = { [member: string]: unknown }

export class Gr2Reader {
  readonly view: DataView
  readonly bytes: Uint8Array

  constructor(readonly merged: Uint8Array) {
    this.bytes = merged
    this.view = new DataView(merged.buffer, merged.byteOffset, merged.byteLength)
  }

  u32(at: number): number {
    return this.view.getUint32(at, true)
  }

  i32(at: number): number {
    return this.view.getInt32(at, true)
  }

  u64(at: number): number {
    return Number(this.view.getBigUint64(at, true))
  }

  f32(at: number): number {
    return this.view.getFloat32(at, true)
  }

  cstring(at: number): string {
    if (at <= 0 || at >= this.bytes.length) return ''
    let end = at
    while (end < this.bytes.length && this.bytes[end] !== 0) end += 1
    let out = ''
    for (let i = at; i < end; i += 1) out += String.fromCharCode(this.bytes[i])
    return out
  }

  /** Type records are 44 bytes each and stop at the `end` sentinel. */
  typeChain(at: number): TypeMember[] {
    const members: TypeMember[] = []
    for (let i = 0; i < 512; i += 1) {
      const at2 = at + i * 44
      const type = this.u32(at2)
      if (type === 0) break
      members.push({
        type,
        name: this.cstring(this.u64(at2 + 4)),
        reference: this.u64(at2 + 12),
        arrayWidth: this.i32(at2 + 20),
      })
    }
    return members
  }

  memberSize(member: TypeMember): number {
    const width = member.arrayWidth > 0 ? member.arrayWidth : 1
    switch (member.type) {
      case 1:
        return this.typeSize(member.reference) * width
      case 2:
      case 8:
      case 22:
        return 8 * width
      case 3:
      case 4:
        return 12 * width
      case 5:
        return 16 * width
      case 7:
        return 20 * width
      case 9:
        return 68 * width
      case 10:
      case 19:
      case 20:
        return 4 * width
      case 11:
      case 12:
      case 13:
      case 14:
        return 1 * width
      case 15:
      case 16:
      case 17:
      case 18:
      case 21:
        return 2 * width
      default:
        throw new Error(`gr2: unknown member type ${member.type} (${MEMBER_TYPE_NAMES[member.type] ?? '?'})`)
    }
  }

  typeSize(at: number): number {
    if (!at) return 0
    let size = 0
    for (const member of this.typeChain(at)) size += this.memberSize(member)
    return size
  }

  transform(at: number): GrannyTransform {
    const flags = this.u32(at)
    const position: [number, number, number] = [this.f32(at + 4), this.f32(at + 8), this.f32(at + 12)]
    const orientation: [number, number, number, number] = [
      this.f32(at + 16),
      this.f32(at + 20),
      this.f32(at + 24),
      this.f32(at + 28),
    ]
    const scaleShear: number[] = []
    for (let i = 0; i < 9; i += 1) scaleShear.push(this.f32(at + 32 + i * 4))
    // A clear flag means identity regardless of the stored bytes.
    return {
      flags,
      hasPosition: (flags & 1) !== 0,
      hasOrientation: (flags & 2) !== 0,
      hasScaleShear: (flags & 4) !== 0,
      position: (flags & 1) !== 0 ? position : [0, 0, 0],
      orientation: (flags & 2) !== 0 ? orientation : [0, 0, 0, 1],
      scaleShear: (flags & 4) !== 0 ? scaleShear : [1, 0, 0, 0, 1, 0, 0, 0, 1],
    }
  }

  scalar(member: TypeMember, at: number): number {
    switch (member.type) {
      case 10:
        return this.f32(at)
      case 11:
        return this.view.getInt8(at)
      case 12:
        return this.bytes[at]
      case 13:
        return this.view.getInt8(at) / 127
      case 14:
        return this.bytes[at] / 255
      case 15:
        return this.view.getInt16(at, true)
      case 16:
        return this.view.getUint16(at, true)
      case 17:
        return this.view.getInt16(at, true) / 32767
      case 18:
        return this.bytes[at] / 255
      case 19:
        return this.i32(at)
      case 20:
        return this.u32(at)
      case 21:
        return halfToFloat(this.view.getUint16(at, true))
      default:
        throw new Error(`gr2: not a scalar member type ${member.type}`)
    }
  }

  /**
   * Materialize one object. Arrays of references become arrays of materialized
   * objects; `reference_to_array` of a scalar type becomes a typed array view;
   * variant references become `{ type, object }` with the object materialized
   * against the variant's own type chain.
   */
  object(at: number, chain: TypeMember[], depth = 0): Gr2Object {
    const out: Gr2Object = {}
    let cursor = at
    for (const member of chain) {
      const width = member.arrayWidth > 0 ? member.arrayWidth : 1
      const values: unknown[] = []
      const stride = this.memberSize(member) / width
      for (let k = 0; k < width; k += 1) {
        values.push(this.value(member, cursor + k * stride, depth))
      }
      out[member.name] = width > 1 ? values : values[0]
      cursor += this.memberSize(member)
    }
    return out
  }

  private value(member: TypeMember, at: number, depth: number): unknown {
    switch (member.type) {
      case 1:
        return depth > 24 ? null : this.object(at, this.typeChain(member.reference), depth + 1)
      case 2:
      case 22: {
        const target = this.u64(at)
        if (!target || depth > 24) return null
        return this.object(target, this.typeChain(member.reference), depth + 1)
      }
      case 8: {
        const target = this.u64(at)
        return target ? this.cstring(target) : ''
      }
      case 3:
      case 4: {
        const count = this.u32(at)
        const target = this.u64(at + 4)
        const items: unknown[] = []
        if (target && depth <= 24) {
          const elementSize = member.type === 3 ? this.typeSize(member.reference) : 8
          for (let i = 0; i < count; i += 1) {
            const elementAt = target + i * elementSize
            if (member.type === 3) {
              items.push(this.object(elementAt, this.typeChain(member.reference), depth + 1))
            } else {
              const objectAt = this.u64(elementAt)
              items.push(objectAt ? this.object(objectAt, this.typeChain(member.reference), depth + 1) : null)
            }
          }
        }
        return { count, offset: target, items }
      }
      case 5: {
        const typeAt = this.u64(at)
        const objectAt = this.u64(at + 8)
        return {
          type: typeAt,
          object: objectAt && typeAt && depth <= 24 ? this.object(objectAt, this.typeChain(typeAt), depth + 1) : null,
        }
      }
      case 7: {
        // (typePtr, count, dataPtr) — the type chain describes one element.
        const typeAt = this.u64(at)
        const count = this.u32(at + 8)
        const dataAt = this.u64(at + 12)
        return { type: typeAt, count, offset: dataAt }
      }
      case 9:
        return this.transform(at)
      default:
        return this.scalar(member, at)
    }
  }
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

function magicHex(bytes: Uint8Array): string {
  // The magic is four little-endian u32s; format them as the u32 values.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let out = ''
  for (let i = 0; i < 4; i += 1) out += view.getUint32(i * 4, true).toString(16).padStart(8, '0')
  return out
}

export interface Container {
  header: Gr2Header
  sections: Gr2Section[]
  merged: Uint8Array
  sectionStart: number[]
  fixupsApplied: number[]
  mixedMarshalling: number[]
}

export function readContainer(bytes: Uint8Array): Container {
  if (bytes.length < 456) throw new Error('gr2: file shorter than the header')
  if (magicHex(bytes) !== GR2_MAGIC) throw new Error('gr2: not a 64-bit LE format-7 Granny file')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u32 = (at: number): number => view.getUint32(at, true)
  const header: Gr2Header = {
    headerSize: u32(0x10),
    version: view.getInt32(0x20, true),
    totalSize: u32(0x24),
    crc: u32(0x28),
    sectionCount: u32(0x30),
    rootType: { section: u32(0x34), offset: u32(0x38) },
    rootObject: { section: u32(0x3c), offset: u32(0x40) },
    typeTag: u32(0x44),
  }
  if (header.totalSize !== bytes.length) {
    throw new Error(`gr2: header says ${header.totalSize} bytes, file has ${bytes.length}`)
  }
  const arrayOffset = 0x20 + u32(0x2c)
  const sections: Gr2Section[] = []
  for (let i = 0; i < header.sectionCount; i += 1) {
    const at = arrayOffset + i * 44
    const w = (j: number): number => u32(at + j * 4)
    sections.push({
      slot: GR2_SECTION_SLOTS[i] ?? `section_${i}`,
      compression: w(0),
      dataOffset: w(1),
      dataSize: w(2),
      expandedSize: w(3),
      alignment: w(4),
      first16bit: w(5),
      first8bit: w(6),
      fixupOffset: w(7),
      fixupCount: w(8),
      mixedMarshallingOffset: w(9),
      mixedMarshallingCount: w(10),
    })
  }

  const decoded: Uint8Array[] = []
  const sectionStart: number[] = []
  let cursor = 0
  for (const section of sections) {
    sectionStart.push(cursor)
    const payload = bytes.subarray(section.dataOffset, section.dataOffset + section.dataSize)
    let expanded: Uint8Array
    if (section.dataSize === 0) {
      expanded = new Uint8Array(0)
    } else if (section.compression === GR2_COMPRESSION_NONE) {
      expanded = payload.slice()
    } else if (section.compression === GR2_COMPRESSION_BITKNIT2 && isBitknit2(payload)) {
      expanded = decodeBitknit2(payload, section.expandedSize)
    } else {
      throw new Error(`gr2: section ${section.slot} has unsupported compression ${section.compression}`)
    }
    if (expanded.length !== section.expandedSize) {
      throw new Error(`gr2: section ${section.slot} decoded to ${expanded.length}, header says ${section.expandedSize}`)
    }
    decoded.push(expanded)
    cursor += expanded.length
  }
  const merged = new Uint8Array(cursor)
  for (let i = 0; i < decoded.length; i += 1) merged.set(decoded[i], sectionStart[i])

  // Pointer fixups: 12-byte (to, section, from) triples; `to` is relative to
  // the owning section, the value written is `from` relative to the target
  // section's start in the merged buffer. Tables are framed as
  // [u32 compressedSize][BitKnit2 payload] unless stored raw.
  const mergedView = new DataView(merged.buffer)
  const fixupsApplied: number[] = []
  const mixedMarshalling: number[] = []
  for (let si = 0; si < sections.length; si += 1) {
    const section = sections[si]
    mixedMarshalling.push(section.mixedMarshallingCount)
    let applied = 0
    if (section.fixupCount > 0) {
      const framed = bytes[section.fixupOffset + 4] === 0xb1 && bytes[section.fixupOffset + 5] === 0x75
      let table: Uint8Array
      if (framed) {
        const compressedSize = u32(section.fixupOffset)
        table = decodeBitknit2(
          bytes.subarray(section.fixupOffset + 4, section.fixupOffset + 4 + compressedSize),
          section.fixupCount * 12,
        )
      } else {
        table = bytes.subarray(section.fixupOffset, section.fixupOffset + section.fixupCount * 12)
      }
      const tableView = new DataView(table.buffer, table.byteOffset, table.byteLength)
      for (let i = 0; i < section.fixupCount; i += 1) {
        const to = tableView.getUint32(i * 12, true)
        const targetSection = tableView.getInt32(i * 12 + 4, true)
        const from = tableView.getUint32(i * 12 + 8, true)
        const at = sectionStart[si] + to
        const target = sectionStart[targetSection] + from
        if (at + 8 > merged.length || target < 0 || target > merged.length) {
          throw new Error(`gr2: fixup ${i} of section ${section.slot} points outside the file`)
        }
        mergedView.setBigUint64(at, BigInt(target), true)
        applied += 1
      }
    }
    fixupsApplied.push(applied)
  }

  return { header, sections, merged, sectionStart, fixupsApplied, mixedMarshalling }
}

// ---------------------------------------------------------------------------
// Typed extraction
// ---------------------------------------------------------------------------

export interface RawArray {
  count: number
  offset: number
  items: unknown[]
}

export function asArray(value: unknown): RawArray {
  const raw = value as Partial<RawArray>
  return { count: raw.count ?? 0, offset: raw.offset ?? 0, items: raw.items ?? [] }
}

export function asObject(value: unknown): Gr2Object {
  return (value ?? {}) as Gr2Object
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

export function asVec3(value: unknown): [number, number, number] {
  const list = value as number[] | undefined
  return [list?.[0] ?? 0, list?.[1] ?? 0, list?.[2] ?? 0]
}

function readSkeletons(root: Gr2Object): Gr2Skeleton[] {
  const out: Gr2Skeleton[] = []
  for (const entry of asArray(root['Skeletons']).items) {
    const skeleton = asObject(entry)
    const bones: Gr2Bone[] = []
    for (const boneEntry of asArray(skeleton['Bones']).items) {
      const bone = asObject(boneEntry)
      // The real D2R skeletons name the members `Transform` and
      // `InverseWorldTransform`; `LocalTransform` / `InverseWorld4x4` are the
      // template's alternate spellings, accepted as fallbacks. (Measured on
      // `.scratch/gr2/{diablo,amazon}/skeleton/*.skeleton`: every bone object
      // has exactly `Name, ParentIndex, Transform, InverseWorldTransform,
      // LODError, ExtendedData`.)
      const matrix = (bone['InverseWorldTransform'] ?? bone['InverseWorld4x4']) as number[] | undefined
      bones.push({
        name: asString(bone['Name']),
        parentIndex: asNumber(bone['ParentIndex']),
        localTransform: ((bone['Transform'] ?? bone['LocalTransform']) as GrannyTransform | undefined) ?? {
          flags: 0,
          hasPosition: false,
          hasOrientation: false,
          hasScaleShear: false,
          position: [0, 0, 0],
          orientation: [0, 0, 0, 1],
          scaleShear: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        },
        inverseWorld: Float32Array.from(matrix ?? []),
        lodError: asNumber(bone['LODError']),
      })
    }
    out.push({ name: asString(skeleton['Name']), lodType: asNumber(skeleton['LODType']), bones })
  }
  return out
}

function readTextures(root: Gr2Object): Gr2Texture[] {
  const out: Gr2Texture[] = []
  for (const entry of asArray(root['Textures']).items) {
    const texture = asObject(entry)
    out.push({
      fromFileName: asString(texture['FromFileName']),
      textureType: asNumber(texture['TextureType']),
      width: asNumber(texture['Width']),
      height: asNumber(texture['Height']),
      encoding: asNumber(texture['Encoding']),
      subFormat: asNumber(texture['SubFormat']),
    })
  }
  return out
}

function readMaterials(root: Gr2Object): Gr2Material[] {
  const out: Gr2Material[] = []
  for (const entry of asArray(root['Materials']).items) {
    const material = asObject(entry)
    const maps: Gr2MaterialMap[] = []
    for (const mapEntry of asArray(material['Maps']).items) {
      const map = asObject(mapEntry)
      const bound = map['Material']
      maps.push({ usage: asString(map['Usage']), material: typeof bound === 'number' ? bound : null })
    }
    const texture = material['Texture']
    let textureFile: string | null = null
    if (texture && typeof texture === 'object') {
      const file = asString(asObject(texture)['FromFileName'])
      textureFile = file === '' ? null : file
    }
    out.push({ name: asString(material['Name']), textureFile, maps })
  }
  return out
}

function readMeshes(reader: Gr2Reader, root: Gr2Object, materials: Gr2Material[]): Gr2Mesh[] {
  const out: Gr2Mesh[] = []
  for (const entry of asArray(root['Meshes']).items) {
    const mesh = asObject(entry)
    const extended = asObject(asObject(mesh['ExtendedData'])['object'])
    const vertexScale = asNumber(extended['VertexScale']) || 1

    // Vertex arrays are variant arrays: the type chain describes one vertex.
    const vertexData = asObject(mesh['PrimaryVertexData'])
    const vertices = asObject(vertexData['Vertices']) as unknown as {
      type: number
      count: number
      offset: number
    }
    const chain = reader.typeChain(vertices.type)
    const stride = chain.reduce((sum, member) => sum + reader.memberSize(member), 0)

    const positions = new Float32Array(vertices.count * 3)
    const normals = new Float32Array(vertices.count * 3)
    const tangents = new Float32Array(vertices.count * 4)
    const uvs = new Float32Array(vertices.count * 2)
    const boneWeights = new Float32Array(vertices.count * 4)
    const boneIndices = new Uint8Array(vertices.count * 4)
    let hasNormals = false
    let hasTangents = false
    let hasUvs = false
    let hasWeights = false

    for (let v = 0; v < vertices.count; v += 1) {
      let cursor = vertices.offset + v * stride
      for (const member of chain) {
        const width = member.arrayWidth > 0 ? member.arrayWidth : 1
        const elementSize = reader.memberSize(member) / width
        const values: number[] = []
        for (let k = 0; k < width; k += 1) values.push(reader.scalar(member, cursor + k * elementSize))
        switch (member.name) {
          case 'Position':
            // Measured: binormal int16 scaled by the file's own VertexScale.
            positions[v * 3] = values[0] * vertexScale
            positions[v * 3 + 1] = values[1] * vertexScale
            positions[v * 3 + 2] = values[2] * vertexScale
            break
          case 'Normal':
            normals[v * 3] = values[0]
            normals[v * 3 + 1] = values[1]
            normals[v * 3 + 2] = values[2]
            hasNormals = true
            break
          case 'Tangent':
            tangents[v * 4] = values[0]
            tangents[v * 4 + 1] = values[1]
            tangents[v * 4 + 2] = values[2]
            tangents[v * 4 + 3] = values[3] ?? 1
            hasTangents = true
            break
          case 'TextureCoordinates0':
            uvs[v * 2] = values[0]
            uvs[v * 2 + 1] = values[1]
            hasUvs = true
            break
          case 'BoneWeights':
            boneWeights[v * 4] = values[0]
            boneWeights[v * 4 + 1] = values[1]
            boneWeights[v * 4 + 2] = values[2]
            boneWeights[v * 4 + 3] = values[3]
            hasWeights = true
            break
          case 'BoneIndices':
            boneIndices[v * 4] = values[0]
            boneIndices[v * 4 + 1] = values[1]
            boneIndices[v * 4 + 2] = values[2]
            boneIndices[v * 4 + 3] = values[3]
            break
          default:
            break
        }
        cursor += reader.memberSize(member)
      }
    }

    // Topology: groups plus whichever index array the file filled.
    const topology = asObject(mesh['PrimaryTopology'])
    const indices32 = asObject(topology['Indices']) as unknown as { count: number; offset: number }
    const indices16 = asObject(topology['Indices16']) as unknown as { count: number; offset: number }
    const use16 = indices16.count > 0
    const indexCount = use16 ? indices16.count : indices32.count
    const indexOffset = use16 ? indices16.offset : indices32.offset
    const indexView = new DataView(reader.merged.buffer, reader.merged.byteOffset + indexOffset, indexCount * (use16 ? 2 : 4))
    const indices = use16 ? new Uint16Array(indexCount) : new Uint32Array(indexCount)
    for (let i = 0; i < indexCount; i += 1) {
      indices[i] = use16 ? indexView.getUint16(i * 2, true) : indexView.getUint32(i * 4, true)
    }

    const groups: Gr2TriangleGroup[] = []
    for (const groupEntry of asArray(topology['Groups']).items) {
      const group = asObject(groupEntry)
      groups.push({
        materialIndex: asNumber(group['MaterialIndex']),
        triFirst: asNumber(group['TriFirst']),
        triCount: asNumber(group['TriCount']),
      })
    }

    const materialBindings = asArray(mesh['MaterialBindings']).items.map((entry) => {
      const binding = asObject(entry)
      const bound = binding['Material']
      if (bound && typeof bound === 'object') {
        const name = asString(asObject(bound)['Name'])
        const index = materials.findIndex((material) => material.name === name)
        return index
      }
      return -1
    })

    const boneBindings = asArray(mesh['BoneBindings']).items.map((entry) => {
      const binding = asObject(entry)
      return {
        boneName: asString(binding['BoneName']),
        obbMin: asVec3(binding['OBBMin']),
        obbMax: asVec3(binding['OBBMax']),
      }
    })

    out.push({
      name: asString(mesh['Name']),
      positions,
      normals: hasNormals ? normals : null,
      tangents: hasTangents ? tangents : null,
      uvs: hasUvs ? uvs : null,
      boneWeights: hasWeights ? boneWeights : null,
      boneIndices: hasWeights ? boneIndices : null,
      vertexCount: vertices.count,
      indices,
      groups,
      materialBindings,
      boneBindings,
      bbMin: extended['bbMin'] ? asVec3(extended['bbMin']) : null,
      bbMax: extended['bbMax'] ? asVec3(extended['bbMax']) : null,
      vertexScale,
      renderLayer: asNumber(extended['meshRenderLayer']),
    })
  }
  return out
}

function readModels(root: Gr2Object): Gr2Model[] {
  const out: Gr2Model[] = []
  for (const entry of asArray(root['Models']).items) {
    const model = asObject(entry)
    out.push({
      name: asString(model['Name']),
      skeleton: typeof model['Skeleton'] === 'object' && model['Skeleton'] !== null ? 0 : null,
      initialPlacement: (model['InitialPlacement'] as GrannyTransform | undefined) ?? {
        flags: 0,
        hasPosition: false,
        hasOrientation: false,
        hasScaleShear: false,
        position: [0, 0, 0],
        orientation: [0, 0, 0, 1],
        scaleShear: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      },
      meshBindings: asArray(model['MeshBindings']).count > 0 ? [...Array(asArray(model['MeshBindings']).count).keys()] : [],
    })
  }
  return out
}

/**
 * Decode one Granny GR2 file into typed meshes, skeletons and materials.
 *
 * Throws a descriptive `Error` on a malformed container, an unsupported
 * section encoding, or a fixup that points outside the decoded data.
 */
export function loadGr2(bytes: Uint8Array): Gr2File {
  const container = readContainer(bytes)
  const reader = new Gr2Reader(container.merged)
  const rootAt = container.sectionStart[container.header.rootObject.section] + container.header.rootObject.offset
  const typeAt = container.sectionStart[container.header.rootType.section] + container.header.rootType.offset
  const root = reader.object(rootAt, reader.typeChain(typeAt))

  const textures = readTextures(root)
  const materials = readMaterials(root)
  const skeletons = readSkeletons(root)
  const meshes = readMeshes(reader, root, materials)
  const models = readModels(root)

  return {
    header: container.header,
    sections: container.sections,
    expandedSizes: container.sections.map((section) => section.expandedSize),
    fixupsApplied: container.fixupsApplied,
    mixedMarshalling: container.mixedMarshalling,
    fromFileName: asString(root['FromFileName']),
    textures,
    materials,
    skeletons,
    meshes,
    models,
    trackGroupCount: asArray(root['TrackGroups']).count,
    animationCount: asArray(root['Animations']).count,
  }
}
