/**
 * verify-npc-models — check every staged town-NPC model assembly.
 *
 * The 3D actor layer draws an NPC from the parts of its own retail unit
 * definition (see `NPC_PART_MODELS` in `src/three-d/model.ts`); this tool makes
 * that falsifiable without a running game. For every NPC in that map, and for
 * the model key each of its parts names:
 *
 * 1. the staged file exists under `public/original/models` and `loadGr2`
 *    decodes it;
 * 2. its meshes are non-empty (vertices and triangles) and its AABB is sane;
 *    the height in model units is reported — a character stands ~5–9 units
 *    (the amazon measures 7.17 across its parts, per `three-d/projection.ts`);
 * 3. the unit definition's `.skeleton` decodes and every bone is named.
 *
 * When the extraction dump `.scratch/gr2/npc` is present (it is git-ignored),
 * each unit definition there is also cross-checked part by part, so files the
 * package does not ship at any LOD (rogue1's `lhand` bow and `special2`) and
 * units that are deliberately unwired are NAMED rather than silently skipped:
 * an NPC without its own model keeps its 2D sprite and never borrows another
 * character's model.
 *
 * Usage:
 *   ../../node_modules/.bin/tsx tools/verify-npc-models.ts [--units dir]
 *
 *   --units  unit-definition dump (default <repo>/.scratch/gr2/npc; the
 *            cross-check is skipped when it is absent)
 *
 * Exit code 0 when every registered NPC passes; 1 otherwise. No game data is
 * read beyond the staged tree and (optionally) the git-ignored scratch dump.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadGr2, type Gr2File } from '../src/original/gr2'
import type { ModelSource } from '../src/three-d/model'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ARPG_DIR = resolve(SCRIPT_DIR, '..')
const REPO_DIR = resolve(ARPG_DIR, '..', '..')

/**
 * `three-d/model.ts` materializes its one-texel gray fallback through
 * `document` at module load (it is a browser module). The verifier only reads
 * the registry from it, so a minimal canvas stub stands in for the DOM before
 * the registry is imported.
 */
const globals = globalThis as unknown as { document?: unknown }
globals.document ??= {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect: () => undefined }) }),
}
const { MODEL_SOURCES, MONSTER_PART_MODELS, NPC_PART_MODELS } = await import('../src/three-d/model')

/** The staged tree the runtime fetches `MODEL_ROOT` from. */
const STAGED_ROOT = join(ARPG_DIR, 'public', 'original', 'models')

/**
 * A sane assembled-character height in model units. The amazon measures 7.17
 * across its five parts (`three-d/projection.ts`); the town NPCs land in 5–9.
 */
const CHARACTER_HEIGHT_MIN = 5
const CHARACTER_HEIGHT_MAX = 9

interface PartReport {
  key: string
  label: string
  url: string | null
  height: number | null
  meshes: number
  vertices: number
  error: string | null
}

interface NpcReport {
  id: string
  parts: PartReport[]
  /** Union height of the parts at one tile, model units. */
  height: number | null
  skeletonUrl: string | null
  bones: number
  namedBones: number
  error: string | null
}

/** Resolve a model source's candidate URLs to the first staged file. */
function resolveStaged(urls: readonly string[]): string | null {
  for (const url of urls) {
    const path = join(STAGED_ROOT, url)
    if (existsSync(path)) return url
  }
  return null
}

function meshStats(file: Gr2File): { meshes: number; vertices: number; ok: boolean } {
  let vertices = 0
  let ok = file.meshes.length > 0
  for (const mesh of file.meshes) {
    vertices += mesh.vertexCount
    if (mesh.vertexCount === 0 || mesh.indices.length < 3) ok = false
  }
  return { meshes: file.meshes.length, vertices, ok }
}

/** Vertex bounds over every mesh of a decoded model. */
function modelBounds(file: Gr2File): { minY: number; maxY: number } | null {
  let minY = Infinity
  let maxY = -Infinity
  for (const mesh of file.meshes) {
    for (let i = 1; i < mesh.positions.length; i += 3) {
      minY = Math.min(minY, mesh.positions[i])
      maxY = Math.max(maxY, mesh.positions[i])
    }
  }
  return Number.isFinite(minY) && maxY >= minY ? { minY, maxY } : null
}

function checkNpc(id: string, partKeys: readonly string[]): NpcReport {
  const report: NpcReport = {
    id,
    parts: [],
    height: null,
    skeletonUrl: null,
    bones: 0,
    namedBones: 0,
    error: null,
  }
  let unionMin = Infinity
  let unionMax = -Infinity
  const skeletonUrls: string[] = []

  for (const key of partKeys) {
    const source: ModelSource | undefined = MODEL_SOURCES.find((entry) => entry.id === key)
    const part: PartReport = { key, label: source?.label ?? key, url: null, height: null, meshes: 0, vertices: 0, error: null }
    report.parts.push(part)
    if (source === undefined) {
      part.error = 'no MODEL_SOURCES entry'
      continue
    }
    if (source.skeletonUrls) skeletonUrls.push(...source.skeletonUrls)
    const url = resolveStaged(source.urls)
    if (url === null) {
      part.error = `not staged (tried ${source.urls.join(', ')})`
      continue
    }
    part.url = url
    try {
      const file = loadGr2(new Uint8Array(readFileSync(join(STAGED_ROOT, url))))
      const stats = meshStats(file)
      part.meshes = stats.meshes
      part.vertices = stats.vertices
      if (!stats.ok) {
        part.error = 'meshes empty'
        continue
      }
      const bounds = modelBounds(file)
      if (bounds === null) {
        part.error = 'no vertex bounds'
        continue
      }
      part.height = bounds.maxY - bounds.minY
      unionMin = Math.min(unionMin, bounds.minY)
      unionMax = Math.max(unionMax, bounds.maxY)
    } catch (error) {
      part.error = `loadGr2 failed: ${String(error)}`
    }
  }

  if (Number.isFinite(unionMin)) report.height = unionMax - unionMin

  const skeletonUrl = resolveStaged([...new Set(skeletonUrls)])
  if (partKeys.length > 0 && skeletonUrl === null) {
    report.error = skeletonUrls.length === 0
      ? 'no skeleton registered'
      : `skeleton not staged (tried ${skeletonUrls.join(', ')})`
    return report
  }
  if (skeletonUrl !== null) {
    report.skeletonUrl = skeletonUrl
    try {
      const file = loadGr2(new Uint8Array(readFileSync(join(STAGED_ROOT, skeletonUrl))))
      if (file.skeletons.length === 0) {
        report.error = 'skeleton file holds no skeleton'
        return report
      }
      for (const skeleton of file.skeletons) {
        report.bones += skeleton.bones.length
        report.namedBones += skeleton.bones.filter((bone) => bone.name !== '').length
      }
      if (report.bones === 0 || report.namedBones !== report.bones) {
        report.error = 'skeleton has unnamed or missing bones'
      }
    } catch (error) {
      report.error = `skeleton loadGr2 failed: ${String(error)}`
    }
  }
  return report
}

/** `torso_lod3.model` and friends share the dependency stem `torso.model`. */
function modelStem(name: string): string {
  return name.replace(/\.model$/i, '').replace(/_lod\d+$/i, '')
}

/**
 * Cross-check one extracted unit definition against the registry, so that
 * parts with no file in the package and units that keep their 2D sprite are
 * named. Returns printable lines (informational, never a failure).
 */
function crossCheckUnit(unitsDir: string, id: string): string[] {
  const unitPath = join(unitsDir, `${id}.json`)
  const json = JSON.parse(readFileSync(unitPath, 'utf8')) as Record<string, unknown>
  const entities = json['entities'] as Array<{ components: Array<Record<string, unknown>> }>
  const modelDir = join(unitsDir, id, 'models')
  // Whether the dump holds this unit's models: only then are the per-part
  // "shipped at all" claims below evidence rather than absence of evidence.
  const extracted = existsSync(modelDir)
  const dumpModels = extracted ? readdirSync(modelDir) : []
  const lines: string[] = []
  const mapped = id in NPC_PART_MODELS

  const parts = new Set<string>()
  for (const entity of entities) {
    let part = ''
    for (const component of entity.components) {
      if (component['type'] === 'UnitPartComponent') part = String(component['part'])
    }
    for (const component of entity.components) {
      if (component['type'] !== 'ModelDefinitionComponent') continue
      const model = String(component['filename'])
      if (part === '' || parts.has(part)) continue
      parts.add(part)
      const key = `${id}-${part}`
      const registered = MODEL_SOURCES.some((entry) => entry.id === key)
      if (registered || !extracted) continue
      const inPackage = dumpModels.some(
        (name) => modelStem(name).toLowerCase() === modelStem(basename(model)).toLowerCase(),
      )
      lines.push(
        inPackage
          ? `  ${id}: part ${part} (${model}) is in the package but not registered`
          : `  ${id}: part ${part} (${model}) has no model file in the package at any LOD`,
      )
    }
  }
  if (!mapped) {
    lines.push(
      extracted
        ? `  ${id}: no NPC_PART_MODELS entry — keeps its 2D sprite`
        : `  ${id}: no NPC_PART_MODELS entry — keeps its 2D sprite (unit definition dumped, models not extracted)`,
    )
  }
  return lines
}

function main(): void {
  const unitsFlag = process.argv.indexOf('--units')
  const unitsDir = unitsFlag >= 0
    ? resolve(process.cwd(), process.argv[unitsFlag + 1] ?? '')
    : join(REPO_DIR, '.scratch', 'gr2', 'npc')

  const failures: string[] = []
  const reports: NpcReport[] = []

  for (const [id, partKeys] of Object.entries(NPC_PART_MODELS)) {
    const report = checkNpc(id, partKeys)
    reports.push(report)
    if (report.error !== null) failures.push(`${id}: ${report.error}`)
    for (const part of report.parts) {
      if (part.error !== null) failures.push(`${id}/${part.key}: ${part.error}`)
    }
    if (report.height !== null && (report.height < CHARACTER_HEIGHT_MIN || report.height > CHARACTER_HEIGHT_MAX)) {
      failures.push(
        `${id}: assembled height ${report.height.toFixed(2)} model units outside ` +
          `${CHARACTER_HEIGHT_MIN}–${CHARACTER_HEIGHT_MAX} (a character stands ~5–9)`,
      )
    }
  }

  // Monsters the game spawns, from their own unit definitions' part schemes.
  for (const [kind, spec] of Object.entries(MONSTER_PART_MODELS)) {
    const report = checkNpc(spec.id, spec.parts.map((part) => `${spec.id}-${part}`))
    reports.push(report)
    if (report.error !== null) failures.push(`${kind} (${spec.id}): ${report.error}`)
    for (const part of report.parts) {
      if (part.error !== null) failures.push(`${spec.id}/${part.key}: ${part.error}`)
    }
    if (report.height !== null && (report.height < CHARACTER_HEIGHT_MIN || report.height > CHARACTER_HEIGHT_MAX)) {
      failures.push(
        `${spec.id}: assembled height ${report.height.toFixed(2)} model units outside ` +
          `${CHARACTER_HEIGHT_MIN}–${CHARACTER_HEIGHT_MAX} (a character stands ~5–9)`,
      )
    }
  }

  process.stdout.write('staged character model assemblies\n')
  for (const report of reports) {
    const height = report.height === null ? '?' : report.height.toFixed(2)
    process.stdout.write(
      `  ${report.id.padEnd(8)} height=${height.padStart(5)}  ` +
        `skeleton=${report.skeletonUrl ?? 'none'} (${report.namedBones}/${report.bones} bones named)\n`,
    )
    for (const part of report.parts) {
      const partHeight = part.height === null ? '   ?' : part.height.toFixed(2).padStart(5)
      const state = part.error === null ? 'ok  ' : 'FAIL'
      process.stdout.write(
        `    ${state} ${part.key.padEnd(16)} h=${partHeight} meshes=${part.meshes} verts=${part.vertices}` +
          ` ${part.url ?? '(not staged)'}${part.error === null ? '' : ` — ${part.error}`}\n`,
      )
    }
    if (report.error !== null) process.stdout.write(`    FAIL ${report.error}\n`)
  }

  if (existsSync(unitsDir)) {
    process.stdout.write('\nunit-definition cross-check (extraction dump)\n')
    const named: string[] = []
    for (const name of readdirSync(unitsDir).sort()) {
      if (!name.endsWith('.json')) continue
      named.push(...crossCheckUnit(unitsDir, name.slice(0, -'.json'.length)))
    }
    if (named.length === 0) {
      process.stdout.write('  every dumped unit definition part is registered and staged\n')
    } else {
      for (const line of named) process.stdout.write(`${line}\n`)
    }
  } else {
    process.stdout.write(`\nunit-definition cross-check skipped (no ${unitsDir})\n`)
  }

  if (failures.length > 0) {
    process.stdout.write(`\nverify-npc-models: FAIL (${failures.length} problems)\n`)
    for (const failure of failures) process.stdout.write(`  ${failure}\n`)
    process.exit(1)
  }
  process.stdout.write(`\nverify-npc-models: OK (${reports.length} characters)\n`)
}

main()
