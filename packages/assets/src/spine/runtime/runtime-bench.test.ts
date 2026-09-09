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

    // Compute the per-instance "tickInstances" wall time (the same chain
    // the bench uses: st.update + st.apply + sk.updateWorldTransform).
    const tickSamples: number[] = []
    for (let t = 0; t < SAMPLE_TICKS; t++) {
      const t0 = performance.now()
      for (const { sk, st } of pool) {
        st.update(1 / 60)
        st.apply()
        sk.updateWorldTransform()
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
})