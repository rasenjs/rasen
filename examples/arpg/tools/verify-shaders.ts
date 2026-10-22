/**
 * What is actually in the game's exported WGSL set?
 *
 * `public/original/shaders/` is 119 modules translated from the game's shipped
 * shader binaries, each named by an opaque 16-hex-digit key. No table maps those
 * keys to what the shaders are for, so every claim about them has to come from
 * the source itself. This tool makes that claim explicit and checks it over all
 * of the files, not a sample:
 *
 *   - every module parses (the reflection in `src/shaders.ts` is a reader, and a
 *     file it does not understand is reported with its reason, not skipped);
 *   - every module declares at least one entry point, and how many declare a
 *     vertex, a fragment and a compute entry point;
 *   - every binding classifies into a WebGPU binding kind — an unclassified
 *     declaration would mean the pipeline layer in `@rasenjs/gfx` cannot express
 *     it, which is a failure of this set, not a detail;
 *   - every `@group/@binding` declared twice is an alias (one type), because two
 *     different types in one slot cannot be expressed as one bind group layout;
 *   - how the 119 modules can be combined, derived from the two stages'
 *     reflected interfaces rather than from file names: which fragment modules
 *     some vertex module can feed.
 *
 * The numbers are percentages of the files that are actually there, so a set that
 * shrinks shows up as a smaller count rather than as a thinner percentage of a
 * remembered total.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-shaders.ts
 *
 * Needs the generated set (`public/original/shaders/`, produced from a local copy
 * of the game — see `src/original/README.md`). Reads only; no GPU.
 * Exits 1 when a module fails to parse, declares nothing, or cannot be expressed.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bindingShape,
  bindingUnionProblems,
  entryPointOf,
  reflectWgslResult,
  stageLinkProblems,
  type WgslReflection,
} from '../src/shaders'

const SHADERS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/original/shaders')
const REPORT_FILE = join(SHADERS_DIR, 'shaders.json')

function percent(part: number, whole: number): string {
  return whole === 0 ? '0%' : `${((part / whole) * 100).toFixed(1)}%`
}

/** A histogram, largest count first then alphabetically, for stable output. */
function histogram(values: readonly (string | number)[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1)
  return new Map(
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true })),
  )
}

function printHistogram(title: string, counts: Map<string, number>): void {
  console.log(`  ${title}:`)
  for (const [key, count] of counts) console.log(`    ${key.padEnd(28)} ${String(count).padStart(4)}`)
}

/** Collapse a link problem into a class, so the histogram counts reasons rather
 *  than every distinct message text. */
function blockReason(problem: string): string {
  if (problem.startsWith('fragment input')) return 'fragment input has no vertex output'
  if (problem.includes('interpolation differs')) return 'interpolation differs at @location(n)'
  if (problem.startsWith('@location(')) return 'type differs at @location(n)'
  const binding = /^@group\((\d+)\) @binding\((\d+)\)/.exec(problem)
  return binding ? `binding @group(${binding[1]}) @binding(${binding[2]}) declared differently` : problem
}

interface Module {
  id: string
  reflection: WgslReflection
}

function main(): void {
  if (!existsSync(SHADERS_DIR)) {
    console.error(`No shader set at ${SHADERS_DIR}.`)
    console.error('It is generated from a local copy of the game (see src/original/README.md); nothing is shipped.')
    process.exitCode = 1
    return
  }

  const files = readdirSync(SHADERS_DIR).sort()
  const wgslIds = files.filter((name) => name.endsWith('.wgsl')).map((name) => name.slice(0, -'.wgsl'.length))
  const spvCount = files.filter((name) => name.endsWith('.spv')).length

  const modules: Module[] = []
  const unparsed: { id: string; error: string }[] = []
  const withoutEntryPoints: string[] = []
  for (const id of wgslIds) {
    const source = readFileSync(join(SHADERS_DIR, `${id}.wgsl`), 'utf8')
    const { reflection, error } = reflectWgslResult(source)
    if (!reflection) {
      unparsed.push({ id, error: error ?? 'unknown' })
      continue
    }
    if (reflection.entryPoints.length === 0) withoutEntryPoints.push(id)
    modules.push({ id, reflection })
  }

  console.log(`shader set: ${SHADERS_DIR}`)
  console.log(
    `${wgslIds.length} .wgsl module${wgslIds.length === 1 ? '' : 's'}, ${spvCount} .spv source${spvCount === 1 ? '' : 's'}` +
      `${existsSync(REPORT_FILE) ? ', translator report present' : ', no translator report'}`,
  )
  console.log(
    `\nparsed: ${modules.length} of ${wgslIds.length} (${percent(modules.length, wgslIds.length)})` +
      (unparsed.length > 0 ? ` — ${unparsed.length} failed` : ''),
  )
  for (const failure of unparsed) console.log(`  ${failure.id}: ${failure.error}`)

  const withVertex = modules.filter((module) => entryPointOf(module.reflection, 'vertex'))
  const withFragment = modules.filter((module) => entryPointOf(module.reflection, 'fragment'))
  const withCompute = modules.filter((module) => entryPointOf(module.reflection, 'compute'))
  const both = modules.filter(
    (module) =>
      entryPointOf(module.reflection, 'vertex') && entryPointOf(module.reflection, 'fragment'),
  )
  const total = modules.length
  console.log('\nentry points, per module (a module can declare one stage or several):')
  console.log(`  vertex    ${String(withVertex.length).padStart(4)}  ${percent(withVertex.length, total)}`)
  console.log(`  fragment  ${String(withFragment.length).padStart(4)}  ${percent(withFragment.length, total)}`)
  console.log(`  compute   ${String(withCompute.length).padStart(4)}  ${percent(withCompute.length, total)}`)
  console.log(`  both v+f  ${String(both.length).padStart(4)}  ${percent(both.length, total)}`)
  console.log(`  no stage  ${String(withoutEntryPoints.length).padStart(4)}  ${percent(withoutEntryPoints.length, total)}`)

  const entryNames = modules.flatMap((module) => module.reflection.entryPoints.map((entry) => entry.name))
  printHistogram('entry point names', histogram(entryNames))

  const workgroups = modules
    .flatMap((module) => module.reflection.entryPoints)
    .filter((entry) => entry.workgroupSize)
    .map((entry) => (entry.workgroupSize ?? []).join(' x '))
  printHistogram('compute workgroup sizes', histogram(workgroups))

  // --- bindings ------------------------------------------------------------

  const bindingCounts = modules.map((module) => module.reflection.bindings.length)
  const sorted = [...bindingCounts].sort((a, b) => a - b)
  const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]
  const totalBindings = bindingCounts.reduce((sum, count) => sum + count, 0)
  console.log(`\nbindings: ${totalBindings} declared across ${total} modules`)
  console.log(
    `  per module: min ${sorted[0] ?? 0}, median ${median}, max ${sorted[sorted.length - 1] ?? 0}` +
      `, mean ${total === 0 ? '0' : (totalBindings / total).toFixed(1)}`,
  )
  printHistogram(
    'bind groups per module',
    histogram(modules.map((module) => module.reflection.groups.length)),
  )
  printHistogram(
    'group indices used',
    histogram(modules.flatMap((module) => module.reflection.groups)),
  )
  printHistogram(
    'binding kinds',
    histogram(modules.flatMap((module) => module.reflection.bindings.map((binding) => binding.kind))),
  )
  printHistogram(
    'texture view dimensions',
    histogram(
      modules.flatMap((module) =>
        module.reflection.bindings
          .filter((binding) => binding.kind === 'texture' || binding.kind === 'depth-texture')
          .map((binding) => `${binding.kind}/${binding.viewDimension ?? '2d'}`),
      ),
    ),
  )
  printHistogram(
    'address spaces',
    histogram(
      modules.flatMap((module) =>
        module.reflection.bindings.map((binding) => binding.addressSpace ?? '(resource)'),
      ),
    ),
  )

  const duplicates = modules.flatMap((module) =>
    module.reflection.duplicates.map((duplicate) => ({ id: module.id, duplicate })),
  )
  const conflicting = duplicates.filter((entry) => entry.duplicate.shapes.length > 1)
  console.log(
    `\nduplicate @group/@binding slots: ${duplicates.length} across ` +
      `${new Set(duplicates.map((entry) => entry.id)).size} of ${total} modules ` +
      `(${percent(new Set(duplicates.map((entry) => entry.id)).size, total)})`,
  )
  console.log(`  alias (one type, two names): ${duplicates.length - conflicting.length}`)
  console.log(`  conflicting (different types): ${conflicting.length}`)
  for (const entry of conflicting.slice(0, 10)) {
    const { group, binding, shapes } = entry.duplicate
    console.log(`    ${entry.id} @group(${group}) @binding(${binding}): ${shapes.join(' vs ')}`)
  }

  const unclassified = modules.flatMap((module) =>
    module.reflection.unclassified.map((binding) => ({ id: module.id, binding })),
  )
  console.log(`\nunclassified bindings: ${unclassified.length}`)
  for (const entry of unclassified.slice(0, 10)) {
    console.log(`  ${entry.id} @group(${entry.binding.group}) @binding(${entry.binding.binding}): ${entry.binding.type}`)
  }

  // --- how the modules combine --------------------------------------------

  const vertexStages = modules
    .map((module) => ({ module, entry: entryPointOf(module.reflection, 'vertex') }))
    .filter((item) => item.entry)
  const fragmentStages = modules
    .map((module) => ({ module, entry: entryPointOf(module.reflection, 'fragment') }))
    .filter((item) => item.entry)

  const linkable: { id: string; vertex: string; candidates: number }[] = []
  const unlinkable: { id: string; reasons: Map<string, number> }[] = []
  for (const fragment of fragmentStages) {
    const reasons = new Map<string, number>()
    let candidates = 0
    let firstVertex = ''
    for (const vertex of vertexStages) {
      const interfaceProblems = stageLinkProblems(vertex.entry!, fragment.entry!)
      const bindingProblems = interfaceProblems.length === 0
        ? bindingUnionProblems(vertex.module.reflection, fragment.module.reflection)
        : []
      const problems = [...interfaceProblems, ...bindingProblems]
      if (problems.length === 0) {
        candidates++
        if (firstVertex === '') firstVertex = vertex.module.id
        continue
      }
      for (const problem of problems) {
        const kind = blockReason(problem)
        reasons.set(kind, (reasons.get(kind) ?? 0) + 1)
      }
    }
    if (candidates > 0) linkable.push({ id: fragment.module.id, vertex: firstVertex, candidates })
    else unlinkable.push({ id: fragment.module.id, reasons })
  }

  console.log(
    `\nstage pairing, derived from the reflected interfaces (no name table exists):` +
      `\n  ${linkable.length} of ${fragmentStages.length} fragment modules ` +
      `(${percent(linkable.length, fragmentStages.length)}) can be fed by at least one of the ` +
      `${vertexStages.length} vertex modules` +
      `\n  ${unlinkable.length} cannot, and why (blocking reason → how many vertex modules it rejects):`,
  )
  printHistogram(
    'blocking reasons',
    histogram(unlinkable.flatMap((entry) => [...entry.reasons.keys()])),
  )
  for (const entry of linkable.slice(0, 5)) {
    console.log(
      `  ${entry.id} ← ${entry.vertex} (${entry.candidates} candidate${entry.candidates === 1 ? '' : 's'})`,
    )
  }

  // --- the translator's own account ---------------------------------------

  if (existsSync(REPORT_FILE)) {
    const report = JSON.parse(readFileSync(REPORT_FILE, 'utf8')) as Record<string, [string, string][]>
    const translated = report.OK?.length ?? 0
    const rejected = Object.entries(report).filter(([reason]) => reason !== 'OK')
    const rejectedPrograms = rejected.reduce((sum, [, entries]) => sum + entries.length, 0)
    console.log(
      `\ntranslator report: ${translated} programs translated, ${rejectedPrograms} rejected in ` +
        `${rejected.length} classes. The report names programs, not keys, so it does not say which ` +
        `module is which — and it disagrees with the shipped set by ${Math.abs(translated - wgslIds.length)} ` +
        `modules, which is why the set here is counted, not assumed.`,
    )
    for (const [reason, entries] of rejected.sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${String(entries.length).padStart(3)}  ${reason}`)
    }
  }

  // --- verdict -------------------------------------------------------------

  const failures = unparsed.length + withoutEntryPoints.length + unclassified.length + conflicting.length
  console.log('')
  if (failures > 0) {
    console.error(
      `FAIL: ${unparsed.length} unparsable, ${withoutEntryPoints.length} with no entry point, ` +
        `${unclassified.length} unclassified bindings, ${conflicting.length} conflicting duplicate slots`,
    )
    for (const id of withoutEntryPoints) console.error(`  no entry point: ${id}`)
    process.exitCode = 1
    return
  }
  console.log(
    `PASS: all ${total} modules parse, all declare an entry point, every binding maps to a WebGPU ` +
      `binding kind (${[...new Set(modules.flatMap((module) => module.reflection.bindings.map(bindingShape)))].length} ` +
      `distinct shapes), and every duplicate slot is an alias`,
  )
  console.log(
    `${withVertex.length} vertex (${percent(withVertex.length, total)}), ` +
      `${withFragment.length} fragment (${percent(withFragment.length, total)}), ` +
      `${withCompute.length} compute (${percent(withCompute.length, total)})`,
  )
}

main()
