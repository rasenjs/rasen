import { describe, expect, it } from 'vitest'
import { buildAnimationGr2, type CurveSpec, type SyntheticAnimation } from './fixtures/build-gr2-anim-fixture'
import { loadGr2Animations, type Gr2Curve, type Gr2TransformTrack } from '@rasenjs/assets'

/**
 * The tests build synthetic `.animations` containers with hand-computed raw
 * payloads (see `fixtures/build-gr2-anim-fixture.ts`) so every codec's
 * decode math is asserted against values worked out from the format rules,
 * not from the implementation under test. Curves are emitted with degree 1
 * where control values matter: a degree-1 curve interpolates its controls,
 * so `evaluate(knots[i])` is exactly the dequantized control `i`.
 */

function loadCurve(spec: CurveSpec, degree = 1): Gr2Curve {
  const bytes = buildAnimationGr2([
    {
      name: 'clip',
      duration: 1,
      trackGroups: [
        {
          name: 'group',
          transformTracks: [{ name: 'bone', orientation: { ...spec, degree } }],
        },
      ],
    },
  ])
  const set = loadGr2Animations(bytes)
  const track = set.animations[0].trackGroups[0].transformTracks[0]
  expect(track.orientation).toBeDefined()
  return track.orientation!
}

function loadTrack(orientation: CurveSpec | undefined, position?: CurveSpec, scaleShear?: CurveSpec): Gr2TransformTrack {
  const bytes = buildAnimationGr2([
    {
      name: 'clip',
      duration: 1,
      trackGroups: [{ name: 'group', transformTracks: [{ name: 'bone', orientation, position, scaleShear }] }],
    },
  ])
  return loadGr2Animations(bytes).animations[0].trackGroups[0].transformTracks[0]
}

describe('gr2-anim container walk', () => {
  it('rejects a file that is not a Granny container', () => {
    expect(() => loadGr2Animations(new Uint8Array(512))).toThrow(/magic|Granny/)
  })

  it('reads the animation and track-group fields the file stores', () => {
    const group: SyntheticAnimation['trackGroups'][number] = {
      name: 'root',
      transformTracks: [{ name: 'Bip01', flags: 3 }],
      vectorTracks: [{ name: 'L_IK_positionX', trackKey: 2794746922, dimension: 1 }],
      transformLODErrors: [0.25, 0.5],
      textTrackCount: 2,
      accumulationFlags: 5,
      loopTranslation: [1, 2, 3],
    }
    const bytes = buildAnimationGr2([
      {
        name: 'attack1',
        duration: 0.7666667699813843,
        timeStep: 0.004761905409395695,
        oversampling: 7,
        defaultLoopCount: 1,
        flags: 1,
        trackGroups: [group],
      },
    ])
    const set = loadGr2Animations(bytes)
    expect(set.fromFileName).toBe('fixture.animations')
    expect(set.animations).toHaveLength(1)
    const animation = set.animations[0]
    expect(animation.name).toBe('attack1')
    expect(animation.duration).toBeCloseTo(0.76666677, 6)
    expect(animation.timeStep).toBeCloseTo(0.0047619, 6)
    expect(animation.oversampling).toBe(7)
    expect(animation.defaultLoopCount).toBe(1)
    expect(animation.flags).toBe(1)

    const decodedGroup = animation.trackGroups[0]
    expect(decodedGroup.name).toBe('root')
    expect(decodedGroup.accumulationFlags).toBe(5)
    expect(decodedGroup.loopTranslation).toEqual([1, 2, 3])
    expect(decodedGroup.textTrackCount).toBe(2)
    expect(decodedGroup.transformLODErrors).toEqual([0.25, 0.5])
    expect(decodedGroup.initialPlacement.hasPosition).toBe(false)
    expect(decodedGroup.initialPlacement.orientation).toEqual([0, 0, 0, 1])

    const track = decodedGroup.transformTracks[0]
    expect(track.name).toBe('Bip01')
    expect(track.flags).toBe(3)
    expect(track.orientation).toBeUndefined()
    expect(track.position).toBeUndefined()
    expect(track.scaleShear).toBeUndefined()

    const vector = decodedGroup.vectorTracks[0]
    expect(vector.name).toBe('L_IK_positionX')
    expect(vector.trackKey).toBe(2794746922)
    expect(vector.dimension).toBe(1)
    expect(vector.curve).toBeUndefined()
  })

  it('decodes track groups referenced by several animations once', () => {
    const group: SyntheticAnimation['trackGroups'][number] = {
      name: 'root',
      transformTracks: [{ name: 'bone', position: { codec: 'D3Constant32f', controls: [1, 2, 3] } }],
    }
    const bytes = buildAnimationGr2([
      { name: 'attack1', duration: 1, trackGroups: [group] },
      { name: 'attack2', duration: 2, trackGroups: [group] },
    ])
    const set = loadGr2Animations(bytes)
    expect(set.animations).toHaveLength(2)
    expect(set.trackGroupCount).toBe(1)
    expect(set.distinctTrackGroupCount).toBe(1)
    expect(set.animations[0].trackGroups[0]).toBe(set.animations[1].trackGroups[0])
  })

  it('names an unsupported curve codec instead of dropping the curve', () => {
    const bytes = buildAnimationGr2([
      {
        name: 'clip',
        duration: 1,
        trackGroups: [
          {
            name: 'group',
            transformTracks: [
              {
                name: 'bone',
                orientation: { codec: 'DaKeyframes32f', dimension: 4, controls: [0, 0, 0, 1] },
              },
            ],
          },
        ],
      },
    ])
    expect(() => loadGr2Animations(bytes)).toThrow(/unsupported curve codec CurveDataHeader_DaKeyframes32f/)
  })
})

describe('gr2-anim constant and identity codecs', () => {
  it('DaIdentity samples the semantic identity for its dimension', () => {
    expect(loadCurve({ codec: 'DaIdentity', dimension: 4 }).evaluate(0.5)).toEqual([0, 0, 0, 1])
    expect(loadCurve({ codec: 'DaIdentity', dimension: 9 }).evaluate(0.5)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1])
    expect(loadCurve({ codec: 'DaIdentity', dimension: 3 }).evaluate(0.5)).toEqual([0, 0, 0])
  })

  it('D3Constant32f / D4Constant32f return the stored value', () => {
    const three = loadCurve({ codec: 'D3Constant32f', controls: [1.5, -2, 3.25] })
    expect(three.dimension).toBe(3)
    expect(three.knots).toEqual([])
    expect(three.evaluate(0)).toEqual([1.5, -2, 3.25])
    expect(three.evaluate(99)).toEqual([1.5, -2, 3.25])

    // Hand-computed: [0, 0, 0, 2] normalizes to the unit quaternion.
    const four = loadCurve({ codec: 'D4Constant32f', controls: [0, 0, 0, 2] })
    expect(four.dimension).toBe(4)
    expect(four.evaluate(0)[3]).toBeCloseTo(1, 12)
  })

  it('DaConstant32f reads its payload array (dimension 9)', () => {
    const curve = loadCurve({ codec: 'DaConstant32f', controls: [2, 0, 0, 0, 2, 0, 0, 0, 2] })
    expect(curve.dimension).toBe(9)
    expect(curve.evaluate(0)).toEqual([2, 0, 0, 0, 2, 0, 0, 0, 2])
  })
})

describe('gr2-anim unquantized knot/control codecs', () => {
  it('DaK32fC32f interpolates its controls (degree 1)', () => {
    // Hand-computed: controls are 3-vectors at knots 0, 0.5, 1.
    const curve = loadCurve({
      codec: 'DaK32fC32f',
      knots: [0, 0.5, 1],
      controls: [0, 10, 20, 1, 11, 21, 2, 12, 22],
    })
    expect(curve.dimension).toBe(9 / 3)
    expect(curve.knots).toEqual([0, 0.5, 1])
    expect(curve.evaluate(0)).toEqual([0, 10, 20])
    expect(curve.evaluate(0.5)).toEqual([1, 11, 21])
    expect(curve.evaluate(1)).toEqual([2, 12, 22])
    expect(curve.evaluate(0.25)).toEqual([0.5, 10.5, 20.5])
  })
})

describe('gr2-anim quantized knot/control codecs', () => {
  it('DaK16uC16u dequantizes knots and per-dimension scale/offsets', () => {
    // Hand-computed: dimension = ControlScaleOffsets / 2 = 2,
    // scales [2, 3], offsets [10, 20], oneOverKnotScaleTrunc = 256.
    const curve = loadCurve({
      codec: 'DaK16uC16u',
      oneOverKnotScaleTrunc: 256,
      controlScaleOffsets: [2, 3, 10, 20],
      knotsControls: [0, 128, 5, 7, 9, 11],
    })
    expect(curve.dimension).toBe(2)
    expect(curve.knots[0]).toBeCloseTo(0, 12)
    expect(curve.knots[1]).toBeCloseTo(0.5, 6)
    expect(curve.evaluate(0)).toEqual([20, 41])
    expect(curve.evaluate(0.5)).toEqual([28, 53])
    expect(curve.evaluate(0.25)).toEqual([24, 47])
  })

  it('DaK8uC8u matches the 16-bit decode with 8-bit payloads', () => {
    const curve = loadCurve({
      codec: 'DaK8uC8u',
      oneOverKnotScaleTrunc: 256,
      controlScaleOffsets: [2, 3, 10, 20],
      knotsControls: [0, 128, 5, 7, 9, 11],
    })
    expect(curve.knots[1]).toBeCloseTo(0.5, 6)
    expect(curve.evaluate(0)).toEqual([20, 41])
    expect(curve.evaluate(0.5)).toEqual([28, 53])
  })

  it('D3K16uC16u / D3K8uC8u use the fixed 3-wide scale/offset pairs', () => {
    // Hand-computed: scales [1, 2, 4], offsets [100, 200, 300], knots at
    // 64/64 = 1 and 128/64 = 2; controls [1, 2, 3] then [4, 5, 6].
    const expected = {
      knots: [1, 2],
      first: [101, 204, 312],
      second: [104, 210, 324],
    }
    for (const codec of ['D3K16uC16u', 'D3K8uC8u'] as const) {
      const curve = loadCurve({
        codec,
        oneOverKnotScaleTrunc: 64,
        controlScales: [1, 2, 4],
        controlOffsets: [100, 200, 300],
        knotsControls: [64, 128, 1, 2, 3, 4, 5, 6],
      })
      expect(curve.dimension).toBe(3)
      expect(curve.knots[0]).toBeCloseTo(expected.knots[0], 6)
      expect(curve.knots[1]).toBeCloseTo(expected.knots[1], 6)
      expect(curve.evaluate(1)).toEqual(expected.first)
      expect(curve.evaluate(2)).toEqual(expected.second)
    }
  })

  it('D3I1K16uC16u / D3I1K8uC8u broadcast one parameter per knot', () => {
    // Hand-computed: one quantized parameter 5 then 7, affine per dimension.
    const expected = { first: [15, 30, 45], second: [17, 34, 51] }
    for (const codec of ['D3I1K16uC16u', 'D3I1K8uC8u'] as const) {
      const curve = loadCurve({
        codec,
        oneOverKnotScaleTrunc: 32,
        controlScales: [1, 2, 3],
        controlOffsets: [10, 20, 30],
        knotsControls: [32, 96, 5, 7],
      })
      expect(curve.knots[0]).toBeCloseTo(1, 6)
      expect(curve.knots[1]).toBeCloseTo(3, 6)
      expect(curve.evaluate(1)).toEqual(expected.first)
      expect(curve.evaluate(3)).toEqual(expected.second)
    }
  })

  it('D3I1K32fC32f stores float knots and one float parameter per knot', () => {
    const curve = loadCurve({
      codec: 'D3I1K32fC32f',
      controlScales: [1, 2, 3],
      controlOffsets: [10, 20, 30],
      knotsControls: [0, 2, 5, 7],
    })
    expect(curve.knots).toEqual([0, 2])
    expect(curve.evaluate(0)).toEqual([15, 30, 45])
    expect(curve.evaluate(2)).toEqual([17, 34, 51])
    expect(curve.evaluate(1)).toEqual([16, 32, 48])
  })

  it('D4nK16uC15u recovers the dropped quaternion component', () => {
    // Scale/offset table nibble 7 scales by (1/(4*sqrt(2))) per unit.
    // Knot 0: all magnitudes zero, missing component Z (index bits 10b),
    // positive -> [0, 0, 1, 0]. Knot 1: magnitude 32767 stored for the X
    // component (data[1], which also carries the index MSB) -> X = 1/(4*sqrt(2)),
    // Z = +sqrt(1 - X^2).
    const curve = loadCurve({
      codec: 'D4nK16uC15u',
      scaleOffsetTableEntries: 0x7777,
      oneOverKnotScale: 100,
      knotsControls: [0, 100, 0x0000, 0x8000, 0x0000, 0x0000, 0xffff, 0x0000],
    })
    expect(curve.dimension).toBe(4)
    expect(curve.knots[1]).toBeCloseTo(1, 6)

    const first = curve.evaluate(0)
    expect(first[0]).toBeCloseTo(0, 12)
    expect(first[1]).toBeCloseTo(0, 12)
    expect(first[2]).toBeCloseTo(1, 12)
    expect(first[3]).toBeCloseTo(0, 12)

    const second = curve.evaluate(1)
    const x = 0.707106781 * 0.25
    expect(second[0]).toBeCloseTo(x, 6)
    expect(second[1]).toBeCloseTo(0, 12)
    expect(second[2]).toBeCloseTo(Math.sqrt(1 - x * x), 6)
    expect(second[3]).toBeCloseTo(0, 12)
    expect(Math.hypot(...second)).toBeCloseTo(1, 6)
  })

  it('D4nK8uC7u matches the 15-bit decode with 7-bit payloads', () => {
    const curve = loadCurve({
      codec: 'D4nK8uC7u',
      scaleOffsetTableEntries: 0x7777,
      oneOverKnotScale: 100,
      knotsControls: [0, 100, 0x00, 0x80, 0x00, 0x00, 0xff, 0x00],
    })
    const first = curve.evaluate(0)
    expect(first[2]).toBeCloseTo(1, 12)
    const second = curve.evaluate(1)
    const x = 0.707106781 * 0.25
    expect(second[0]).toBeCloseTo(x, 6)
    expect(second[2]).toBeCloseTo(Math.sqrt(1 - x * x), 6)
    expect(Math.hypot(...second)).toBeCloseTo(1, 6)
  })

  it('D9I1K16uC16u / D9I1K8uC8u express uniform scale as a diagonal', () => {
    for (const codec of ['D9I1K16uC16u', 'D9I1K8uC8u'] as const) {
      const curve = loadCurve({
        codec,
        oneOverKnotScaleTrunc: 50,
        controlScale: 2,
        controlOffset: 10,
        knotsControls: [50, 150, 3, 4],
      })
      expect(curve.dimension).toBe(9)
      expect(curve.knots[0]).toBeCloseTo(1, 6)
      expect(curve.evaluate(1)).toEqual([16, 0, 0, 0, 16, 0, 0, 0, 16])
      expect(curve.evaluate(3)).toEqual([18, 0, 0, 0, 18, 0, 0, 0, 18])
    }
  })

  it('D9I3K16uC16u / D9I3K8uC8u express per-axis scale as a diagonal', () => {
    for (const codec of ['D9I3K16uC16u', 'D9I3K8uC8u'] as const) {
      const curve = loadCurve({
        codec,
        oneOverKnotScaleTrunc: 50,
        controlScales: [1, 2, 3],
        controlOffsets: [10, 20, 30],
        knotsControls: [50, 150, 1, 2, 3, 4, 5, 6],
      })
      expect(curve.evaluate(1)).toEqual([11, 0, 0, 0, 24, 0, 0, 0, 39])
      expect(curve.evaluate(3)).toEqual([14, 0, 0, 0, 30, 0, 0, 0, 48])
    }
  })
})

describe('gr2-anim curve evaluation', () => {
  it('is linear between controls for degree 1 and clamps outside the knot range', () => {
    const curve = loadCurve(
      { codec: 'DaK32fC32f', knots: [0, 1], controls: [0, 10] },
      1,
    )
    expect(curve.evaluate(-5)).toEqual(curve.evaluate(0))
    expect(curve.evaluate(50)).toEqual(curve.evaluate(1))
    expect(curve.evaluate(0.25)[0]).toBeCloseTo(2.5, 12)
    expect(curve.evaluate(0.75)[0]).toBeCloseTo(7.5, 12)
  })

  it('evaluates a degree-2 curve as a quadratic spline (cited scheme)', () => {
    // Hand-computed from the degree-2 basis over knots [0, 1, 2] with
    // controls [0, 10, 10]: the curve hits 0 at t=0, 5 at t=1 (midpoint of
    // the first two controls), 8.75 at t=1.5, and the last control 10 at
    // the far end.
    const curve = loadCurve({ codec: 'DaK32fC32f', knots: [0, 1, 2], controls: [0, 10, 10] }, 2)
    expect(curve.degree).toBe(2)
    expect(curve.evaluate(0)[0]).toBeCloseTo(0, 12)
    expect(curve.evaluate(1)[0]).toBeCloseTo(5, 12)
    expect(curve.evaluate(1.5)[0]).toBeCloseTo(8.75, 12)
    expect(curve.evaluate(2)[0]).toBeCloseTo(10, 12)
  })

  it('steps to the next control for degree 0 (cited step convention)', () => {
    const curve = loadCurve({ codec: 'DaK32fC32f', knots: [0, 1, 2], controls: [0, 10, 20] }, 0)
    expect(curve.evaluate(0)[0]).toBeCloseTo(10, 12)
    expect(curve.evaluate(1.9)[0]).toBeCloseTo(20, 12)
    expect(curve.evaluate(2)[0]).toBeCloseTo(20, 12)
  })

  it('normalizes orientation curves after blending', () => {
    // Two non-parallel unit quaternions; the mid-blend must come back unit.
    const track = loadTrack({
      codec: 'DaK32fC32f',
      knots: [0, 1],
      controls: [0, 0, 0, 1, 0, 0.6, 0, 0.8],
    })
    const mid = track.orientation!.evaluate(0.5)
    expect(Math.hypot(...mid)).toBeCloseTo(1, 12)
    const range = [...Array(11).keys()].map((i) => track.orientation!.evaluate(i / 10))
    for (const value of range) {
      expect(value.every((component) => Number.isFinite(component))).toBe(true)
      expect(Math.hypot(...value)).toBeCloseTo(1, 12)
    }
  })

  it('keeps D4n orientation curves unit over the whole range', () => {
    const track = loadTrack({
      codec: 'D4nK16uC15u',
      scaleOffsetTableEntries: 0x7777,
      oneOverKnotScale: 20,
      // Knots 0, 0.5, 1; alternating missing-component indices and signs.
      knotsControls: [0, 10, 20, 0x0000, 0x8000, 0x0000, 0x8000, 0x0000, 0x4000, 0x0000, 0x0000, 0x8000],
    })
    for (let i = 0; i <= 20; i += 1) {
      const value = track.orientation!.evaluate(i / 20)
      expect(value.every((component) => Number.isFinite(component))).toBe(true)
      expect(Math.hypot(...value)).toBeCloseTo(1, 12)
    }
  })
})
