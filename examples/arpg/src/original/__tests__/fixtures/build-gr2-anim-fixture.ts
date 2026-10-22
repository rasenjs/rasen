/**
 * Synthetic `.animations` GR2 builder for the gr2-anim unit tests.
 *
 * Hand-assembles a minimal but fully valid 64-bit LE format-7 Granny
 * container: magic + header + one uncompressed section + the same 44-byte
 * type-record chains and packed object layout the real files use (see
 * `gr2.ts` for the measured layout rules). Curve payloads are written as the
 * RAW quantized bytes each codec stores, so the tests can hand-compute the
 * expected dequantization and catch any decode-math error.
 *
 * Everything is laid out bottom-up (element chains, strings, payload arrays,
 * curve objects, track arrays, track groups, animations, root), so every
 * pointer is known before it is written and no fixup table is needed.
 */

// ---------------------------------------------------------------------------
// Test-facing description
// ---------------------------------------------------------------------------

/** Raw per-codec curve payload, before any decoding. */
export type CurveSpec =
  | { codec: 'DaIdentity'; dimension: number; degree?: number }
  | { codec: 'D3Constant32f' | 'D4Constant32f'; controls: number[]; degree?: number }
  | { codec: 'DaConstant32f'; controls: number[]; degree?: number }
  | { codec: 'DaK32fC32f'; knots: number[]; controls: number[]; degree?: number }
  | {
      /** Buildable so tests can exercise the loader's named rejection of it. */
      codec: 'DaKeyframes32f'
      dimension: number
      controls: number[]
      degree?: number
    }
  | {
      codec: 'DaK16uC16u' | 'DaK8uC8u'
      oneOverKnotScaleTrunc: number
      /** [scales..., offsets...], length 2 * dimension. */
      controlScaleOffsets: number[]
      /** Raw quantized [knots..., controls...]. */
      knotsControls: number[]
      degree?: number
    }
  | {
      codec: 'D3K16uC16u' | 'D3K8uC8u' | 'D3I1K16uC16u' | 'D3I1K8uC8u' | 'D3I1K32fC32f'
      oneOverKnotScaleTrunc?: number
      controlScales: number[]
      controlOffsets: number[]
      /** Raw quantized [knots..., controls...]. */
      knotsControls: number[]
      degree?: number
    }
  | {
      codec: 'D4nK16uC15u' | 'D4nK8uC7u'
      scaleOffsetTableEntries: number
      oneOverKnotScale: number
      /** Raw quantized [knots..., 3 controls per knot...]. */
      knotsControls: number[]
      degree?: number
    }
  | {
      codec: 'D9I1K16uC16u' | 'D9I1K8uC8u'
      oneOverKnotScaleTrunc: number
      controlScale: number
      controlOffset: number
      /** Raw quantized [knots..., 1 control per knot...]. */
      knotsControls: number[]
      degree?: number
    }
  | {
      codec: 'D9I3K16uC16u' | 'D9I3K8uC8u'
      oneOverKnotScaleTrunc: number
      controlScales: number[]
      controlOffsets: number[]
      /** Raw quantized [knots..., 3 controls per knot...]. */
      knotsControls: number[]
      degree?: number
    }

export interface SyntheticTransformTrack {
  name: string
  flags?: number
  orientation?: CurveSpec
  position?: CurveSpec
  scaleShear?: CurveSpec
}

export interface SyntheticVectorTrack {
  name: string
  trackKey?: number
  dimension: number
  curve?: CurveSpec
}

export interface SyntheticTrackGroup {
  name: string
  transformTracks: SyntheticTransformTrack[]
  vectorTracks?: SyntheticVectorTrack[]
  transformLODErrors?: number[]
  textTrackCount?: number
  accumulationFlags?: number
  loopTranslation?: [number, number, number]
}

export interface SyntheticAnimation {
  name: string
  duration: number
  timeStep?: number
  oversampling?: number
  defaultLoopCount?: number
  flags?: number
  trackGroups: SyntheticTrackGroup[]
}

// ---------------------------------------------------------------------------
// Binary assembly
// ---------------------------------------------------------------------------

const MEMBER_INLINE = 1
const MEMBER_REFERENCE = 2
const MEMBER_REFERENCE_TO_ARRAY = 3
const MEMBER_ARRAY_OF_REFERENCES = 4
const MEMBER_VARIANT_REFERENCE = 5
const MEMBER_STRING = 8
const MEMBER_TRANSFORM = 9
const MEMBER_REAL32 = 10
const MEMBER_UINT8 = 12
const MEMBER_INT16 = 15
const MEMBER_UINT16 = 16
const MEMBER_INT32 = 19
const MEMBER_UINT32 = 20

interface MemberSpec {
  type: number
  name: string
  /** Target chain name for inline / reference / array members. */
  ref?: string
  width: number
}

interface ChainSpec {
  name: string
  members: MemberSpec[]
}

function memberSize(spec: MemberSpec, chainSize: (name: string) => number): number {
  const width = spec.width > 0 ? spec.width : 1
  switch (spec.type) {
    case MEMBER_INLINE:
      return chainSize(spec.ref ?? '') * width
    case MEMBER_REFERENCE:
    case MEMBER_STRING:
      return 8 * width
    case MEMBER_REFERENCE_TO_ARRAY:
    case MEMBER_ARRAY_OF_REFERENCES:
      return 12 * width
    case MEMBER_VARIANT_REFERENCE:
      return 16 * width
    case MEMBER_TRANSFORM:
      return 68 * width
    case MEMBER_REAL32:
    case MEMBER_INT32:
    case MEMBER_UINT32:
      return 4 * width
    case MEMBER_UINT8:
      return 1 * width
    case MEMBER_INT16:
    case MEMBER_UINT16:
      return 2 * width
    default:
      throw new Error(`fixture: unsupported member type ${spec.type}`)
  }
}

/** Growable little-endian byte sink; positions are merged-buffer offsets. */
class ByteSink {
  private chunks: Uint8Array[] = []
  private used = 0

  get offset(): number {
    return this.used
  }

  private push(bytes: Uint8Array): void {
    this.chunks.push(bytes)
    this.used += bytes.length
  }

  u8(value: number): void {
    this.push(Uint8Array.of(value & 0xff))
  }

  u16(value: number): void {
    this.push(Uint8Array.of(value & 0xff, (value >>> 8) & 0xff))
  }

  u32(value: number): void {
    this.push(Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff))
  }

  u64(value: number): void {
    this.u32(value >>> 0)
    this.u32(Math.floor(value / 0x100000000) >>> 0)
  }

  f32(value: number): void {
    const view = new DataView(new ArrayBuffer(4))
    view.setFloat32(0, value, true)
    this.push(new Uint8Array(view.buffer))
  }

  raw(bytes: ArrayLike<number>): void {
    this.push(Uint8Array.from(bytes))
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.used)
    let at = 0
    for (const chunk of this.chunks) {
      out.set(chunk, at)
      at += chunk.length
    }
    return out
  }
}

/** One curve's planned payload: where its raw quantized bytes live. */
function curveChainMembers(spec: CurveSpec): MemberSpec[] {
  const hdr = (name: string): MemberSpec => ({ type: MEMBER_INLINE, name, ref: 'hdr', width: 1 })
  const payload = (type: number, name: string, ref: string, width = 1): MemberSpec => ({ type, name, ref, width })
  const scaleOffsets = (): MemberSpec[] => [
    payload(MEMBER_REAL32, 'ControlScales', '', 3),
    payload(MEMBER_REAL32, 'ControlOffsets', '', 3),
  ]
  switch (spec.codec) {
    case 'DaIdentity':
      return [hdr(`CurveDataHeader_${spec.codec}`), payload(MEMBER_INT16, 'Dimension', '')]
    case 'D3Constant32f':
    case 'D4Constant32f':
      return [
        hdr(`CurveDataHeader_${spec.codec}`),
        payload(MEMBER_INT16, 'Padding', ''),
        payload(MEMBER_REAL32, 'Controls', '', spec.codec === 'D3Constant32f' ? 3 : 4),
      ]
    case 'DaConstant32f':
      return [hdr(`CurveDataHeader_${spec.codec}`), payload(MEMBER_INT16, 'Padding', ''), payload(MEMBER_REFERENCE_TO_ARRAY, 'Controls', 'f32')]
    case 'DaK32fC32f':
      return [
        hdr(`CurveDataHeader_${spec.codec}`),
        payload(MEMBER_INT16, 'Padding', ''),
        payload(MEMBER_REFERENCE_TO_ARRAY, 'Knots', 'f32'),
        payload(MEMBER_REFERENCE_TO_ARRAY, 'Controls', 'f32'),
      ]
    case 'DaKeyframes32f':
      return [
        hdr(`CurveDataHeader_${spec.codec}`),
        payload(MEMBER_INT16, 'Dimension', ''),
        payload(MEMBER_UINT32, 'ControlCount', ''),
        payload(MEMBER_REFERENCE_TO_ARRAY, 'Controls', 'f32'),
      ]
    case 'DaK16uC16u':
    case 'DaK8uC8u':
      return [
        hdr(`CurveDataHeader_${spec.codec}`),
        payload(MEMBER_UINT16, 'OneOverKnotScaleTrunc', ''),
        payload(MEMBER_REFERENCE_TO_ARRAY, 'ControlScaleOffsets', 'f32'),
        payload(MEMBER_REFERENCE_TO_ARRAY, 'KnotsControls', spec.codec === 'DaK16uC16u' ? 'u16' : 'u8'),
      ]
    case 'D3K16uC16u':
    case 'D3K8uC8u':
    case 'D3I1K16uC16u':
    case 'D3I1K8uC8u':
      return [
        hdr(`CurveDataHeader_${spec.codec}`),
        payload(MEMBER_UINT16, 'OneOverKnotScaleTrunc', ''),
        ...scaleOffsets(),
        payload(MEMBER_REFERENCE_TO_ARRAY, 'KnotsControls', spec.codec.endsWith('16u') ? 'u16' : 'u8'),
      ]
    case 'D3I1K32fC32f':
      return [
        hdr(`CurveDataHeader_${spec.codec}`),
        payload(MEMBER_UINT16, 'Padding', ''),
        ...scaleOffsets(),
        payload(MEMBER_REFERENCE_TO_ARRAY, 'KnotsControls', 'f32'),
      ]
    case 'D4nK16uC15u':
    case 'D4nK8uC7u':
      return [
        hdr(`CurveDataHeader_${spec.codec}`),
        payload(MEMBER_UINT16, 'ScaleOffsetTableEntries', ''),
        payload(MEMBER_REAL32, 'OneOverKnotScale', ''),
        payload(MEMBER_REFERENCE_TO_ARRAY, 'KnotsControls', spec.codec === 'D4nK16uC15u' ? 'u16' : 'u8'),
      ]
    case 'D9I1K16uC16u':
    case 'D9I1K8uC8u':
      return [
        hdr(`CurveDataHeader_${spec.codec}`),
        payload(MEMBER_UINT16, 'OneOverKnotScaleTrunc', ''),
        payload(MEMBER_REAL32, 'ControlScale', ''),
        payload(MEMBER_REAL32, 'ControlOffset', ''),
        payload(MEMBER_REFERENCE_TO_ARRAY, 'KnotsControls', spec.codec === 'D9I1K16uC16u' ? 'u16' : 'u8'),
      ]
    case 'D9I3K16uC16u':
    case 'D9I3K8uC8u':
      return [
        hdr(`CurveDataHeader_${spec.codec}`),
        payload(MEMBER_UINT16, 'OneOverKnotScaleTrunc', ''),
        ...scaleOffsets(),
        payload(MEMBER_REFERENCE_TO_ARRAY, 'KnotsControls', spec.codec === 'D9I3K16uC16u' ? 'u16' : 'u8'),
      ]
    default:
      throw new Error(`fixture: unsupported curve codec ${(spec as CurveSpec).codec}`)
  }
}

/** The `Format` byte of the leading CurveDataHeader for each codec. */
const CURVE_FORMATS: Record<string, number> = {
  DaKeyframes32f: 0,
  DaK32fC32f: 1,
  DaIdentity: 2,
  DaConstant32f: 3,
  D3Constant32f: 4,
  D4Constant32f: 5,
  DaK16uC16u: 6,
  DaK8uC8u: 7,
  D4nK16uC15u: 8,
  D4nK8uC7u: 9,
  D3K16uC16u: 10,
  D3K8uC8u: 11,
  D9I1K16uC16u: 12,
  D9I3K16uC16u: 13,
  D9I1K8uC8u: 14,
  D9I3K8uC8u: 15,
  D3I1K32fC32f: 16,
  D3I1K16uC16u: 17,
  D3I1K8uC8u: 18,
}

/**
 * Assemble a complete `.animations` GR2 file from synthetic animations.
 * Track groups are written once even when several animations reference the
 * same object (the loader's dedup path is exercised via
 * `distinctTrackGroupCount`).
 */
export function buildAnimationGr2(animations: SyntheticAnimation[], fileName = 'fixture.animations'): Uint8Array {
  // --- plan: chains -----------------------------------------------------
  const chains = new Map<string, ChainSpec>()
  const chain = (name: string, members: MemberSpec[]): void => {
    chains.set(name, { name, members })
  }
  chain('hdr', [
    { type: MEMBER_UINT8, name: 'Format', width: 1 },
    { type: MEMBER_UINT8, name: 'Degree', width: 1 },
  ])
  chain('f32', [{ type: MEMBER_REAL32, name: 'Value', width: 1 }])
  chain('u16', [{ type: MEMBER_UINT16, name: 'Value', width: 1 }])
  chain('u8', [{ type: MEMBER_UINT8, name: 'Value', width: 1 }])
  chain('curveWrapper', [{ type: MEMBER_VARIANT_REFERENCE, name: 'CurveData', width: 1 }])
  chain('vectorTrack', [
    { type: MEMBER_STRING, name: 'Name', width: 1 },
    { type: MEMBER_UINT32, name: 'TrackKey', width: 1 },
    { type: MEMBER_INT32, name: 'Dimension', width: 1 },
    { type: MEMBER_INLINE, name: 'ValueCurve', ref: 'curveWrapper', width: 1 },
  ])
  chain('transformTrack', [
    { type: MEMBER_STRING, name: 'Name', width: 1 },
    { type: MEMBER_INT32, name: 'Flags', width: 1 },
    { type: MEMBER_INLINE, name: 'OrientationCurve', ref: 'curveWrapper', width: 1 },
    { type: MEMBER_INLINE, name: 'PositionCurve', ref: 'curveWrapper', width: 1 },
    { type: MEMBER_INLINE, name: 'ScaleShearCurve', ref: 'curveWrapper', width: 1 },
  ])
  chain('trackGroup', [
    { type: MEMBER_STRING, name: 'Name', width: 1 },
    { type: MEMBER_REFERENCE_TO_ARRAY, name: 'VectorTracks', ref: 'vectorTrack', width: 1 },
    { type: MEMBER_REFERENCE_TO_ARRAY, name: 'TransformTracks', ref: 'transformTrack', width: 1 },
    { type: MEMBER_REFERENCE_TO_ARRAY, name: 'TransformLODErrors', ref: 'f32', width: 1 },
    { type: MEMBER_REFERENCE_TO_ARRAY, name: 'TextTracks', ref: 'f32', width: 1 },
    { type: MEMBER_TRANSFORM, name: 'InitialPlacement', width: 1 },
    { type: MEMBER_INT32, name: 'AccumulationFlags', width: 1 },
    { type: MEMBER_REAL32, name: 'LoopTranslation', width: 3 },
    { type: MEMBER_REFERENCE, name: 'PeriodicLoop', width: 1 },
    { type: MEMBER_VARIANT_REFERENCE, name: 'ExtendedData', width: 1 },
  ])
  chain('animation', [
    { type: MEMBER_STRING, name: 'Name', width: 1 },
    { type: MEMBER_REAL32, name: 'Duration', width: 1 },
    { type: MEMBER_REAL32, name: 'TimeStep', width: 1 },
    { type: MEMBER_REAL32, name: 'Oversampling', width: 1 },
    { type: MEMBER_ARRAY_OF_REFERENCES, name: 'TrackGroups', ref: 'trackGroup', width: 1 },
    { type: MEMBER_INT32, name: 'DefaultLoopCount', width: 1 },
    { type: MEMBER_INT32, name: 'Flags', width: 1 },
    { type: MEMBER_VARIANT_REFERENCE, name: 'ExtendedData', width: 1 },
  ])
  chain('root', [
    { type: MEMBER_STRING, name: 'Name', width: 1 },
    { type: MEMBER_STRING, name: 'FromFileName', width: 1 },
    { type: MEMBER_ARRAY_OF_REFERENCES, name: 'TrackGroups', ref: 'trackGroup', width: 1 },
    { type: MEMBER_ARRAY_OF_REFERENCES, name: 'Animations', ref: 'animation', width: 1 },
    { type: MEMBER_VARIANT_REFERENCE, name: 'ExtendedData', width: 1 },
  ])

  // One chain per distinct curve codec used anywhere in the file.
  const codecNames = new Set<string>()
  const eachCurve = (visit: (spec: CurveSpec) => void): void => {
    for (const animation of animations) {
      for (const group of animation.trackGroups) {
        for (const track of group.transformTracks) {
          for (const spec of [track.orientation, track.position, track.scaleShear]) if (spec) visit(spec)
        }
        for (const track of group.vectorTracks ?? []) if (track.curve) visit(track.curve)
      }
    }
  }
  eachCurve((spec) => codecNames.add(spec.codec))
  for (const codec of codecNames) {
    chain(`curve:${codec}`, curveChainMembers({ codec } as CurveSpec))
  }

  const chainSize = (name: string): number => {
    const spec = chains.get(name)
    if (!spec) return 0
    return spec.members.reduce((sum, member) => sum + memberSize(member, chainSize), 0)
  }

  // --- write: chain records, strings, payloads --------------------------
  const sink = new ByteSink()
  // Reserve merged offset 0: the readers treat a 0 string pointer as null.
  sink.u8(0)
  const chainOffsets = new Map<string, number>()
  const strings = new Map<string, number>()
  const intern = (text: string): number => {
    const existing = strings.get(text)
    if (existing !== undefined) return existing
    const at = sink.offset
    sink.raw([...text].map((c) => c.charCodeAt(0)))
    sink.u8(0)
    strings.set(text, at)
    return at
  }

  // Regions in order: member-name strings, chain records, payloads, objects.
  // Chain records are 44 bytes per member plus the end sentinel; chain
  // offsets must be known before any record's reference pointer is written,
  // so intern all names and reserve the record region first.
  for (const spec of chains.values()) {
    for (const member of spec.members) intern(member.name)
  }
  let chainRegion = sink.offset
  for (const spec of chains.values()) {
    chainOffsets.set(spec.name, chainRegion)
    chainRegion += (spec.members.length + 1) * 44
  }
  for (const spec of chains.values()) {
    for (const member of spec.members) {
      const nameAt = intern(member.name)
      sink.u32(member.type)
      sink.u64(nameAt)
      sink.u64(member.ref ? (chainOffsets.get(member.ref) ?? 0) : 0)
      sink.u32(member.width)
      sink.raw(new Array<number>(20).fill(0))
    }
    sink.raw(new Array<number>(44).fill(0))
  }

  const payloadOffsets: number[] = []
  const writePayload = (values: ArrayLike<number>, width: 1 | 2 | 4): number => {
    const at = sink.offset
    payloadOffsets.push(at)
    for (let i = 0; i < values.length; i += 1) {
      if (width === 1) sink.u8(values[i])
      else if (width === 2) sink.u16(values[i])
      else sink.f32(values[i])
    }
    return at
  }
  /** OneOverKnotScaleTrunc is the top 16 bits of the float (inverse of the loader). */
  const truncHigh16 = (value: number): number => {
    const view = new DataView(new ArrayBuffer(4))
    view.setFloat32(0, value, true)
    return view.getUint16(2, true)
  }

  // --- write: object strings up front (interning appends to the sink) ----
  intern('animations')
  intern(fileName)
  for (const animation of animations) {
    intern(animation.name)
    for (const group of animation.trackGroups) {
      intern(group.name)
      for (const track of group.transformTracks) intern(track.name)
      for (const track of group.vectorTracks ?? []) intern(track.name)
    }
  }

  // --- write: curve payloads, then curve objects (variant targets) -------
  // Payload bytes are written BEFORE each object so the object's own fields
  // stay contiguous (an inline `writePayload` would splice array bytes into
  // the middle of the object).
  const curveObjects: Array<{ spec: CurveSpec; offset: number }> = []
  const curves: CurveSpec[] = []
  eachCurve((spec) => curves.push(spec))
  for (const spec of curves) {
    const members = curveChainMembers(spec)
    intern(members[0].name)

    // Prewrite the raw quantized arrays this codec stores.
    const offsets: Record<string, number> = {}
    switch (spec.codec) {
      case 'DaConstant32f':
        offsets.controls = writePayload(spec.controls, 4)
        break
      case 'DaK32fC32f':
        offsets.knots = writePayload(spec.knots, 4)
        offsets.controls = writePayload(spec.controls, 4)
        break
      case 'DaKeyframes32f':
        offsets.controls = writePayload(spec.controls, 4)
        break
      case 'DaK16uC16u':
      case 'DaK8uC8u':
        offsets.controlScaleOffsets = writePayload(spec.controlScaleOffsets, 4)
        offsets.knotsControls = writePayload(spec.knotsControls, spec.codec === 'DaK16uC16u' ? 2 : 1)
        break
      case 'D3K16uC16u':
      case 'D3K8uC8u':
      case 'D3I1K16uC16u':
      case 'D3I1K8uC8u':
        offsets.knotsControls = writePayload(spec.knotsControls, spec.codec.endsWith('16u') ? 2 : 1)
        break
      case 'D3I1K32fC32f':
        offsets.knotsControls = writePayload(spec.knotsControls, 4)
        break
      case 'D4nK16uC15u':
      case 'D4nK8uC7u':
        offsets.knotsControls = writePayload(spec.knotsControls, spec.codec === 'D4nK16uC15u' ? 2 : 1)
        break
      case 'D9I1K16uC16u':
      case 'D9I1K8uC8u':
        offsets.knotsControls = writePayload(spec.knotsControls, spec.codec === 'D9I1K16uC16u' ? 2 : 1)
        break
      case 'D9I3K16uC16u':
      case 'D9I3K8uC8u':
        offsets.knotsControls = writePayload(spec.knotsControls, spec.codec === 'D9I3K16uC16u' ? 2 : 1)
        break
      default:
        break
    }

    const objectAt = sink.offset
    curveObjects.push({ spec, offset: objectAt })

    // Header inline struct: Format, Degree.
    sink.u8(CURVE_FORMATS[spec.codec] ?? 0)
    sink.u8(spec.degree ?? 0)
    switch (spec.codec) {
      case 'DaIdentity':
        sink.u16(spec.dimension)
        break
      case 'D3Constant32f':
      case 'D4Constant32f':
        sink.u16(0)
        for (const value of spec.controls) sink.f32(value)
        break
      case 'DaConstant32f':
        sink.u16(0)
        sink.u32(spec.controls.length)
        sink.u64(offsets.controls)
        break
      case 'DaK32fC32f':
        sink.u16(0)
        sink.u32(spec.knots.length)
        sink.u64(offsets.knots)
        sink.u32(spec.controls.length)
        sink.u64(offsets.controls)
        break
      case 'DaKeyframes32f':
        sink.u16(spec.dimension)
        sink.u32(spec.controls.length)
        sink.u64(offsets.controls)
        break
      case 'DaK16uC16u':
      case 'DaK8uC8u':
        sink.u16(truncHigh16(spec.oneOverKnotScaleTrunc))
        sink.u32(spec.controlScaleOffsets.length)
        sink.u64(offsets.controlScaleOffsets)
        sink.u32(spec.knotsControls.length)
        sink.u64(offsets.knotsControls)
        break
      case 'D3K16uC16u':
      case 'D3K8uC8u':
      case 'D3I1K16uC16u':
      case 'D3I1K8uC8u':
        sink.u16(spec.oneOverKnotScaleTrunc !== undefined ? truncHigh16(spec.oneOverKnotScaleTrunc) : 0)
        for (const value of spec.controlScales) sink.f32(value)
        for (const value of spec.controlOffsets) sink.f32(value)
        sink.u32(spec.knotsControls.length)
        sink.u64(offsets.knotsControls)
        break
      case 'D3I1K32fC32f':
        sink.u16(0)
        for (const value of spec.controlScales) sink.f32(value)
        for (const value of spec.controlOffsets) sink.f32(value)
        sink.u32(spec.knotsControls.length)
        sink.u64(offsets.knotsControls)
        break
      case 'D4nK16uC15u':
      case 'D4nK8uC7u':
        sink.u16(spec.scaleOffsetTableEntries)
        sink.f32(spec.oneOverKnotScale)
        sink.u32(spec.knotsControls.length)
        sink.u64(offsets.knotsControls)
        break
      case 'D9I1K16uC16u':
      case 'D9I1K8uC8u':
        sink.u16(truncHigh16(spec.oneOverKnotScaleTrunc))
        sink.f32(spec.controlScale)
        sink.f32(spec.controlOffset)
        sink.u32(spec.knotsControls.length)
        sink.u64(offsets.knotsControls)
        break
      case 'D9I3K16uC16u':
      case 'D9I3K8uC8u':
        sink.u16(truncHigh16(spec.oneOverKnotScaleTrunc))
        for (const value of spec.controlScales) sink.f32(value)
        for (const value of spec.controlOffsets) sink.f32(value)
        sink.u32(spec.knotsControls.length)
        sink.u64(offsets.knotsControls)
        break
      default:
        throw new Error(`fixture: unsupported curve codec ${(spec as CurveSpec).codec}`)
    }
  }

  // --- write: track arrays ----------------------------------------------
  // Distinct groups are written once; animations share their offsets.
  const groupOffsets = new Map<SyntheticTrackGroup, number>()
  const groupBlocks: Array<{ group: SyntheticTrackGroup; offset: number }> = []
  const curveOffsetOf = (spec: CurveSpec): number => {
    const found = curveObjects.find((entry) => entry.spec === spec)
    if (!found) throw new Error('fixture: curve was not planned')
    return found.offset
  }

  const writeCurveVariant = (spec: CurveSpec | undefined): void => {
    if (!spec) {
      sink.u64(0)
      sink.u64(0)
      return
    }
    sink.u64(chainOffsets.get(`curve:${spec.codec}`) ?? 0)
    sink.u64(curveOffsetOf(spec))
  }

  for (const animation of animations) {
    for (const group of animation.trackGroups) {
      if (groupOffsets.has(group)) continue

      // Vector track block (contiguous inline elements).
      const vectorTracks = group.vectorTracks ?? []
      const vectorBlockAt = sink.offset
      for (const track of vectorTracks) {
        sink.u64(intern(track.name))
        sink.u32(track.trackKey ?? 0)
        sink.u32(track.dimension)
        writeCurveVariant(track.curve)
      }

      // Transform track block.
      const transformBlockAt = sink.offset
      for (const track of group.transformTracks) {
        sink.u64(intern(track.name))
        sink.u32(track.flags ?? 0)
        writeCurveVariant(track.orientation)
        writeCurveVariant(track.position)
        writeCurveVariant(track.scaleShear)
      }

      // The group object itself. The LOD-error payload is written first so
      // the object's fields stay contiguous.
      const lodErrors = group.transformLODErrors ?? []
      const lodAt = lodErrors.length > 0 ? writePayload(lodErrors, 4) : 0
      const groupAt = sink.offset
      sink.u64(intern(group.name))
      sink.u32(vectorTracks.length)
      sink.u64(vectorTracks.length > 0 ? vectorBlockAt : 0)
      sink.u32(group.transformTracks.length)
      sink.u64(group.transformTracks.length > 0 ? transformBlockAt : 0)
      sink.u32(lodErrors.length)
      sink.u64(lodAt)
      sink.u32(group.textTrackCount ?? 0)
      sink.u64(0)
      // InitialPlacement: identity transform with the flags cleared.
      sink.u32(0)
      for (let i = 0; i < 3; i += 1) sink.f32(0)
      for (let i = 0; i < 4; i += 1) sink.f32(i === 3 ? 1 : 0)
      for (let i = 0; i < 9; i += 1) sink.f32(i % 4 === 0 ? 1 : 0)
      sink.u32(group.accumulationFlags ?? 0)
      const loop = group.loopTranslation ?? [0, 0, 0]
      for (const value of loop) sink.f32(value)
      sink.u64(0) // PeriodicLoop
      sink.u64(0) // ExtendedData variant type
      sink.u64(0) // ExtendedData variant object

      groupOffsets.set(group, groupAt)
      groupBlocks.push({ group, offset: groupAt })
    }
  }

  // --- write: per-animation group pointer arrays, animation objects -----
  const animationOffsets: number[] = []
  for (const animation of animations) {
    const pointerBlockAt = sink.offset
    for (const group of animation.trackGroups) sink.u64(groupOffsets.get(group) ?? 0)
    const animationAt = sink.offset
    animationOffsets.push(animationAt)
    sink.u64(intern(animation.name))
    sink.f32(animation.duration)
    sink.f32(animation.timeStep ?? 0)
    sink.f32(animation.oversampling ?? 1)
    sink.u32(animation.trackGroups.length)
    sink.u64(animation.trackGroups.length > 0 ? pointerBlockAt : 0)
    sink.u32(animation.defaultLoopCount ?? 0)
    sink.u32(animation.flags ?? 0)
    sink.u64(0) // ExtendedData
    sink.u64(0)
  }

  // Root TrackGroups array registers every distinct group object.
  const rootGroupBlockAt = sink.offset
  for (const entry of groupBlocks) sink.u64(entry.offset)
  const rootAnimationBlockAt = sink.offset
  for (const at of animationOffsets) sink.u64(at)
  const rootAt = sink.offset
  sink.u64(intern('animations'))
  sink.u64(intern(fileName))
  sink.u32(groupBlocks.length)
  sink.u64(groupBlocks.length > 0 ? rootGroupBlockAt : 0)
  sink.u32(animations.length)
  sink.u64(animations.length > 0 ? rootAnimationBlockAt : 0)
  sink.u64(0) // ExtendedData
  sink.u64(0)

  const merged = sink.finish()

  // --- wrap: header + one uncompressed section --------------------------
  // Header field offsets are measured in gr2.ts's readContainer:
  // 0x10 headerSize, 0x20 version, 0x24 totalSize, 0x28 crc,
  // 0x2c section-array offset (relative to 0x20), 0x30 sectionCount,
  // 0x34/0x38 rootType {section, offset}, 0x3c/0x40 rootObject, 0x44 typeTag.
  const sectionArrayAt = 0x48
  const dataOffset = 0x80
  const totalSize = dataOffset + merged.length
  const file = new ByteSink()
  const magic = [0x5e499be5, 0x141f636f, 0xa9eb131e, 0xc4edbe90]
  for (const word of magic) file.u32(word)
  file.u32(0x50) // 0x10 headerSize
  file.u32(0) // 0x14 reserved
  file.u32(0) // 0x18 reserved
  file.u32(0) // 0x1c reserved
  file.u32(7) // 0x20 version
  file.u32(totalSize) // 0x24
  file.u32(0) // 0x28 crc (not checked by the loader)
  file.u32(sectionArrayAt - 0x20) // 0x2c section-array offset
  file.u32(1) // 0x30 sectionCount
  file.u32(0) // 0x34 rootType.section
  file.u32(chainOffsets.get('root') ?? 0) // 0x38 rootType.offset
  file.u32(0) // 0x3c rootObject.section
  file.u32(rootAt) // 0x40 rootObject.offset
  file.u32(0) // 0x44 typeTag
  // Section record (44 bytes) at 0x48.
  file.u32(0) // compression: none
  file.u32(dataOffset)
  file.u32(merged.length)
  file.u32(merged.length)
  file.u32(0) // alignment
  file.u32(0) // first16bit
  file.u32(0) // first8bit
  file.u32(0) // fixupOffset
  file.u32(0) // fixupCount
  file.u32(0) // mixedMarshallingOffset
  file.u32(0) // mixedMarshallingCount
  // Pad to dataOffset, then the section payload.
  while (file.offset < dataOffset) file.u8(0)
  file.raw(merged)
  return file.finish()
}
