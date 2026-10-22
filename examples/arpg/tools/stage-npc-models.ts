/**
 * stage-npc-models — stage the town NPCs' own unit-definition assets for the
 * 3D actor layer.
 *
 * The sample dump under `.scratch/gr2/npc/<id>/` holds, per NPC, the retail
 * unit definition (`<id>.json`) plus the files it names: the `_lod3` `.model`
 * per part, the `.skeleton` its `SkeletonDefinitionComponent` points at, and
 * its `.texture` set (extracted with `tools/extract-original.ts raw` from the
 * user's own RomFS). This tool mirrors them into the layout the runtime fetches
 * at `public/original/models/<in-package path>`:
 *
 * - a model lands at the unit definition's own model directory, under the file
 *   name the package ships (`torso.model` → `torso_lod3.model`);
 * - the skeleton lands at the EXACT path the definition names — for `rogue1`
 *   that is the shared `navi` skeleton its root entity wires;
 * - each texture lands at the EXACT path its model records (`FromFileName`),
 *   matched to a dump file by case-insensitive basename (the manifest stores
 *   lowercase; the game files' own casing is what the runtime fetches).
 *
 * Files the unit definition names but the package does not ship at any LOD
 * (rogue1's `lhand` bow and `special2`) are reported as missing and staged as
 * nothing: no other character's model is ever substituted.
 *
 * Usage:
 *   ../../node_modules/.bin/tsx tools/stage-npc-models.ts [--src dir] [--out dir]
 *
 *   --src  sample dump directory (default <repo>/.scratch/gr2/npc)
 *   --out  staging directory (default examples/arpg/public/original/models)
 *
 * No game data is downloaded; both directories are git-ignored and the tool
 * refuses to stage unless `git` agrees the output directory is ignored.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadGr2 } from '../src/original/gr2'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ARPG_DIR = resolve(SCRIPT_DIR, '..')
const REPO_DIR = resolve(ARPG_DIR, '..', '..')

interface CliOptions {
  src: string
  out: string
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    src: join(REPO_DIR, '.scratch', 'gr2', 'npc'),
    out: join(ARPG_DIR, 'public', 'original', 'models'),
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--src') options.src = resolve(process.cwd(), argv[++i] ?? '')
    else if (arg === '--out') options.out = resolve(process.cwd(), argv[++i] ?? '')
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        [
          'stage-npc-models — stage NPC unit-definition assets under their in-package paths',
          '',
          '  stage-npc-models.ts [--src dir] [--out dir]',
          '',
          '  --src  sample dump directory (default <repo>/.scratch/gr2/npc)',
          '  --out  staging directory (default examples/arpg/public/original/models)',
          '',
        ].join('\n'),
      )
      process.exit(0)
    } else {
      process.stderr.write(`stage-npc-models: unknown argument ${arg}\n`)
      process.exit(2)
    }
  }
  return options
}

/** One part of a unit definition: its `UnitPartComponent` name and model file. */
interface UnitPart {
  part: string
  variant: string
  /** The `ModelDefinitionComponent` path, e.g. `data/hd/character/npc/gheed/torso.model`. */
  model: string
}

interface UnitDefinition {
  /** `monstats`-style unit name the file is keyed by, e.g. `gheed`. */
  name: string
  parts: UnitPart[]
  /** The `SkeletonDefinitionComponent` path, or null. */
  skeleton: string | null
  /** `dependencies.textures[].path`, in file order. */
  textures: string[]
}

/** Parse the parts, skeleton and texture dependencies out of one unit definition. */
function parseUnitDefinition(json: Record<string, unknown>): UnitDefinition {
  const entities = json['entities'] as Array<{ components: Array<Record<string, unknown>> }>
  const parts: UnitPart[] = []
  let skeleton: string | null = null
  for (const entity of entities) {
    let part = ''
    let variant = ''
    for (const component of entity.components) {
      if (component['type'] === 'UnitPartComponent') {
        part = String(component['part'])
        variant = String(component['variant'] ?? '')
      }
    }
    for (const component of entity.components) {
      if (component['type'] === 'ModelDefinitionComponent') {
        parts.push({ part, variant, model: String(component['filename']) })
      }
      if (component['type'] === 'SkeletonDefinitionComponent' && skeleton === null) {
        skeleton = String(component['filename'])
      }
    }
  }
  const deps = json['dependencies'] as { textures?: Array<{ path: string }> }
  return {
    name: String(json['name'] ?? ''),
    parts,
    skeleton,
    textures: (deps.textures ?? []).map((entry) => entry.path),
  }
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile())
}

/** Case-insensitive basename lookup over one sample subdirectory. */
function byBase(files: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const name of files) map.set(name.toLowerCase(), name)
  return map
}

/** `torso_lod3.model` and friends share the dependency stem `torso.model`. */
function modelStem(name: string): string {
  return name.replace(/\.model$/i, '').replace(/_lod\d+$/i, '')
}

interface StagedFile {
  src: string
  dest: string
  bytes: number
}

function main(): void {
  const options = parseCli(process.argv.slice(2))
  if (!existsSync(options.src)) {
    process.stderr.write(`stage-npc-models: sample directory not found: ${options.src}\n`)
    process.exit(1)
  }

  // Game data must never be committed: refuse to write anywhere git tracks.
  try {
    execFileSync('git', ['check-ignore', '-q', options.out], { cwd: REPO_DIR })
  } catch {
    process.stderr.write(
      `stage-npc-models: ${options.out} is not git-ignored — refusing to stage game data there\n`,
    )
    process.exit(1)
  }

  const staged: StagedFile[] = []
  const missing: string[] = []

  for (const id of readdirSync(options.src).sort()) {
    const unitDir = join(options.src, id)
    if (!statSync(unitDir).isDirectory()) continue
    const unitPath = join(unitDir, `${id}.json`)
    if (!existsSync(unitPath)) continue
    const unit = parseUnitDefinition(JSON.parse(readFileSync(unitPath, 'utf8')) as Record<string, unknown>)

    const models = byBase(listFiles(join(unitDir, 'models')))
    const skeletons = byBase(listFiles(join(unitDir, 'skeleton')))
    const textures = byBase(listFiles(join(unitDir, 'textures')))

    process.stdout.write(`\n${id} — unit definition data/hd/character/npc/${id}.json\n`)

    // Models: the dependency name the definition lists, the `_lod3` file the
    // package ships. The destination keeps the package's own file name.
    const usedModels = new Set<string>()
    for (const part of unit.parts) {
      const want = basename(part.model)
      const sample = [...models.values()].find(
        (name) => modelStem(name).toLowerCase() === modelStem(want).toLowerCase(),
      )
      if (sample === undefined) {
        missing.push(`${id}: ${part.part} (${part.model}) — no model in the package`)
        process.stdout.write(`  MISS part    ${part.part}/${part.variant} ${part.model}\n`)
        continue
      }
      usedModels.add(sample)
      const dest = join(dirname(part.model), sample)
      staged.push({ src: join(unitDir, 'models', sample), dest, bytes: 0 })
      process.stdout.write(`  part         ${part.part}/${part.variant} ${dest}\n`)
    }

    // Skeleton: the exact path the definition's root entity names.
    if (unit.skeleton !== null) {
      const sample = skeletons.get(basename(unit.skeleton).toLowerCase())
      if (sample === undefined) {
        missing.push(`${id}: ${unit.skeleton} — no skeleton in the dump`)
        process.stdout.write(`  MISS skeleton ${unit.skeleton}\n`)
      } else {
        staged.push({ src: join(unitDir, 'skeleton', sample), dest: unit.skeleton, bytes: 0 })
        process.stdout.write(`  skeleton     ${unit.skeleton}\n`)
      }
    }

    // Textures: the exact paths the models record, falling back to the paths
    // the definition lists, matched to dump files by case-insensitive basename.
    const textureDest = new Map<string, string>()
    for (const name of models.values()) {
      const gr2 = loadGr2(new Uint8Array(readFileSync(join(unitDir, 'models', name))))
      for (const texture of gr2.textures) {
        if (texture.fromFileName === '') continue
        const key = basename(texture.fromFileName).toLowerCase()
        if (!textureDest.has(key)) textureDest.set(key, texture.fromFileName)
      }
    }
    for (const path of unit.textures) {
      const key = basename(path).toLowerCase()
      if (!textureDest.has(key)) textureDest.set(key, path)
    }
    for (const [key, sample] of textures) {
      const dest = textureDest.get(key) ?? `data/hd/character/npc/${id}/textures/${sample}`
      staged.push({ src: join(unitDir, 'textures', sample), dest, bytes: 0 })
    }
    for (const name of usedModels) {
      const gr2 = loadGr2(new Uint8Array(readFileSync(join(unitDir, 'models', name))))
      for (const texture of gr2.textures) {
        if (texture.fromFileName === '') continue
        if (!textures.has(basename(texture.fromFileName).toLowerCase())) {
          missing.push(`${id}: ${texture.fromFileName} — referenced by ${name}, not in the dump`)
        }
      }
    }
    process.stdout.write(`  textures     ${textures.size} files\n`)
  }

  let totalBytes = 0
  for (const file of staged) {
    const dest = join(options.out, file.dest)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(file.src, dest)
    file.bytes = statSync(dest).size
    totalBytes += file.bytes
  }

  process.stdout.write(
    `\n${staged.length} files staged under ${options.out} (${totalBytes} bytes)\n`,
  )
  if (missing.length > 0) {
    process.stdout.write(`${missing.length} unit-definition files could not be staged:\n`)
    for (const line of missing) process.stdout.write(`  ${line}\n`)
  }
}

main()
