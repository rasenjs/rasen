/**
 * Spine runtime micro-benchmark — isolates the CPU cost of pose solving /
 * timeline application from the GL/canvas rendering path.
 *
 * Use to quantify where Rasen's spine runtime differs from official
 * spine-ts, and to track per-step improvements (setToSetupPose hot path,
 * computeAttachmentWorldVertices hot loop, etc.) without spinning up a
 * browser or the WebGL pipeline.
 *
 * Output format: per-instance-per-frame mean ms broken down by phase:
 *   setToSetupPose | applyAnimation | updateWorldTransform | computeAttach..
 * Plus a grand total per instance.
 *
 * Run with: yarn workspace @rasenjs/assets test -- runtime-bench
 */

import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseSpineJsonString } from '../parsers/spine-json'
import { Skeleton, boneUpdateWorldTransformWith } from './skeleton'
import { AnimationState } from './animation'
import { computeAttachmentWorldVertices } from '../parsers/atlas'
import type { SpineAtlas } from '../parsers/atlas'

const here = dirname(fileURLToPath(import.meta.url))
const RAW = readFileSync(join(here, '__fixtures__', 'spineboy-pro.json'), 'utf8')
const data = parseSpineJsonString(RAW)
const c310RAW = readFileSync(join(here, '__fixtures__', 'c310.atlas'), 'utf8')
const c310Atlas: SpineAtlas = {
  pages: [{ name: 'c310_00', format: 'png', pma: true }],
  regions: {
    /* minimal stub — the c310 mesh we use (filtered by spine, no atlas
       regions actually needed) doesn't hit computeAttachmentWorldVertices
       per-vertex loop; the spineboy-pro fixture is what exercises that
       hot loop. We use it for the integration aspect of this test only. */
  },
}

const INSTANCES = 200
const WARMUP_TICKS = 60
const SAMPLE_TICKS = 600

interface PhaseStats {
  name: string
  totalMs: number
  perInstancePerFrameMs: number
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

function makeInstance() {
  const sk = new Skeleton(data)
  const st = new AnimationState(sk)
  st.setAnimation('run', true)
  return { sk, st }
}

describe('spine runtime micro-benchmark (Rasen)', () => {
  it(`runtime cost per instance per frame @ ${INSTANCES} instances`, () => {
    // Build the instance pool up-front (one-shot cost, not measured).
    const pool: ReturnType<typeof makeInstance>[] = []
    for (let i = 0; i < INSTANCES; i++) pool.push(makeInstance())

    // Warmup (cache compiled timelines, JIT).
    for (let t = 0; t < WARMUP_TICKS; t++) {
      for (const { st } of pool) {
        st.update(1 / 60)
        st.apply()
      }
    }

    // Time-bucket each phase across the pool.
    const phase = (name: string): PhaseStats => {
      const samples: number[] = []
      let acc = 0
      for (let t = 0; t < SAMPLE_TICKS; t++) {
        const t0 = performance.now()
        for (const { sk, st } of pool) {
          if (name === 'st.update') st.update(1 / 60)
          else if (name === 'st.apply') st.apply()
          else if (name === 'sk.setToSetupPose') sk.setToSetupPose()
          else if (name === 'sk.updateWorldTransform') sk.updateWorldTransform()
          else if (name === 'boneUpdateWorldTransformWith-direct') {
            // Direct hot-loop call for one bone — used to micro-bench the
            // affine math in isolation from cache walks.
            boneUpdateWorldTransformWith(pool[0].sk.bones[0], 0, 0, 0, 1, 1, 0, 0)
          } else if (name === 'computeAttachmentWorldVertices') {
            const inst = pool[0]
            const slot = inst.sk.slots[0]
            const att = slot.attachment ? { type: 'region', path: '', name: '' } : null
            const out = new Float32Array(8)
            if (att) computeAttachmentWorldVertices(att as never, slot, inst.sk, c310Atlas, undefined, out)
          }
        }
        const dt = performance.now() - t0
        samples.push(dt)
        acc += dt
      }
      const avg = mean(samples)
      return {
        name,
        totalMs: acc,
        perInstancePerFrameMs: avg / INSTANCES
      }
    }

    // Order matters — st.apply depends on st.update's time advance.
    const phases = [
      phase('st.update'),
      phase('st.apply'),
      phase('sk.setToSetupPose'),
      phase('sk.updateWorldTransform'),
      phase('boneUpdateWorldTransformWith-direct'),
      phase('computeAttachmentWorldVertices'),
    ]

    // Build the report.
    const lines: string[] = []
    lines.push('')
    lines.push(`=== Rasen spine runtime @ ${INSTANCES} instances ===`)
    lines.push(`  warmup ${WARMUP_TICKS} ticks · sample ${SAMPLE_TICKS} ticks (1/60 s each)`)
    lines.push('')
    lines.push('  per-instance-per-frame (μs / total ms over sample):')
    for (const p of phases) {
      const us = (p.perInstancePerFrameMs * 1000).toFixed(2)
      const total = p.totalMs.toFixed(2)
      lines.push(`    ${p.name.padEnd(36)} ${us.padStart(8)} μs   total ${total} ms`)
    }

    // Compute the per-instance "tickInstances" wall time. Our apply() ends
    // with updateWorldTransform, so the chain is update+apply — matching the
    // fixed bench pages. (The official chain below adds an explicit uwt
    // because the official apply() does not include one — same logical work.)
    const tickSamples: number[] = []
    for (let t = 0; t < SAMPLE_TICKS; t++) {
      const t0 = performance.now()
      for (const { st } of pool) {
        st.update(1 / 60)
        st.apply()
      }
      tickSamples.push((performance.now() - t0) / INSTANCES)
    }
    const tickMean = mean(tickSamples)
    lines.push('')
    lines.push(`  tickInstances full chain     ${(tickMean * 1000).toFixed(2)} μs / instance / frame`)
    lines.push('')
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'))

    // The benchmark should produce measurements — non-zero totalMs across
    // every phase (assertions are loose; this is a measurement tool, not
    // a regression gate).
    if (phases.every((p) => p.totalMs <= 0)) {
      throw new Error('all phases measured 0 ms — benchmark did not run')
    }
  }, 120_000)

  // -------------------------------------------------------------------------
  // Official spine-core comparison — SAME fixture, SAME protocol, pure JS.
  // Answers "how far is our runtime from official at the JS layer" with zero
  // renderer/reactivity in the picture. @esotericsoftware/spine-core is a
  // benchmark dev-dependency (hoisted to root node_modules); resolved
  // dynamically so the assets package itself keeps no dependency on it.
  // -------------------------------------------------------------------------
  it(`official spine-core comparison @ ${INSTANCES} instances`, async () => {
    let core: any
    try {
      core = await import('@esotericsoftware/spine-core')
    } catch {
      // Not resolvable in this workspace layout — skip rather than fail.
      console.log('\n(official spine-core not resolvable — comparison skipped)')
      return
    }

    // No-op attachment loader: the comparison measures pose solving only, so
    // attachments just need to exist (never rendered / region-set).
    const loader = new (class {
      newRegionAttachment(_skin: unknown, name: string) { return new core.RegionAttachment(name) }
      newMeshAttachment(_skin: unknown, name: string) { return new core.MeshAttachment(name) }
      newBoundingBoxAttachment(_skin: unknown, name: string) { return new core.BoundingBoxAttachment(name) }
      newPathAttachment(_skin: unknown, name: string) { return new core.PathAttachment(name) }
      newPointAttachment(_skin: unknown, name: string) { return new core.PointAttachment(name) }
      newClippingAttachment(_skin: unknown, name: string) { return new core.ClippingAttachment(name) }
    })()

    const oData = new core.SkeletonJson(loader).readSkeletonData(RAW)
    const oPool: { sk: any; st: any }[] = []
    for (let i = 0; i < INSTANCES; i++) {
      const sk = new core.Skeleton(oData)
      const st = new core.AnimationState(new core.AnimationStateData(oData))
      st.setAnimation(0, 'run', true)
      oPool.push({ sk, st })
    }

    for (let t = 0; t < WARMUP_TICKS; t++) {
      for (const { sk, st } of oPool) {
        st.update(1 / 60)
        st.apply(sk)
        sk.updateWorldTransform()
      }
    }

    const chain: number[] = []
    const applyOnly: number[] = []
    const uwtOnly: number[] = []
    for (let t = 0; t < SAMPLE_TICKS; t++) {
      const t0 = performance.now()
      for (const { sk, st } of oPool) {
        st.update(1 / 60)
        st.apply(sk)
        sk.updateWorldTransform()
      }
      chain.push((performance.now() - t0) / INSTANCES)
      const t1 = performance.now()
      for (const { sk, st } of oPool) st.apply(sk)
      applyOnly.push((performance.now() - t1) / INSTANCES)
      const t2 = performance.now()
      for (const { sk } of oPool) sk.updateWorldTransform()
      uwtOnly.push((performance.now() - t2) / INSTANCES)
    }

    // Rasen reference (same tick chain, from the Rasen run above). Our
    // apply() includes updateWorldTransform; the official chain adds an
    // explicit uwt because the official apply() does not — equal work.
    const rasPool: ReturnType<typeof makeInstance>[] = []
    for (let i = 0; i < INSTANCES; i++) rasPool.push(makeInstance())
    for (let t = 0; t < WARMUP_TICKS; t++) {
      for (const { st } of rasPool) { st.update(1 / 60); st.apply() }
    }
    const rasChain: number[] = []
    for (let t = 0; t < SAMPLE_TICKS; t++) {
      const t0 = performance.now()
      for (const { st } of rasPool) { st.update(1 / 60); st.apply() }
      rasChain.push((performance.now() - t0) / INSTANCES)
    }

    const lines: string[] = []
    lines.push('')
    lines.push(`=== Rasen vs official spine-core (pure JS pose, ${INSTANCES} × spineboy-pro run) ===`)
    lines.push(`  official  chain  ${(mean(chain) * 1000).toFixed(2)} μs/inst/frame  (apply ${(mean(applyOnly) * 1000).toFixed(2)} + uwt ${(mean(uwtOnly) * 1000).toFixed(2)})`)
    lines.push(`  rasen     chain  ${(mean(rasChain) * 1000).toFixed(2)} μs/inst/frame`)
    lines.push(`  ratio     ${ (mean(rasChain) / mean(chain)).toFixed(2) }×`)
    console.log(lines.join('\n'))
  }, 180_000)
})