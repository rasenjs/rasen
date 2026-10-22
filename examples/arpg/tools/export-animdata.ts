/**
 * Exports every animation's speed and frame count out of `global/AnimData.D2`.
 *
 * The game's animation clock is not in the data tables this app already exports —
 * `plrmode.txt` and `monmode.txt` are names and tokens, `monseq.txt` routes events,
 * `monstats2.txt` is geometry — it is in one file, and this tool is what reads it out
 * of a copy the user owns and writes the table the app loads:
 *
 * ```
 * <out>/animdata.json
 * ```
 *
 * ## Where the file comes from
 *
 * `AnimData.D2` lives *inside* the package's archives, not on the RomFS as a path you
 * can copy: the RomFS holds a `build_manifest.psv` index and a set of `.data` archives
 * that entries are sliced out of. This tool reads the package the same way
 * `extract-original.ts` does — manifest, then archive, then decompress — and the
 * reader verifies the entry's MD5 against the manifest, so a package of the wrong
 * version fails loudly instead of decoding into a wrong table.
 *
 * The package's RomFS is produced from a dump of the user's own cartridge; see
 * `tools/extract-original.ts` for the chain. The **update** partition is the one to
 * point this at when there is a choice: `v1.0.34.0`'s patch replaces
 * `AnimData.D2` (586,784 bytes) with values the base cartridge's copy (570,304
 * bytes) does not have, and the update is what a console loads.
 *
 * Nothing is downloaded and no game data is written outside the out dir, which is
 * git-ignored (`examples/arpg/public/original/`).
 *
 * ## Usage
 *
 * ```
 * tsx tools/export-animdata.ts --romfs <RomFS dir> [--out dir]
 * tsx tools/export-animdata.ts --file <AnimData.D2>
 * ```
 *
 * `--file` is for a `.d2` that is already unpacked — the tool reads the same bytes
 * without needing the archives around them, which is what its own tests use.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAnimData, ANIMDATA_RECORD_BYTES, SPEED_SCALE } from '../src/d2/anim-timing'
import { findEntry, parseManifest, readEntry, type RomfsSource } from '../src/original/romfs'

const HERE = dirname(fileURLToPath(import.meta.url))
/** The package path of the table. `findEntry` is case-insensitive. */
const ANIMDATA_PATH = 'global/animdata.d2'

interface Options {
  romfs: string
  out: string
  file: string | null
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    romfs:
      process.env.DM_ROMFS ??
      join(process.env.HOME ?? '', 'dm-work/data/switch/3.3.94012/Update/RomFS'),
    out: join(HERE, '..', 'public', 'original'),
    file: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--romfs') options.romfs = argv[++i]
    else if (arg === '--out') options.out = argv[++i]
    else if (arg === '--file') options.file = argv[++i]
    else {
      process.stderr.write(`unknown argument ${arg}\n`)
      process.exit(2)
    }
  }
  return options
}

/** A RomFS laid out as directories, as `hactool` writes it. */
function directorySource(romfs: string): RomfsSource {
  return {
    readManifest: () => readFile(join(romfs, 'data', 'build_manifest.psv'), 'utf8'),
    readArchive: async (name) => new Uint8Array(await readFile(join(romfs, 'data', name))),
  }
}

async function readAnimDataBytes(options: Options): Promise<{ bytes: Uint8Array; from: string }> {
  if (options.file !== null) {
    return { bytes: new Uint8Array(await readFile(options.file)), from: options.file }
  }
  const source = directorySource(options.romfs)
  let manifestText: string
  try {
    manifestText = await source.readManifest()
  } catch {
    process.stderr.write(
      `No package at ${options.romfs}\n` +
        'Point --romfs at the RomFS directory from your own game files, or --file at\n' +
        'an AnimData.D2 you have already unpacked.\n',
    )
    process.exit(1)
  }
  const entry = findEntry(parseManifest(manifestText), ANIMDATA_PATH)
  if (entry === null) {
    process.stderr.write(`${ANIMDATA_PATH} is not in this package\n`)
    process.exit(1)
  }
  return { bytes: await readEntry(source, entry), from: `${options.romfs} (${entry.path})` }
}

/** Counts keyed by value, for the report. */
function histogram(values: readonly number[]): Array<[number, number]> {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const { bytes, from } = await readAnimDataBytes(options)
  const data = parseAnimData(bytes)

  const records = [...data.records.values()]
  const speeds = records.map((record) => record.speed)
  const frames = records.map((record) => record.frames)

  process.stdout.write(`AnimData.D2: ${bytes.length} bytes from ${from}\n`)
  process.stdout.write(
    `  ${ANIMDATA_RECORD_BYTES}-byte records, ${data.blockCounts.length} blocks, ` +
      `${records.length} records, ` +
      `${data.blockCounts.filter((count) => count === 0).length} empty blocks\n`,
  )
  process.stdout.write(`  frames: ${JSON.stringify(histogram(frames).slice(0, 10))}\n`)
  process.stdout.write(
    `  speed: max ${Math.max(...speeds)}, min ${Math.min(...speeds)}, ` +
      `values ${histogram(speeds).length}, top ${JSON.stringify(histogram(speeds).slice(0, 6))}\n`,
  )
  const odd = speeds.filter((speed) => speed % 8 !== 0)
  process.stdout.write(
    `  speeds that are not a multiple of 8: ${odd.length}\n` +
      `  speeds above the ${SPEED_SCALE} scale: ${speeds.filter((s) => s > SPEED_SCALE).length}\n` +
      `  records with speed 0 (a frozen animation): ${speeds.filter((s) => s === 0).length}\n` +
      `  rows the file states twice: ${[...data.duplicates.values()].reduce(
        (n, rows) => n + rows.length - 1,
        0,
      )}\n` +
      `  records with an uninterpreted tail: ${data.uninterpreted.size}\n`,
  )

  const document = {
    note:
      'global/AnimData.D2 from the game\'s own files: a sequence of blocks, each a ' +
      'u32 record count followed by that many 160-byte records. A record is ' +
      'token[8] (ASCII, NUL padded, <unit><mode><weapon>), a u32 frame count, a u32 ' +
      'speed in 1/256 of a frame per game frame, and 144 bytes this reader does not ' +
      'interpret. Decoded by src/d2/anim-timing.ts; see its header for how each ' +
      'field was established. `records` holds the first row of a token the file ' +
      'states twice; `duplicates` holds the rest, so nothing is dropped.',
    source: from,
    recordBytes: ANIMDATA_RECORD_BYTES,
    speedScale: SPEED_SCALE,
    blockCounts: data.blockCounts,
    records: Object.fromEntries(
      records.map((record) => [record.token, { frames: record.frames, speed: record.speed }]),
    ),
    duplicates: Object.fromEntries(
      [...data.duplicates].map(([token, rows]) => [
        token,
        rows.map((row) => ({ frames: row.frames, speed: row.speed })),
      ]),
    ),
    uninterpreted: Object.fromEntries(data.uninterpreted),
  }

  await mkdir(options.out, { recursive: true })
  const out = join(options.out, 'animdata.json')
  await writeFile(out, JSON.stringify(document))
  const written = JSON.stringify(document).length
  process.stdout.write(`wrote ${out} (${written} bytes)\n`)
}

void main()
