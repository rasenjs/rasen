/**
 * Granny3D animation tracks — curve decoding for `.animations` GR2 files.
 *
 * `gr2.ts` decodes the container and materializes meshes and skeletons; this
 * module walks the same self-describing object tree (via `gr2.ts`'s exported
 * `Gr2Reader` / `readContainer` primitives) to decode the `Animations` /
 * `TrackGroups` root members into playable curves: one `Gr2Curve` per
 * orientation / position / scale-shear / vector track, each with a
 * `evaluate(t)` sampler.
 *
 * ## What is measured versus cited
 *
 * - **Measured** (over `.scratch/gr2/diablo/animation/combined.animations`
 *   and `.scratch/gr2/amazon/animation/combined.animations`, reproduced by
 *   `tools/verify-gr2-anim.ts`): the member names and layouts of the real
 *   object tree (`Animation`, `TrackGroup`, `TransformTrack`, `VectorTrack`
 *   with its `ValueCurve` member), the curve variant naming (`CurveDataHeader_*`
 *   type names as codec names, `Format`/`Degree` bytes in the leading inline
 *   header struct), the per-codec payload layouts below, and that every
 *   curve in both files decodes with finite values and unit quaternions.
 * - **Cited** (decode math): the MIT `Norbyte/lslib` curve-data classes and
 *   the RAD `granny_curve.h` structure comments (field semantics only — this
 *   is an independent implementation): `OneOverKnotScaleTrunc` is the top 16
 *   bits of an IEEE float; `ControlScaleOffsets` is [scales..., offsets...]
 *   with dimension = count/2; `KnotsControls` is [knots..., controls...] with
 *   `KnotCount + Dimension * KnotCount` (or `KnotCount + KnotCount` for the
 *   `I1`/`I3`-style single-parameter families) entries; the `D4n` families
 *   store three components per knot with the three spare high bits encoding
 *   the discarded component's index and sign (recovered via the unit-norm
 *   constraint), and four nibble-selected scale/offset pairs from a 16-entry
 *   table (the table itself is cited from MIT `Rasetsuu/blendergranny`, which
 *   recovered it from `granny2.dll`).
 * - **Cited** (evaluation): curves are piecewise polynomials of the header's
 *   `Degree` over the knot spans. The B-spline basis evaluation used here
 *   (de Boor over the knot vector, with knot `i` paired with control `i`, so
 *   a degree-1 curve interpolates its controls and both ends are hit exactly)
 *   follows MIT `Rasetsuu/blendergranny` / `Stitchuuuu/granny-ro-js`. Named
 *   disagreement: MIT `Norbyte/lslib` and several viewers instead treat every
 *   (knot, control) pair as a keyframe and lerp/slerp between them — identical
 *   to this module for degree-1 curves but not for the degree-2 curves D2R
 *   actually ships. `t` is in **seconds**, clamped to `[knots[0], knots[last]]`.
 *
 * ## Codecs implemented
 *
 * All 18 curve codecs seen in the format (the type name after
 * `CurveDataHeader_` is the codec): `DaIdentity`, `D3Constant32f`,
 * `D4Constant32f`, `DaConstant32f`, `DaK32fC32f`, `DaK16uC16u`, `DaK8uC8u`,
 * `D3K16uC16u`, `D3K8uC8u`, `D3I1K16uC16u`, `D3I1K8uC8u`, `D3I1K32fC32f`,
 * `D4nK16uC15u`, `D4nK8uC7u`, `D9I1K16uC16u`, `D9I1K8uC8u`, `D9I3K16uC16u`,
 * `D9I3K8uC8u`. All 18 occur in the diablo sample; the amazon sample ships
 * 14 of them (no `D3I1K32fC32f`, `D9I1K16uC16u`, `D9I3K16uC16u`, or
 * `D9I3K8uC8u`).
 *
 * ## Not implemented (named, absent from the D2R corpus)
 *
 * - `CurveDataHeader_DaKeyframes32f` (format 0): "just a bunch of keyframes"
 *   with no knot array at all — its time axis is external, so it cannot be
 *   evaluated from the curve alone.
 * - Keyframed `CurveDataHeader_DaK32fC32f` (the `KnotCount == 0` case the
 *   SDK header describes) — no such curve exists in either sample; every
 *   `DaK32fC32f` there has `KnotCount > 0`. A file that does contain one
 *   throws a descriptive error instead of guessing a time axis.
 * - The pre-v7 `old_curve` layout (`Degree`/`Knots`/`Controls` members) and
 *   the SDK's commented-out `D4nI1K16uC16u` / `D4nI1K8uC8u` axis-angle
 *   families. Any other unknown variant type name throws a descriptive error
 *   naming the codec rather than dropping the curve.
 *
 * ## Quirks named rather than smoothed over
 *
 * - The SDK header says `DaIdentity` "if actually sampled, will return
 *   all-zeros" and callers should use `CurveIsIdentity`. This module's
 *   `evaluate()` returns the semantic identity instead (zero position, unit
 *   quaternion, identity 3x3) because the public shape exposes only
 *   `evaluate(t)`, and a zero quaternion is not a rotation.
 * - Quaternion outputs (dimension 4) — blended and constant alike — are
 *   exactly normalized; `granny2.dll` uses a fast Newton-Raphson normalize
 *   after blends instead (per `granny-ro-js`'s disassembly notes) — exact
 *   normalization is within 1e-12 of unit length versus the DLL's ~1e-3.
 */

import {
  asNumber,
  asObject,
  asString,
  asVec3,
  Gr2Reader,
  readContainer,
  type Gr2Object,
  type GrannyTransform,
  type TypeMember,
} from './gr2'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/**
 * One decoded animation curve: a piecewise polynomial of `degree` over the
 * stored knots, dimension components wide (3 position, 4 quaternion,
 * 9 scale-shear, or the scalar/vector width of a vector track).
 */
export interface Gr2Curve {
  /** Codec name decoded from the variant type (`CurveDataHeader_<codec>`). */
  codec: string
  /** The `Format` byte of the leading `CurveDataHeader` struct. */
  format: number
  /** The `Degree` byte: 0 = step/constant, 1 = linear, 2 = quadratic, ... */
  degree: number
  /** Components per evaluated value. */
  dimension: number
  /** Knot (time) values in seconds; empty for constant/identity codecs. */
  knots: readonly number[]
  /**
   * Sample the curve at `t` seconds (clamped to `[knots[0], knots[last]]`;
   * constant/identity curves ignore `t`). Returns `dimension` components;
   * quaternion curves (dimension 4) are exactly normalized.
   */
  evaluate(t: number): number[]
}

export interface Gr2TransformTrack {
  name: string
  flags: number
  /** Unit quaternion track (x, y, z, w); absent when the file omits it. */
  orientation?: Gr2Curve
  /** Position track (x, y, z); absent when the file omits it. */
  position?: Gr2Curve
  /** Row-major 3x3 scale-shear track; absent when the file omits it. */
  scaleShear?: Gr2Curve
}

export interface Gr2VectorTrack {
  name: string
  /** Opaque key the exporter assigned to this track. */
  trackKey: number
  /** Components per value, from the file's own `Dimension` member. */
  dimension: number
  /** The track's value curve; absent when the file omits it. */
  curve?: Gr2Curve
}

export interface Gr2TrackGroup {
  name: string
  vectorTracks: Gr2VectorTrack[]
  transformTracks: Gr2TransformTrack[]
  /** Raw `TransformLODErrors` samples, as the file stores them. */
  transformLODErrors: number[]
  /** Count of text tracks (contents not decoded). */
  textTrackCount: number
  initialPlacement: GrannyTransform
  /** The file's `AccumulationFlags` member (named `Flags` in some specs). */
  accumulationFlags: number
  /**
   * The root's translation accumulated over one loop, in model units — the
   * file's `LoopTranslation` member, and the distance a locomotion clip covers
   * per cycle. The retail game matches playback rate to walker speed through
   * it (rate = speed / (length / duration)); it is the root's own motion, so
   * a walk clip that steps in place has it near zero.
   */
  loopTranslation: [number, number, number]
}

export interface Gr2Animation {
  name: string
  /** Clip length in seconds. */
  duration: number
  /**
   * The distance the clip's root travels over one cycle, in model units —
   * Granny's own `Distance` member, and the number the retail game uses to
   * match a walk clip to the walker's speed (playback rate = speed /
   * (distance / duration)). Zero when the clip does not move the root (idle,
   * attacks), and then the rate is the plain clock.
   */
  distance: number
  /** Suggested sampling step in seconds. */
  timeStep: number
  oversampling: number
  defaultLoopCount: number
  flags: number
  trackGroups: Gr2TrackGroup[]
}

export interface Gr2AnimationSet {
  animations: Gr2Animation[]
  /** Count of the root object's `TrackGroups` array (see note below). */
  trackGroupCount: number
  /**
   * Distinct track-group objects referenced by the animations. The root
   * `TrackGroups` array only registers one animation's groups (6 of 122 for
   * the diablo sample), so this is the honest total.
   */
  distinctTrackGroupCount: number
  fromFileName: string
}

// ---------------------------------------------------------------------------
// Object-tree walking (same layout rules as gr2.ts, minus payload expansion)
// ---------------------------------------------------------------------------

/** A `reference_to_array` / `array_of_references` member, materialized. */
interface WalkedArray {
  count: number
  offset: number
  /** Element objects; empty for scalar payload arrays (read raw instead). */
  items: unknown[]
  /** Element addresses, for reference arrays (track-group deduplication). */
  addresses: number[]
}

function asWalkedArray(value: unknown): WalkedArray | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<WalkedArray>
  if (typeof raw.count !== 'number' || typeof raw.offset !== 'number') return null
  return { count: raw.count, offset: raw.offset, items: raw.items ?? [], addresses: raw.addresses ?? [] }
}

function isScalarType(type: number): boolean {
  return type >= 10 && type <= 21
}

/**
 * Materialize one object like `Gr2Reader.object`, except that
 * `reference_to_array` members whose element type is a bare scalar are kept
 * as `{ count, offset }` payloads: curve knot/control arrays run to hundreds
 * of thousands of values and are read raw by the codec decoders.
 */
function walkObject(reader: Gr2Reader, at: number, chain: TypeMember[], depth = 0): Gr2Object {
  const out: Gr2Object = {}
  let cursor = at
  for (const member of chain) {
    const width = member.arrayWidth > 0 ? member.arrayWidth : 1
    const values: unknown[] = []
    const stride = reader.memberSize(member) / width
    for (let k = 0; k < width; k += 1) {
      values.push(walkValue(reader, member, cursor + k * stride, depth))
    }
    out[member.name] = width > 1 ? values : values[0]
    cursor += reader.memberSize(member)
  }
  return out
}

function walkValue(reader: Gr2Reader, member: TypeMember, at: number, depth: number): unknown {
  switch (member.type) {
    case 1:
      return depth > 24 ? null : walkObject(reader, at, reader.typeChain(member.reference), depth + 1)
    case 2:
    case 22: {
      const target = reader.u64(at)
      if (!target || depth > 24) return null
      return walkObject(reader, target, reader.typeChain(member.reference), depth + 1)
    }
    case 8: {
      const target = reader.u64(at)
      return target ? reader.cstring(target) : ''
    }
    case 3:
    case 4: {
      const count = reader.u32(at)
      const target = reader.u64(at + 4)
      const chain = reader.typeChain(member.reference)
      const scalarElements = chain.length === 0 || (chain.length === 1 && isScalarType(chain[0].type))
      const items: unknown[] = []
      const addresses: number[] = []
      if (target && depth <= 24 && !scalarElements) {
        const elementSize = member.type === 3 ? reader.typeSize(member.reference) : 8
        for (let i = 0; i < count; i += 1) {
          const elementAt = target + i * elementSize
          if (member.type === 3) {
            addresses.push(elementAt)
            items.push(walkObject(reader, elementAt, chain, depth + 1))
          } else {
            const objectAt = reader.u64(elementAt)
            addresses.push(objectAt)
            items.push(objectAt ? walkObject(reader, objectAt, chain, depth + 1) : null)
          }
        }
      }
      return { count, offset: target, items, addresses }
    }
    case 5: {
      const typeAt = reader.u64(at)
      const objectAt = reader.u64(at + 8)
      return {
        type: typeAt,
        object: objectAt && typeAt && depth <= 24 ? walkObject(reader, objectAt, reader.typeChain(typeAt), depth + 1) : null,
      }
    }
    case 7: {
      // Reference-to-variant-array (vertex data) — not present in animation
      // trees; report the raw header so callers can see the count.
      return { type: reader.u64(at), count: reader.u32(at + 8), offset: reader.u64(at + 12) }
    }
    case 9:
      return reader.transform(at)
    default:
      return reader.scalar(member, at)
  }
}

// ---------------------------------------------------------------------------
// Raw payload readers
// ---------------------------------------------------------------------------

function payloadArray(value: unknown): WalkedArray {
  const array = asWalkedArray(value)
  if (!array) throw new Error('gr2-anim: curve is missing a knot/control payload array')
  return array
}

function readF32s(reader: Gr2Reader, offset: number, count: number): Float64Array {
  const out = new Float64Array(count)
  for (let i = 0; i < count; i += 1) out[i] = reader.f32(offset + i * 4)
  return out
}

function readU16s(reader: Gr2Reader, offset: number, count: number): Int32Array {
  const out = new Int32Array(count)
  const view = new DataView(reader.merged.buffer, reader.merged.byteOffset, reader.merged.byteLength)
  for (let i = 0; i < count; i += 1) out[i] = view.getUint16(offset + i * 2, true)
  return out
}

function readU8s(reader: Gr2Reader, offset: number, count: number): Int32Array {
  const out = new Int32Array(count)
  for (let i = 0; i < count; i += 1) out[i] = reader.merged[offset + i]
  return out
}

/**
 * `OneOverKnotScaleTrunc` is the top 16 bits of an IEEE float32 (cited from
 * the SDK structure comments and LSLib's `ConvertOneOverKnotScaleTrunc`).
 */
function floatFromHighU16(value: number): number {
  const view = new DataView(new ArrayBuffer(4))
  view.setUint32(0, (value & 0xffff) << 16, true)
  return view.getFloat32(0, true)
}

/**
 * 16-entry quaternion scale/offset table behind `ScaleOffsetTableEntries`
 * (four 4-bit indices, one per component). Cited from MIT
 * `Rasetsuu/blendergranny`, which recovered it from `granny2.dll`.
 */
const ONE_OVER_SQRT2 = 0.707106781
const QUATERNION_SCALE_OFFSET_TABLE: readonly (readonly [number, number])[] = [
  [ONE_OVER_SQRT2 * 2.0, -ONE_OVER_SQRT2],
  [ONE_OVER_SQRT2 * 1.0, -ONE_OVER_SQRT2 * 0.5],
  [ONE_OVER_SQRT2 * 0.5, -ONE_OVER_SQRT2 * 0.75],
  [ONE_OVER_SQRT2 * 0.5, -ONE_OVER_SQRT2 * 0.25],
  [ONE_OVER_SQRT2 * 0.5, ONE_OVER_SQRT2 * 0.25],
  [ONE_OVER_SQRT2 * 0.25, -ONE_OVER_SQRT2 * 0.25],
  [ONE_OVER_SQRT2 * 0.25, -ONE_OVER_SQRT2 * 0.125],
  [ONE_OVER_SQRT2 * 0.25, ONE_OVER_SQRT2 * 0.0],
  [-ONE_OVER_SQRT2 * 2.0, ONE_OVER_SQRT2],
  [-ONE_OVER_SQRT2 * 1.0, ONE_OVER_SQRT2 * 0.5],
  [-ONE_OVER_SQRT2 * 0.5, ONE_OVER_SQRT2 * 0.75],
  [-ONE_OVER_SQRT2 * 0.5, ONE_OVER_SQRT2 * 0.25],
  [-ONE_OVER_SQRT2 * 0.5, -ONE_OVER_SQRT2 * 0.25],
  [-ONE_OVER_SQRT2 * 0.25, ONE_OVER_SQRT2 * 0.25],
  [-ONE_OVER_SQRT2 * 0.25, ONE_OVER_SQRT2 * 0.125],
  [-ONE_OVER_SQRT2 * 0.25, -ONE_OVER_SQRT2 * 0.0],
]

// ---------------------------------------------------------------------------
// Curve decoding
// ---------------------------------------------------------------------------

interface RawCurve {
  codec: string
  format: number
  degree: number
  dimension: number
  /** Empty for constant/identity codecs. */
  knots: number[]
  /** Flattened `knotCount * dimension` controls, or the constant value. */
  controls: number[]
}

function headerBytes(obj: Gr2Object, codecName: string): { format: number; degree: number } {
  const header = asObject(obj[codecName])
  return { format: asNumber(header['Format']), degree: asNumber(header['Degree']) }
}

/** Every codec this module decodes; anything else is rejected by name. */
const KNOWN_CODECS = new Set([
  'DaIdentity',
  'D3Constant32f',
  'D4Constant32f',
  'DaConstant32f',
  'DaK32fC32f',
  'DaK16uC16u',
  'DaK8uC8u',
  'D3K16uC16u',
  'D3K8uC8u',
  'D3I1K16uC16u',
  'D3I1K8uC8u',
  'D3I1K32fC32f',
  'D4nK16uC15u',
  'D4nK8uC7u',
  'D9I1K16uC16u',
  'D9I1K8uC8u',
  'D9I3K16uC16u',
  'D9I3K8uC8u',
])

/**
 * Decode one variant `{ type, object }` into knots + dequantized controls.
 * Throws a descriptive error naming an unknown codec — never silently drops.
 */
function decodeRawCurve(reader: Gr2Reader, variant: { type: number; object: unknown }): RawCurve {
  const chain = reader.typeChain(variant.type)
  const codecName = chain[0]?.name ?? ''
  const codec = codecName.startsWith('CurveDataHeader_') ? codecName.slice('CurveDataHeader_'.length) : codecName
  if (!KNOWN_CODECS.has(codec)) {
    throw new Error(`gr2-anim: unsupported curve codec ${codecName || '<unnamed>'}`)
  }
  const obj = asObject(variant.object)
  const { format, degree } = headerBytes(obj, codecName)

  // Identity: sampled value is the semantic identity for its dimension (see
  // the doc header for the SDK's zero-sample quirk).
  if (codec === 'DaIdentity') {
    const dimension = asNumber(obj['Dimension'])
    const controls = new Array<number>(dimension).fill(0)
    if (dimension === 4) controls[3] = 1
    else if (dimension === 9) {
      controls[0] = 1
      controls[4] = 1
      controls[8] = 1
    }
    return { codec, format, degree, dimension, knots: [], controls }
  }

  // Constant vectors: inline `Controls` (D3/D4) or a payload array (Da).
  if (codec === 'D3Constant32f' || codec === 'D4Constant32f') {
    const controls = obj['Controls'] as number[] | undefined
    if (!controls || controls.length === 0) {
      throw new Error(`gr2-anim: ${codec} is missing its Controls value`)
    }
    return { codec, format, degree, dimension: controls.length, knots: [], controls: [...controls] }
  }
  if (codec === 'DaConstant32f') {
    const array = payloadArray(obj['Controls'])
    return {
      codec,
      format,
      degree,
      dimension: array.count,
      knots: [],
      controls: [...readF32s(reader, array.offset, array.count)],
    }
  }

  // Unquantized knots + controls (dimension = controls / knots).
  if (codec === 'DaK32fC32f') {
    const knotArray = payloadArray(obj['Knots'])
    const controlArray = payloadArray(obj['Controls'])
    if (knotArray.count === 0) {
      throw new Error('gr2-anim: keyframed DaK32fC32f (KnotCount == 0) is not implemented')
    }
    if (knotArray.count <= 0 || controlArray.count % knotArray.count !== 0) {
      throw new Error(
        `gr2-anim: DaK32fC32f control count ${controlArray.count} is not a multiple of knot count ${knotArray.count}`,
      )
    }
    return {
      codec,
      format,
      degree,
      dimension: controlArray.count / knotArray.count,
      knots: [...readF32s(reader, knotArray.offset, knotArray.count)],
      controls: [...readF32s(reader, controlArray.offset, controlArray.count)],
    }
  }

  // Shared shape of the quantized families: knots dequantize as
  // quantized / OneOverKnotScale(Trunc); controls as quantized * scale + offset.
  const knotControlArray = asWalkedArray(obj['KnotsControls'])
  if (!knotControlArray) throw new Error(`gr2-anim: codec ${codec} is missing KnotsControls`)

  // Per-dimension affine maps in [scales..., offsets...] order.
  const scaleOffsets = (dimension: number): { scales: number[]; offsets: number[] } => {
    const array = payloadArray(obj['ControlScaleOffsets'])
    if (array.count !== dimension * 2) {
      throw new Error(`gr2-anim: ${codec} ControlScaleOffsets count ${array.count} != 2 * dimension ${dimension}`)
    }
    const values = readF32s(reader, array.offset, array.count)
    return {
      scales: [...values.slice(0, dimension)],
      offsets: [...values.slice(dimension)],
    }
  }
  const fixedScaleOffsets = (dimension: number): { scales: number[]; offsets: number[] } => {
    const scales = obj['ControlScales'] as number[] | undefined
    const offsets = obj['ControlOffsets'] as number[] | undefined
    if (!scales || !offsets || scales.length < dimension || offsets.length < dimension) {
      throw new Error(`gr2-anim: ${codec} is missing ControlScales/ControlOffsets`)
    }
    return { scales: scales.slice(0, dimension), offsets: offsets.slice(0, dimension) }
  }

  // DaK16uC16u / DaK8uC8u: arbitrary dimension from ControlScaleOffsets.
  if (codec === 'DaK16uC16u' || codec === 'DaK8uC8u') {
    const scaleOffsetArray = payloadArray(obj['ControlScaleOffsets'])
    const dimension = scaleOffsetArray.count / 2
    if (!Number.isInteger(dimension) || dimension <= 0) {
      throw new Error(`gr2-anim: ${codec} ControlScaleOffsets count ${scaleOffsetArray.count} is not 2 * dimension`)
    }
    const map = scaleOffsets(dimension)
    const knotCount = knotControlArray.count / (dimension + 1)
    if (!Number.isInteger(knotCount) || knotCount <= 0) {
      throw new Error(`gr2-anim: ${codec} KnotControlCount ${knotControlArray.count} is not (dimension + 1) * knots`)
    }
    const oneOver = floatFromHighU16(asNumber(obj['OneOverKnotScaleTrunc']))
    const raw =
      codec === 'DaK16uC16u'
        ? readU16s(reader, knotControlArray.offset, knotControlArray.count)
        : readU8s(reader, knotControlArray.offset, knotControlArray.count)
    const knots: number[] = []
    const controls: number[] = []
    for (let i = 0; i < knotCount; i += 1) {
      knots.push(raw[i] / oneOver)
      for (let d = 0; d < dimension; d += 1) {
        controls.push(map.offsets[d] + map.scales[d] * raw[knotCount + i * dimension + d])
      }
    }
    return { codec, format, degree, dimension, knots, controls }
  }

  // D3K16uC16u / D3K8uC8u: three independent components per knot.
  if (codec === 'D3K16uC16u' || codec === 'D3K8uC8u') {
    const map = fixedScaleOffsets(3)
    const knotCount = knotControlArray.count / 4
    if (!Number.isInteger(knotCount) || knotCount <= 0) {
      throw new Error(`gr2-anim: ${codec} KnotControlCount ${knotControlArray.count} is not 4 * knots`)
    }
    const oneOver = floatFromHighU16(asNumber(obj['OneOverKnotScaleTrunc']))
    const raw =
      codec === 'D3K16uC16u'
        ? readU16s(reader, knotControlArray.offset, knotControlArray.count)
        : readU8s(reader, knotControlArray.offset, knotControlArray.count)
    const knots: number[] = []
    const controls: number[] = []
    for (let i = 0; i < knotCount; i += 1) {
      knots.push(raw[i] / oneOver)
      for (let d = 0; d < 3; d += 1) {
        controls.push(map.offsets[d] + map.scales[d] * raw[knotCount + i * 3 + d])
      }
    }
    return { codec, format, degree, dimension: 3, knots, controls }
  }

  // D3I1K16uC16u / D3I1K8uC8u / D3I1K32fC32f: one quantized parameter per
  // knot ("points that can be represented by a linear function of one
  // variable" — the 3 components are affine images of that parameter).
  if (codec === 'D3I1K16uC16u' || codec === 'D3I1K8uC8u' || codec === 'D3I1K32fC32f') {
    const map = fixedScaleOffsets(3)
    const knotCount = knotControlArray.count / 2
    if (!Number.isInteger(knotCount) || knotCount <= 0) {
      throw new Error(`gr2-anim: ${codec} KnotControlCount ${knotControlArray.count} is not 2 * knots`)
    }
    const floats = codec === 'D3I1K32fC32f'
    const oneOver = floats ? 1 : floatFromHighU16(asNumber(obj['OneOverKnotScaleTrunc']))
    const raw = floats
      ? readF32s(reader, knotControlArray.offset, knotControlArray.count)
      : codec === 'D3I1K16uC16u'
        ? readU16s(reader, knotControlArray.offset, knotControlArray.count)
        : readU8s(reader, knotControlArray.offset, knotControlArray.count)
    const knots: number[] = []
    const controls: number[] = []
    for (let i = 0; i < knotCount; i += 1) {
      knots.push(raw[i] / oneOver)
      const param = raw[knotCount + i]
      for (let d = 0; d < 3; d += 1) controls.push(map.offsets[d] + map.scales[d] * param)
    }
    return { codec, format, degree, dimension: 3, knots, controls }
  }

  // D4nK16uC15u / D4nK8uC7u: normalized quaternions; three stored components
  // per knot (sign + magnitude), the fourth recovered from the unit-norm
  // constraint using the spare bits' index (see the doc header).
  if (codec === 'D4nK16uC15u' || codec === 'D4nK8uC7u') {
    const knotCount = knotControlArray.count / 4
    if (!Number.isInteger(knotCount) || knotCount <= 0) {
      throw new Error(`gr2-anim: ${codec} KnotControlCount ${knotControlArray.count} is not 4 * knots`)
    }
    const oneOver = asNumber(obj['OneOverKnotScale'])
    const wide = codec === 'D4nK16uC15u'
    const bits = wide ? 15 : 7
    const quantMax = wide ? 32767 : 127
    const mask = (1 << bits) - 1
    const raw = wide
      ? readU16s(reader, knotControlArray.offset, knotControlArray.count)
      : readU8s(reader, knotControlArray.offset, knotControlArray.count)
    // One nibble per component selects a (scale, offset) table entry.
    const entries = asNumber(obj['ScaleOffsetTableEntries'])
    const scales = new Array<number>(4)
    const offsets = new Array<number>(4)
    for (let d = 0; d < 4; d += 1) {
      const entry = QUATERNION_SCALE_OFFSET_TABLE[(entries >>> (4 * d)) & 0xf]
      scales[d] = entry[0] / quantMax
      offsets[d] = entry[1]
    }
    const knots: number[] = []
    const controls: number[] = []
    for (let i = 0; i < knotCount; i += 1) {
      knots.push(raw[i] / oneOver)
      const data = [raw[knotCount + i * 3], raw[knotCount + i * 3 + 1], raw[knotCount + i * 3 + 2]]
      const missingNegative = (data[0] & (mask + 1)) !== 0
      const missingIndex = (((data[1] >>> bits) & 0x1) << 1) | (data[2] >>> bits)
      const result = [0, 0, 0, 0]
      let summedSq = 0
      for (let src = 0; src < 3; src += 1) {
        const dst = (missingIndex + 1 + src) & 3
        const value = offsets[dst] + scales[dst] * (data[src] & mask)
        result[dst] = value
        summedSq += value * value
      }
      const missing = Math.sqrt(Math.max(0, 1 - summedSq))
      result[missingIndex] = missingNegative ? -missing : missing
      controls.push(...result)
    }
    return { codec, format, degree, dimension: 4, knots, controls }
  }

  // D9I1*: uniform scale expressed as a 3x3 diagonal (one parameter per
  // knot); D9I3*: per-axis diagonal (three parameters per knot).
  if (codec === 'D9I1K16uC16u' || codec === 'D9I1K8uC8u') {
    const knotCount = knotControlArray.count / 2
    if (!Number.isInteger(knotCount) || knotCount <= 0) {
      throw new Error(`gr2-anim: ${codec} KnotControlCount ${knotControlArray.count} is not 2 * knots`)
    }
    const oneOver = floatFromHighU16(asNumber(obj['OneOverKnotScaleTrunc']))
    const scale = asNumber(obj['ControlScale'])
    const offset = asNumber(obj['ControlOffset'])
    const raw =
      codec === 'D9I1K16uC16u'
        ? readU16s(reader, knotControlArray.offset, knotControlArray.count)
        : readU8s(reader, knotControlArray.offset, knotControlArray.count)
    const knots: number[] = []
    const controls: number[] = []
    for (let i = 0; i < knotCount; i += 1) {
      knots.push(raw[i] / oneOver)
      const value = offset + scale * raw[knotCount + i]
      controls.push(value, 0, 0, 0, value, 0, 0, 0, value)
    }
    return { codec, format, degree, dimension: 9, knots, controls }
  }
  if (codec === 'D9I3K16uC16u' || codec === 'D9I3K8uC8u') {
    const map = fixedScaleOffsets(3)
    const knotCount = knotControlArray.count / 4
    if (!Number.isInteger(knotCount) || knotCount <= 0) {
      throw new Error(`gr2-anim: ${codec} KnotControlCount ${knotControlArray.count} is not 4 * knots`)
    }
    const oneOver = floatFromHighU16(asNumber(obj['OneOverKnotScaleTrunc']))
    const raw =
      codec === 'D9I3K16uC16u'
        ? readU16s(reader, knotControlArray.offset, knotControlArray.count)
        : readU8s(reader, knotControlArray.offset, knotControlArray.count)
    const knots: number[] = []
    const controls: number[] = []
    for (let i = 0; i < knotCount; i += 1) {
      knots.push(raw[i] / oneOver)
      const diagonal = [0, 1, 2].map((d) => map.offsets[d] + map.scales[d] * raw[knotCount + i * 3 + d])
      controls.push(diagonal[0], 0, 0, 0, diagonal[1], 0, 0, 0, diagonal[2])
    }
    return { codec, format, degree, dimension: 9, knots, controls }
  }

  throw new Error(`gr2-anim: unsupported curve codec CurveDataHeader_${codec}`)
}

/**
 * Build the public curve: piecewise polynomial of `degree` evaluated with the
 * de Boor recursion over the knot vector, with knot `i` paired with control
 * `i` (equivalently: the B-spline basis anchored so the curve hits its first
 * and last control exactly and degree-1 curves interpolate every control).
 */
function makeCurve(raw: RawCurve): Gr2Curve {
  const { codec, format, degree, dimension } = raw
  const knots = raw.knots
  const controls = raw.controls

  const normalize = (value: number[]): number[] => {
    if (dimension !== 4) return value
    const lengthSq = value[0] * value[0] + value[1] * value[1] + value[2] * value[2] + value[3] * value[3]
    if (lengthSq <= 1e-24) return value
    const invLength = 1 / Math.sqrt(lengthSq)
    return [value[0] * invLength, value[1] * invLength, value[2] * invLength, value[3] * invLength]
  }

  const evaluate = (t: number): number[] => {
    if (knots.length === 0) return normalize([...controls])
    const last = knots.length - 1
    if (last === 0) return normalize(controls.slice(0, dimension))
    const time = Math.min(Math.max(t, knots[0]), knots[last])

    // Span m = [knots[m], knots[m + 1]) containing `time`.
    let m = 0
    while (m < last && knots[m + 1] <= time) m += 1

    // De Boor triangle over the knot vector (knots clamp at both ends) with
    // the control sequence shifted by one: basis slot j pairs with control j+1.
    const knotAt = (index: number): number => knots[Math.min(Math.max(index, 0), last)]
    const controlAt = (index: number, out: number[]): void => {
      const i = Math.min(Math.max(index + 1, 0), last) * dimension
      for (let d = 0; d < dimension; d += 1) out[d] = controls[i + d]
    }
    const work: number[][] = []
    for (let i = 0; i <= degree; i += 1) {
      const values = new Array<number>(dimension)
      controlAt(m - degree + i, values)
      work.push(values)
    }
    for (let r = 1; r <= degree; r += 1) {
      for (let i = degree; i >= r; i -= 1) {
        const j = m - degree + i
        const denominator = knotAt(j + degree + 1 - r) - knotAt(j)
        const alpha = denominator === 0 ? 0 : (time - knotAt(j)) / denominator
        for (let d = 0; d < dimension; d += 1) {
          work[i][d] = (1 - alpha) * work[i - 1][d] + alpha * work[i][d]
        }
      }
    }
    return normalize([...work[degree]])
  }

  return { codec, format, degree, dimension, knots, evaluate }
}

function decodeCurveValue(value: unknown, reader: Gr2Reader): Gr2Curve | undefined {
  const wrapper = asObject(value)
  const variant = wrapper['CurveData'] ?? (typeof wrapper['type'] === 'number' ? wrapper : null)
  if (!variant) return undefined
  const typed = variant as { type: number; object: unknown }
  if (!typed.type || !typed.object) return undefined
  return makeCurve(decodeRawCurve(reader, typed))
}

// ---------------------------------------------------------------------------
// Animation / track-group decoding
// ---------------------------------------------------------------------------

function decodeTransformTrack(reader: Gr2Reader, value: unknown): Gr2TransformTrack {
  const track = asObject(value)
  return {
    name: asString(track['Name']),
    flags: asNumber(track['Flags']),
    orientation: decodeCurveValue(track['OrientationCurve'], reader),
    position: decodeCurveValue(track['PositionCurve'], reader),
    scaleShear: decodeCurveValue(track['ScaleShearCurve'], reader),
  }
}

function decodeVectorTrack(reader: Gr2Reader, value: unknown): Gr2VectorTrack {
  const track = asObject(value)
  return {
    name: asString(track['Name']),
    trackKey: asNumber(track['TrackKey']),
    dimension: asNumber(track['Dimension']),
    curve: decodeCurveValue(track['ValueCurve'], reader),
  }
}

function decodeTrackGroup(reader: Gr2Reader, value: unknown): Gr2TrackGroup {
  const group = asObject(value)
  const vectorTracks = asWalkedArray(group['VectorTracks'])
  const transformTracks = asWalkedArray(group['TransformTracks'])
  const lodErrors = asWalkedArray(group['TransformLODErrors'])
  const textTracks = asWalkedArray(group['TextTracks'])
  return {
    name: asString(group['Name']),
    vectorTracks: (vectorTracks?.items ?? []).map((item) => decodeVectorTrack(reader, item)),
    transformTracks: (transformTracks?.items ?? []).map((item) => decodeTransformTrack(reader, item)),
    transformLODErrors: lodErrors ? [...readF32s(reader, lodErrors.offset, lodErrors.count)] : [],
    textTrackCount: textTracks?.count ?? 0,
    initialPlacement: (group['InitialPlacement'] as GrannyTransform | undefined) ?? {
      flags: 0,
      hasPosition: false,
      hasOrientation: false,
      hasScaleShear: false,
      position: [0, 0, 0],
      orientation: [0, 0, 0, 1],
      scaleShear: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    },
    accumulationFlags: asNumber(group['AccumulationFlags']),
    loopTranslation: asVec3(group['LoopTranslation']),
  }
}

/**
 * Decode the animation tracks of one Granny GR2 file (`.animations`).
 *
 * Returns one `Gr2Animation` per entry of the root `Animations` array, each
 * carrying its referenced `Gr2TrackGroup`s with fully decoded curves. Track
 * groups referenced by several animations are decoded once and shared.
 *
 * Throws a descriptive `Error` on a malformed container (see `loadGr2`) or an
 * unknown curve codec, which is named in the message.
 */
export function loadGr2Animations(bytes: Uint8Array): Gr2AnimationSet {
  const container = readContainer(bytes)
  const reader = new Gr2Reader(container.merged)
  const rootAt = container.sectionStart[container.header.rootObject.section] + container.header.rootObject.offset
  const typeAt = container.sectionStart[container.header.rootType.section] + container.header.rootType.offset
  const root = walkObject(reader, rootAt, reader.typeChain(typeAt))

  const trackGroupCache = new Map<number, Gr2TrackGroup>()
  const decodeGroupAt = (address: number, value: unknown): Gr2TrackGroup => {
    const cached = trackGroupCache.get(address)
    if (cached) return cached
    const group = decodeTrackGroup(reader, value)
    trackGroupCache.set(address, group)
    return group
  }

  const animations: Gr2Animation[] = []
  const animationsArray = asWalkedArray(root['Animations'])
  for (let i = 0; i < (animationsArray?.count ?? 0); i += 1) {
    const animation = asObject(animationsArray?.items[i])
    const groups = asWalkedArray(animation['TrackGroups'])
    const trackGroups: Gr2TrackGroup[] = []
    for (let g = 0; g < (groups?.count ?? 0); g += 1) {
      const address = groups?.addresses[g] ?? 0
      const value = groups?.items[g]
      if (value) trackGroups.push(decodeGroupAt(address, value))
    }
    animations.push({
      name: asString(animation['Name']),
      duration: asNumber(animation['Duration']),
      distance: asNumber(animation['Distance']),
      timeStep: asNumber(animation['TimeStep']),
      oversampling: asNumber(animation['Oversampling']),
      defaultLoopCount: asNumber(animation['DefaultLoopCount']),
      flags: asNumber(animation['Flags']),
      trackGroups,
    })
  }

  return {
    animations,
    trackGroupCount: asWalkedArray(root['TrackGroups'])?.count ?? 0,
    distinctTrackGroupCount: trackGroupCache.size,
    fromFileName: asString(root['FromFileName']),
  }
}
