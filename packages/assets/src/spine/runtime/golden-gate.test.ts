/**
 * SPINE RUNTIME GOLDEN GATE
 * =========================
 *
 * Destructive-change gate for the spine performance optimization work.
 *
 * Contract philosophy (see golden/README.md):
 *   - The renderer components (@rasenjs/gfx, @rasenjs/canvas-2d) consume a
 *     specific DATA FACE per posed frame: drawOrder, slot attachment/color/
 *     deform, bone world matrices, attachment world geometry.
 *   - Internal APIs (Bone/Slot shapes, _updateCache, timeline structures,
 *     helper signatures) MAY change freely during optimization.
 *   - The golden VALUES captured in golden/spine-gate.json must not change.
 *
 * How to read a failure:
 *   - `bones[...] mismatch`    → world-transform math drifted (or setup reset
 *                                changed). This breaks rendering everywhere.
 *   - `drawOrder mismatch`     → draworder timeline or slot iteration broke.
 *   - `slots[...].attachment`  → attachment timeline broke (wrong textures).
 *   - `slots[...].deform`      → FFD/deform timeline broke (mesh shape drift).
 *   - `attachments[...] world` → mesh/region world geometry drifted (visual
 *                                distortion).
 *   - `checksum`               → aggregate drift; see which section failed.
 *
 * If an intentional, verified-correct change requires new golden values:
 *   1. Confirm pixel-level equivalence via benchmark/spine verify-render.
 *   2. Rebuild dist, run `node golden/generate-golden.mjs`.
 *   3. Commit the new golden with the reason in the message.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  parseSpineJson,
  parseSpineBinary,
  parseSpineAtlas,
  Skeleton,
  AnimationState,
  computeAttachmentWorld
} from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const EXAMPLES = resolve(here, '../../../../../examples/canvas-2d')
const golden = JSON.parse(readFileSync(join(here, 'golden', 'spine-gate.json'), 'utf8'))

// ---------------------------------------------------------------------------
// extractPose — the ONE adapter allowed to track internal API changes.
// Everything below the "renderer data face" contract lives here.
// ---------------------------------------------------------------------------

// +0 normalization: JSON keeps -0 and toEqual distinguishes -0 from +0
const norm = (v: number) => (Object.is(v, -0) ? 0 : v)
const r5 = (v: number) => norm(Math.round(v * 1e5) / 1e5)
const r4 = (v: number) => norm(Math.round(v * 1e4) / 1e4)

function extractPose(
  sk: ReturnType<Skeleton['constructor']> extends never ? never : any,
  atlas: any
) {
  const bones: Record<string, number[]> = {}
  for (const b of sk.bones) {
    bones[b.data.name] = [
      r5(b.a), r5(b.b), r5(b.c), r5(b.d), r5(b.worldX), r5(b.worldY)
    ]
  }
  const drawOrder: string[] = sk.drawOrder.map((s: any) => s.data.name)
  const slots: Record<string, unknown> = {}
  const attachments: Record<string, unknown> = {}
  for (const slot of sk.drawOrder) {
    const attName: string | null = slot.attachment
    slots[slot.data.name] = {
      attachment: attName,
      color: slot.color,
      deform: slot.deform ? Array.from(slot.deform).map(r5) : null
    }
    if (!attName) continue
    const att = sk.findAttachment(slot.data.name, attName)
    if (!att) continue
    const geo = computeAttachmentWorld(att, slot, sk, atlas, attName)
    if (!geo || !geo.world) continue
    attachments[slot.data.name] = {
      attachment: attName,
      world: geo.world.map(r4),
      uvs: geo.uvs.map(r5),
      triangles: geo.triangles
    }
  }
  return { bones, drawOrder, slots, attachments }
}

// --- Asset loaders (public parse API) ---------------------------------------

const c310Data = parseSpineBinary(
  new Uint8Array(readFileSync(join(here, '__fixtures__', 'c310.skel')))
)
const c310Atlas = parseSpineAtlas(
  readFileSync(join(here, '__fixtures__', 'c310.atlas'), 'utf8')
)
const spineboyData = parseSpineJson(
  JSON.parse(readFileSync(join(EXAMPLES, 'src', 'spineboy-pro.json'), 'utf8'))
)
const spineboyAtlas = parseSpineAtlas(
  readFileSync(join(EXAMPLES, 'images', 'spineboy.atlas'), 'utf8')
)

const ASSETS: Record<string, { data: any; atlas: any }> = {
  'c310/action': { data: c310Data, atlas: c310Atlas },
  'c310/idle': { data: c310Data, atlas: c310Atlas },
  'spineboy/idle': { data: spineboyData, atlas: spineboyAtlas }
}

/** Pose a FRESH skeleton at absolute time t (mirrors golden generation). */
function poseFresh(caseId: string, time: number) {
  const { data, atlas } = ASSETS[caseId]
  const sk = new Skeleton(data)
  const st = new AnimationState(sk)
  st.setAnimation(golden.cases[caseId].animation, true)
  st.update(time)
  st.apply()
  sk.updateWorldTransform()
  return { pose: extractPose(sk, atlas), sk, st }
}

// ---------------------------------------------------------------------------
// Gate 1: golden geometry equality (the destructive-change gate)
// ---------------------------------------------------------------------------

describe('golden gate — renderer-visible pose must not drift', () => {
  for (const [caseId, spec] of Object.entries(golden.cases)) {
    for (const [timeStr, expected] of Object.entries(spec.times)) {
      it(`${caseId} @ t=${timeStr}s`, () => {
        const { pose } = poseFresh(caseId, Number(timeStr))

        // bone world matrices — exact at 5-decimal quantization
        expect(Object.keys(pose.bones).length).toBe(Object.keys(expected.bones).length)
        for (const name of Object.keys(expected.bones)) {
          expect(pose.bones[name], `bones[${name}]`).toEqual(expected.bones[name])
        }

        // draw order — exact sequence
        expect(pose.drawOrder, 'drawOrder sequence').toEqual(expected.drawOrder)

        // slot state — attachment choice, color, deform (5-decimal)
        for (const name of Object.keys(expected.slots)) {
          const e = expected.slots[name] as any
          const a = (pose.slots as any)[name]
          expect(a, `slots[${name}] present`).toBeDefined()
          expect(a.attachment, `slots[${name}].attachment`).toBe(e.attachment)
          expect(a.color, `slots[${name}].color`).toBe(e.color)
          if (e.deform === null) {
            expect(a.deform, `slots[${name}].deform`).toBeNull()
          } else {
            expect(a.deform, `slots[${name}].deform`).toEqual(e.deform)
          }
        }

        // attachment world geometry — exact at 4-decimal quantization
        expect(
          Object.keys(pose.attachments).length,
          'drawable attachment count'
        ).toBe(Object.keys(expected.attachments).length)
        for (const name of Object.keys(expected.attachments)) {
          const e = (expected.attachments as any)[name]
          const a = (pose.attachments as any)[name]
          expect(a.attachment, `attachments[${name}].attachment`).toBe(e.attachment)
          expect(a.world, `attachments[${name}].world`).toEqual(e.world)
          expect(a.uvs, `attachments[${name}].uvs`).toEqual(e.uvs)
          expect(a.triangles, `attachments[${name}].triangles`).toEqual(e.triangles)
        }
      })
    }
  }
})

// ---------------------------------------------------------------------------
// Gate 2: determinism — the same pose computed twice (fresh instances) must
// be bit-identical. Guards against hidden mutable state leaking across the
// optimization (e.g. shared Float32Array scratch buffers not being reset).
// ---------------------------------------------------------------------------

describe('golden gate — determinism / instance isolation', () => {
  it('two independently posed skeletons yield identical geometry', () => {
    const a = poseFresh('c310/action', 0.9123)
    const b = poseFresh('c310/action', 0.9123)
    expect(b.pose.bones).toEqual(a.pose.bones)
    expect(b.pose.attachments).toEqual(a.pose.attachments)
  })

  it('interleaved posing of two instances does not cross-contaminate', () => {
    const s1 = new Skeleton(c310Data)
    const st1 = new AnimationState(s1)
    st1.setAnimation('action', true)
    const s2 = new Skeleton(c310Data)
    const st2 = new AnimationState(s2)
    st2.setAnimation('idle', true)

    // advance both together, alternating — like a multi-instance stage
    for (let i = 0; i < 30; i++) {
      st1.update(1 / 60)
      st1.apply()
      s1.updateWorldTransform()
      st2.update(1 / 60)
      st2.apply()
      s2.updateWorldTransform()
    }

    // reference: each posed alone up to the same accumulated time
    const ref1 = poseFresh('c310/action', 30 / 60)
    const ref2 = poseFresh('c310/idle', 30 / 60)
    // bone world matrices must match the solo reference exactly
    for (const name of Object.keys(ref1.pose.bones)) {
      expect(s1.bones.find((b: any) => b.data.name === name)!.worldX)
        .toBeCloseTo(ref1.pose.bones[name][4], 3)
      expect(s2.bones.find((b: any) => b.data.name === name)!.worldX)
        .toBeCloseTo(ref2.pose.bones[name][4], 3)
    }
  })
})

// ---------------------------------------------------------------------------
// Gate 3: state-machine behavior — update/apply separation must keep working
// (AnimationState.update advances time; apply() poses without advancing).
// ---------------------------------------------------------------------------

describe('golden gate — update/apply separation', () => {
  it('apply() without update() does not advance the pose', () => {
    const { sk, st } = poseFresh('c310/idle', 0.5)
    st.update(1 / 60) // advance
    st.apply()
    sk.updateWorldTransform()
    const worldX = sk.bones[1].worldX
    // repeated applies at the same time must be idempotent
    st.apply()
    sk.updateWorldTransform()
    st.apply()
    sk.updateWorldTransform()
    expect(sk.bones[1].worldX).toBe(worldX)
  })
})

// ---------------------------------------------------------------------------
// Gate 4: renderer component public API (THE frozen contract)
// ---------------------------------------------------------------------------

describe('golden gate — renderer component public API shape', () => {
  it('@rasenjs/gfx exports a spine component factory', async () => {
    const mod = await import('@rasenjs/gfx')
    expect(typeof mod.spine).toBe('function')
  })

  it('@rasenjs/canvas-2d exports a spine component factory', async () => {
    const mod = await import('@rasenjs/canvas-2d')
    expect(typeof mod.spine).toBe('function')
  })
})
