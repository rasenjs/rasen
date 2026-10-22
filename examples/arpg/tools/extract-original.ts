#!/usr/bin/env node
/**
 * Extract original UI art from *your own* Diablo II: Resurrected RomFS.
 *
 * Usage
 * -----
 *   extract-original list [filter]
 *   extract-original extract <filter> [--out dir] [--all] [--limit n]
 *   extract-original models [filter] [--out dir] [--limit n] [--json]
 *
 * `filter` is a case-insensitive substring of the in-package path. Nothing is
 * guessed: run `list` first and it prints the paths your package actually
 * contains.
 *
 * Where the files come from
 * -------------------------
 * `--romfs` points at the `RomFS` directory from your own copy:
 *
 *   RomFS/data/build_manifest.psv
 *   RomFS/data/00-00000001.data  …  (the archives)
 *
 * The reference project documents producing that folder with `hactool` from a
 * dump of your own cartridge (`dm/tools/extract_game.sh`). **This tool does not
 * download, fetch or bundle any game data**, and its output directory is
 * git-ignored — the same position the reference project takes in
 * `docs/GAME_FILES.md` ("does not contain any game files and never will").
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from '../src/original/png'
import {
  findEntry,
  parseManifest,
  readEntry,
  type ManifestEntry,
  type RomfsSource,
} from '../src/original/romfs'
import { parseSprite } from '../src/original/sprite'
import { decodeModel, parseModelDependencies, sidecarPath } from '../src/original/model'

const HERE = dirname(fileURLToPath(import.meta.url))

interface Options {
  romfs: string
  out: string
  limit: number
  all: boolean
  /** `models`: also write the `.json` sidecars, which name each model's textures. */
  json: boolean
}

function parseArgs(argv: string[]): { command: string; filter: string; options: Options } {
  const options: Options = {
    romfs:
      process.env.DM_ROMFS ??
      join(process.env.HOME ?? '', 'dm-work/data/switch/3.3.94012/Update/RomFS'),
    out: join(HERE, '..', 'public', 'original'),
    limit: 400,
    all: false,
    json: false,
  }
  let command = ''
  let filter = ''

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--romfs') options.romfs = argv[++i]
    else if (arg === '--out') options.out = argv[++i]
    else if (arg === '--limit') options.limit = Number(argv[++i])
    else if (arg === '--top') options.limit = Number(argv[++i])
    else if (arg === '--all') options.all = true
    else if (arg === '--json') options.json = true
    else if (!command) command = arg
    else if (!filter) filter = arg
  }
  return { command, filter, options }
}

/** A directory-backed RomFS source. */
function directorySource(romfs: string): RomfsSource {
  return {
    readManifest: () => readFile(join(romfs, 'data', 'build_manifest.psv'), 'utf8'),
    readArchive: async (name) => new Uint8Array(await readFile(join(romfs, 'data', name))),
  }
}

function matches(entry: ManifestEntry, filter: string, all: boolean): boolean {
  if (!all && !entry.path.endsWith('.sprite')) return false
  return filter === '' || entry.path.includes(filter)
}

/**
 * Summarise what a package actually contains, by extension and by directory.
 *
 * This is the first thing to run against a real RomFS: it answers "which of the
 * things we know how to read are in here, and how many" without decoding
 * anything, so the work of wiring a package up is a planning step rather than a
 * discovery-by-failure step.
 */
function probe(entries: ManifestEntry[], top: number): void {
  const byExtension = new Map<string, number>()
  const byDirectory = new Map<string, number>()
  for (const entry of entries) {
    const dot = entry.path.lastIndexOf('.')
    const extension = dot < 0 ? '(none)' : entry.path.slice(dot)
    byExtension.set(extension, (byExtension.get(extension) ?? 0) + 1)
    const segments = entry.path.split('/')
    const directory = segments.slice(0, Math.min(4, segments.length - 1)).join('/') || '/'
    byDirectory.set(directory, (byDirectory.get(directory) ?? 0) + 1)
  }

  const ranked = (map: Map<string, number>): Array<[string, number]> =>
    [...map.entries()].sort((a, b) => b[1] - a[1])

  process.stdout.write(`\nextensions (${byExtension.size}):\n`)
  for (const [extension, count] of ranked(byExtension).slice(0, 40)) {
    process.stdout.write(`  ${String(count).padStart(8)}  ${extension}\n`)
  }
  process.stdout.write(`\nbusiest directories:\n`)
  for (const [directory, count] of ranked(byDirectory).slice(0, top)) {
    process.stdout.write(`  ${String(count).padStart(8)}  ${directory}\n`)
  }
}

function usage(): void {
  process.stdout.write(
    [
      'extract-original — read original UI art out of your own RomFS',
      '',
      '  extract-original raw <path> [--out file] [--romfs dir]',
      '  extract-original probe [--romfs dir] [--top n]',
      '  extract-original list [filter] [--romfs dir] [--all]',
      '  extract-original extract <filter> [--romfs dir] [--out dir] [--limit n]',
      '  extract-original models [filter] [--romfs dir] [--out dir] [--limit n] [--json]',
      '',
      '  --romfs  RomFS directory (default $DM_ROMFS or ~/dm-work/…/RomFS)',
      '  --out    output directory (default examples/arpg/public/original)',
      '  --all    include non-.sprite files in the listing',
      '  --json   models: also write the .json sidecars that name each model\'s textures',
      '',
      '`models` writes the 3D containers out under their in-package paths, so the',
      'launcher, the tooling and `tools/verify-model.ts` can be pointed at them',
      'without a RomFS. Their geometry is BitKnit2-coded — see',
      'src/original/model.ts — so the containers are written verbatim, with a',
      'sidecar index.json recording what the decoder found in each one.',
      '',
      'No game data is downloaded; the output directory is git-ignored.',
      '',
    ].join('\n'),
  )
}

async function main(): Promise<void> {
  const { command, filter, options } = parseArgs(process.argv.slice(2))
  if (
    command !== 'list' &&
    command !== 'extract' &&
    command !== 'probe' &&
    command !== 'raw' &&
    command !== 'models'
  ) {
    usage()
    process.exit(command === '' ? 2 : 1)
  }

  const source = directorySource(options.romfs)
  let manifestText: string
  try {
    manifestText = await source.readManifest()
  } catch {
    process.stderr.write(
      `No package at ${options.romfs}\n` +
        'Point --romfs at the RomFS directory from your own game files.\n',
    )
    process.exit(1)
  }

  const entries = parseManifest(manifestText)

  if (command === 'probe') {
    probe(entries, options.limit)
    return
  }

  if (command === 'raw') {
    // Dump one entry's decompressed bytes, so a format we do not have a reader
    // for yet (for example `.texture`) can be inspected directly instead of
    // inferred. `--out` writes a file; without it the first bytes are printed.
    const entry =
      findEntry(entries, filter) ??
      entries.find((candidate) => candidate.path.includes(filter.toLowerCase()))
    if (!entry) {
      process.stderr.write(`no entry matching ${filter}\n`)
      process.exit(1)
    }
    const bytes = await readEntry(source, entry)
    process.stdout.write(`${entry.path}\n${bytes.length} bytes, encoding ${entry.encoding}\n`)
    const outFlag = process.argv.indexOf('--out')
    const out = outFlag >= 0 ? process.argv[outFlag + 1] : undefined
    if (out) {
      await writeFile(out, bytes)
      process.stdout.write(`wrote ${out}\n`)
    } else {
      const head = Array.from(bytes.subarray(0, 64))
      process.stdout.write(`first 64 bytes: ${head.map((b) => b.toString(16).padStart(2, '0')).join(' ')}\n`)
    }
    return
  }

  if (command === 'models') {
    // The 3D containers, written out exactly as the package stores them and
    // under their in-package paths: `terrain_lod0.model` alone occurs in
    // hundreds of directories, so flattening the tree would collide.
    //
    // Nothing is converted, because there is nothing to convert into: the
    // geometry inside every `.model` is BitKnit2-coded (see
    // src/original/model.ts). `index.json` records what the container decoder
    // found in each file — its chunk table and its stored records — so the tree
    // documents itself and a BitKnit2 decoder has only to be pointed at it.
    const selected = entries.filter(
      (entry) =>
        entry.path.endsWith('.model') &&
        (filter === '' || entry.path.toLowerCase().includes(filter.toLowerCase())),
    )
    process.stdout.write(`${entries.length} entries in the manifest, ${selected.length} models match\n`)
    const wanted = options.all ? selected.length : Math.min(selected.length, options.limit)
    await mkdir(options.out, { recursive: true })

    interface Written {
      path: string
      file: string
      bytes: number
      chunks: number
      codedBytes: number
      stored: Array<{ offset: number; length: number; words: number[] }>
      textures: string[]
    }
    const written: Written[] = []
    let failed = 0

    for (const entry of selected.slice(0, wanted)) {
      try {
        const bytes = await readEntry(source, entry)
        const model = decodeModel(bytes)
        const file = entry.path.replace(/^data\//, '')
        const target = join(options.out, file)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, bytes)
        const textures: string[] = []
        if (options.json) {
          const sidecar = findEntry(entries, sidecarPath(file))
          if (sidecar) {
            const text = new TextDecoder().decode(await readEntry(source, sidecar))
            await writeFile(join(options.out, sidecar.path.replace(/^data\//, '')), text)
            textures.push(...parseModelDependencies(text).textures.map((t) => t.path))
          }
        }
        written.push({
          path: entry.path,
          file,
          bytes: bytes.length,
          chunks: model.chunks.length,
          codedBytes: model.chunks
            .filter((chunk) => chunk.kind === 'entropyCoded')
            .reduce((sum, chunk) => sum + chunk.length, 0),
          stored: model.chunks
            .filter((chunk) => chunk.kind === 'stored')
            .map((chunk) => ({ offset: chunk.offset, length: chunk.length, words: chunk.words ?? [] })),
          textures,
        })
      } catch (error) {
        failed++
        process.stderr.write(`  ! ${entry.path}: ${(error as Error).message}\n`)
      }
    }

    await writeFile(
      join(options.out, 'index.json'),
      JSON.stringify(
        {
          generatedBy: 'examples/arpg/tools/extract-original.ts models',
          source: 'local RomFS extraction (not distributed)',
          note: 'containers are stored verbatim; their geometry is BitKnit2-coded, see src/original/model.ts',
          models: written,
        },
        null,
        2,
      ),
    )
    const coded = written.reduce((sum, item) => sum + item.codedBytes, 0)
    process.stdout.write(
      `wrote ${written.length} models to ${options.out} (${coded} bytes of coded geometry)`,
    )
    if (failed) process.stdout.write(` (${failed} failed)`)
    process.stdout.write('\n')
    if (written.length < selected.length) {
      process.stdout.write(`  ${selected.length} matched; raise --limit or pass --all to write them all\n`)
    }
    return
  }

  const selected = entries.filter((entry) => matches(entry, filter, options.all))
  process.stdout.write(`${entries.length} entries in the manifest, ${selected.length} match\n`)

  if (command === 'list') {
    for (const entry of selected.slice(0, options.limit)) process.stdout.write(`  ${entry.path}\n`)
    if (selected.length > options.limit) {
      process.stdout.write(`  … ${selected.length - options.limit} more (raise --limit)\n`)
    }
    return
  }

  await mkdir(options.out, { recursive: true })
  const written: Array<{ path: string; file: string; width: number; height: number }> = []
  let failed = 0

  for (const entry of selected) {
    try {
      const bytes = await readEntry(source, entry)
      const sprite = parseSprite(bytes)
      const png = await encodePng(sprite.rgba, sprite.width, sprite.height)
      // Written as PNG, so the file keeps the sprite's name but not its
      // container extension — the two are different things.
      const file = `${basename(entry.path, extname(entry.path))}.png`
      await writeFile(join(options.out, file), png)
      written.push({ path: entry.path, file, width: sprite.width, height: sprite.height })
    } catch (error) {
      failed++
      process.stderr.write(`  ! ${entry.path}: ${(error as Error).message}\n`)
    }
  }

  // The index is what the app reads, and it records provenance so it stays
  // obvious that these came from a local extraction and not from the repository.
  await writeFile(
    join(options.out, 'index.json'),
    JSON.stringify(
      {
        generatedBy: 'examples/arpg/tools/extract-original.ts',
        source: 'local RomFS extraction (not distributed)',
        sprites: written,
      },
      null,
      2,
    ),
  )

  process.stdout.write(`wrote ${written.length} sprites to ${options.out}`)
  if (failed) process.stdout.write(` (${failed} failed)`)
  process.stdout.write('\n')

  if (written.length === 0) {
    // A filter that matches nothing is the likeliest mistake, so show what is
    // available instead of leaving the user guessing.
    const sprites = entries.filter((entry) => entry.path.endsWith('.sprite'))
    process.stdout.write(`\n${sprites.length} .sprite paths are available, e.g.\n`)
    for (const entry of sprites.slice(0, 15)) process.stdout.write(`  ${entry.path}\n`)
  }
}

void main()
