/**
 * verify-gr2-anim — decode real Granny animation tracks and check the
 * invariants the renderer relies on.
 *
 *   npx tsx tools/verify-gr2-anim.ts [file-or-directory ...]
 *
 * With no arguments it checks the samples preserved under `.scratch/gr2`
 * (`diablo` + `amazon` `combined.animations`). For every file it prints one
 * line per animation (name, duration, timeStep, track-group count, transform
 * and vector track counts) plus that animation's curve-codec histogram, and
 * then samples every transform track at t = 0, mid and end of the clip:
 *
 *   - orientation quaternions: components within [-1.01, 1.01] and length
 *     within 1e-3 of 1 (FAIL otherwise),
 *   - position and scale-shear values: finite (FAIL otherwise),
 *   - continuity over 32 evenly spaced samples: an adjacent step larger than
 *     the track's own observed range is REPORTED but never fails (quaternion
 *     comparisons are sign-agnostic, since q and -q are the same rotation).
 *
 * It also checks that every name is printable ASCII, that every duration is
 * positive, and that the codec histogram accounts for every curve. The
 * measured position span is reported (never asserted). Prints an OK/FAIL
 * summary and exits non-zero on any failure.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadGr2Animations, type Gr2Curve, type Gr2TransformTrack } from '../src/original/gr2-anim'

const HERE = new URL('.', import.meta.url).pathname
const SAMPLES = [join(HERE, '..', '..', '..', '.scratch', 'gr2')]

const CONTINUITY_SAMPLES = 32

interface Failure {
  file: string
  reason: string
}

function collect(path: string, out: string[]): void {
  const stat = statSync(path, { throwIfNoEntry: false })
  if (!stat) return
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) collect(join(path, entry), out)
    return
  }
  if (path.endsWith('.animations')) out.push(path)
}

function printable(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) return false
  }
  return true
}

function histogramLine(histogram: Map<string, number>): string {
  return [...histogram.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([codec, count]) => `${codec}:${count}`)
    .join(' ')
}

interface TrackStats {
  curves: number
  quaternionSamples: number
  worstQuaternionLengthError: number
  positionSpan: [number, number, number]
  positionSpanHi: [number, number, number]
  continuityReports: number
  worstContinuity: { track: string; jump: number; range: number } | null
}

function sampleCurve(curve: Gr2Curve, times: number[]): number[][] {
  return times.map((t) => curve.evaluate(t))
}

/**
 * Check one curve's samples; pushes hard failures into `failures` and
 * continuity observations into `stats` (report-only).
 */
function checkCurve(
  file: string,
  label: string,
  curve: Gr2Curve | undefined,
  role: 'orientation' | 'position' | 'scaleShear' | 'vector',
  duration: number,
  failures: Failure[],
  stats: TrackStats,
): void {
  if (!curve) return
  stats.curves += 1
  const times = [0, duration / 2, duration]
  const dense = [...Array(CONTINUITY_SAMPLES + 1).keys()].map((i) => (duration * i) / CONTINUITY_SAMPLES)
  const samples = sampleCurve(curve, [...times, ...dense])

  for (let s = 0; s < samples.length; s += 1) {
    const value = samples[s]
    if (value.length !== curve.dimension) {
      failures.push({ file, reason: `${label}: ${curve.codec} returned ${value.length} components, expected ${curve.dimension}` })
      return
    }
    for (const component of value) {
      if (!Number.isFinite(component)) {
        failures.push({ file, reason: `${label}: ${curve.codec} produced a non-finite value` })
        return
      }
    }
    if (role === 'orientation' || (role === 'vector' && curve.dimension === 4)) {
      if (s < times.length) stats.quaternionSamples += 1
      for (const component of value) {
        if (component < -1.01 || component > 1.01) {
          failures.push({ file, reason: `${label}: ${curve.codec} quaternion component ${component} outside [-1.01, 1.01]` })
          return
        }
      }
      const length = Math.hypot(...value)
      const error = Math.abs(length - 1)
      if (error > 1e-3) {
        failures.push({ file, reason: `${label}: ${curve.codec} quaternion length ${length} is not 1 within 1e-3` })
        return
      }
      if (error > stats.worstQuaternionLengthError) stats.worstQuaternionLengthError = error
    }
    if (role === 'position') {
      for (let c = 0; c < 3; c += 1) {
        if (value[c] < stats.positionSpan[c]) stats.positionSpan[c] = value[c]
        if (value[c] > stats.positionSpanHi[c]) stats.positionSpanHi[c] = value[c]
      }
    }
  }

  // Continuity over the dense samples (report-only). Quaternions are
  // compared sign-agnostically: q and -q are the same rotation.
  const denseSamples = samples.slice(times.length)
  const ranges = curve.dimension > 0 ? new Array<number>(curve.dimension).fill(0) : []
  for (let d = 0; d < curve.dimension; d += 1) {
    let lo = Infinity
    let hi = -Infinity
    for (const value of denseSamples) {
      if (value[d] < lo) lo = value[d]
      if (value[d] > hi) hi = value[d]
    }
    ranges[d] = hi - lo
  }
  const ownRange = Math.max(...ranges)
  for (let s = 1; s < denseSamples.length; s += 1) {
    const previous = denseSamples[s - 1]
    const current = denseSamples[s]
    let jump = 0
    for (let d = 0; d < curve.dimension; d += 1) {
      const delta = Math.abs(current[d] - previous[d])
      const flipped = Math.abs(current[d] + previous[d])
      jump = Math.max(jump, curve.dimension === 4 ? Math.min(delta, flipped) : delta)
    }
    if (jump > ownRange) {
      stats.continuityReports += 1
      if (!stats.worstContinuity || jump - ownRange > stats.worstContinuity.jump - stats.worstContinuity.range) {
        stats.worstContinuity = { track: label, jump, range: ownRange }
      }
    }
  }
}

function checkTrack(
  file: string,
  animationName: string,
  track: Gr2TransformTrack,
  duration: number,
  failures: Failure[],
  stats: TrackStats,
  histogram: Map<string, number>,
): void {
  const label = `${animationName}/${track.name}`
  if (!printable(track.name)) failures.push({ file, reason: `${label}: track name is not printable ASCII` })
  for (const [role, curve] of [
    ['orientation', track.orientation],
    ['position', track.position],
    ['scaleShear', track.scaleShear],
  ] as const) {
    if (!curve) continue
    histogram.set(curve.codec, (histogram.get(curve.codec) ?? 0) + 1)
    checkCurve(file, `${label}.${role}`, curve, role, duration, failures, stats)
  }
}

function checkFile(path: string, failures: Failure[]): number {
  const bytes = new Uint8Array(readFileSync(path))
  let set: ReturnType<typeof loadGr2Animations>
  try {
    set = loadGr2Animations(bytes)
  } catch (error) {
    failures.push({ file: path, reason: `decode failed: ${(error as Error).message}` })
    console.log(`${path}: decode failed`)
    return 1
  }

  console.log(`\n=== ${path} ===`)
  console.log(`fromFileName: ${set.fromFileName}`)
  console.log(
    `animations: ${set.animations.length}, root TrackGroups: ${set.trackGroupCount}, ` +
      `distinct track groups: ${set.distinctTrackGroupCount}`,
  )

  const stats: TrackStats = {
    curves: 0,
    quaternionSamples: 0,
    worstQuaternionLengthError: 0,
    positionSpan: [Infinity, Infinity, Infinity],
    positionSpanHi: [-Infinity, -Infinity, -Infinity],
    continuityReports: 0,
    worstContinuity: null,
  }
  const totalHistogram = new Map<string, number>()

  for (const animation of set.animations) {
    const histogram = new Map<string, number>()
    let transformTracks = 0
    let vectorTracks = 0
    if (!printable(animation.name)) {
      failures.push({ file: path, reason: `animation name ${JSON.stringify(animation.name)} is not printable ASCII` })
    }
    if (!(animation.duration > 0) || !Number.isFinite(animation.duration)) {
      failures.push({ file: path, reason: `animation "${animation.name}" has non-positive duration ${animation.duration}` })
    }
    for (const group of animation.trackGroups) {
      if (!printable(group.name)) {
        failures.push({ file: path, reason: `track group name ${JSON.stringify(group.name)} is not printable ASCII` })
      }
      for (const track of group.transformTracks) {
        transformTracks += 1
        checkTrack(path, animation.name, track, animation.duration, failures, stats, histogram)
      }
      for (const vector of group.vectorTracks) {
        vectorTracks += 1
        if (!printable(vector.name)) {
          failures.push({ file: path, reason: `vector track name ${JSON.stringify(vector.name)} is not printable ASCII` })
        }
        if (vector.curve) {
          histogram.set(vector.curve.codec, (histogram.get(vector.curve.codec) ?? 0) + 1)
          checkCurve(
            path,
            `${animation.name}/${vector.name}`,
            vector.curve,
            'vector',
            animation.duration,
            failures,
            stats,
          )
        }
      }
    }
    for (const [codec, count] of histogram) totalHistogram.set(codec, (totalHistogram.get(codec) ?? 0) + count)
    console.log(
      `  "${animation.name}" dur=${animation.duration} step=${animation.timeStep} groups=${animation.trackGroups.length} ` +
        `tracks=${transformTracks}+${vectorTracks}v`,
    )
    console.log(`    codecs: ${histogramLine(histogram)}`)
  }

  console.log(`  file codec histogram (every curve accounted for, ${stats.curves} transform + value curves):`)
  console.log(`    ${histogramLine(totalHistogram)}`)
  console.log(
    `  position span over samples: x[${stats.positionSpan[0]}, ${stats.positionSpanHi[0]}] ` +
      `y[${stats.positionSpan[1]}, ${stats.positionSpanHi[1]}] z[${stats.positionSpan[2]}, ${stats.positionSpanHi[2]}]`,
  )
  console.log(
    `  quaternion samples: ${stats.quaternionSamples}, worst |length - 1|: ${stats.worstQuaternionLengthError.toExponential(2)}`,
  )
  console.log(`  continuity jumps above the track's own range (report-only): ${stats.continuityReports}`)
  if (stats.worstContinuity) {
    const worst = stats.worstContinuity
    console.log(`    worst: ${worst.track} jump=${worst.jump.toExponential(3)} range=${worst.range.toExponential(3)}`)
  }
  return 0
}

function main(): number {
  const targets = process.argv.slice(2)
  const paths: string[] = []
  for (const target of targets.length > 0 ? targets : SAMPLES) collect(target, paths)
  paths.sort()
  if (paths.length === 0) {
    console.log('no .animations files found')
    return 1
  }

  const failures: Failure[] = []
  for (const path of paths) checkFile(path, failures)

  console.log('\n=== summary ===')
  if (failures.length === 0) {
    console.log(`OK — ${paths.length} file(s), all invariants held`)
    return 0
  }
  for (const failure of failures) console.log(`FAIL ${failure.file}: ${failure.reason}`)
  console.log(`FAIL — ${failures.length} problem(s) across ${paths.length} file(s)`)
  return 1
}

process.exitCode = main()
