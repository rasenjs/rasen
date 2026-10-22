#!/usr/bin/env node
/**
 * Verify the audio the app will actually play.
 *
 * Usage
 * -----
 *   tsx tools/verify-audio.ts            # check the exported game audio
 *   tsx tools/verify-audio.ts --dir DIR   # check a different sound directory
 *
 * What it answers
 * ---------------
 * 1. How many cues the app defines (`SOUND_NAMES` in `src/audio.ts`) and how
 *    many of them resolve to a real sample — the percentage is printed as it is,
 *    including `0/12`.
 * 2. What the manifest says it exported: its entries, their total bytes, and the
 *    logical path inside the game each one came from.
 * 3. Whether every entry is *playable*: the file exists, its size is what the
 *    manifest claims, and its container really is one a browser can decode
 *    (Ogg Opus / RIFF / MP3 / MP4 / WebM). A manifest that points at a file the
 *    browser cannot decode is the failure this tool exists to catch — the sound
 *    would silently do nothing at run time.
 *
 * Exit code is 1 when any of those checks fail. A missing manifest is not a
 * failure: the app is designed to run with no audio at all and synthesise every
 * cue.
 */

import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SOUND_NAMES,
  resolveCueSamples,
  type AudioSampleEntry,
  type AudioSampleManifest,
  type SoundName,
} from '../src/audio'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Container sniffers, in the order they are tried. */
const CONTAINERS: ReadonlyArray<{ name: string; test: (magic: Uint8Array, text: string) => boolean }> = [
  { name: 'ogg', test: (_magic, text) => text.startsWith('OggS') },
  { name: 'wav', test: (_magic, text) => text.startsWith('RIFF') },
  { name: 'mp3', test: (magic, text) => text.startsWith('ID3') || (magic[0] === 0xff && (magic[1] & 0xe0) === 0xe0) },
  { name: 'mp4', test: (_magic, text) => text.slice(4, 8) === 'ftyp' },
  { name: 'webm', test: (magic) => magic[0] === 0x1a && magic[1] === 0x45 && magic[2] === 0xdf && magic[3] === 0xa3 },
]

/** Formats the manifest may declare, mapped to the container we expect on disk. */
const EXPECTED_CONTAINER: Record<string, string> = {
  opus: 'ogg',
  ogg: 'ogg',
  wav: 'wav',
  mp3: 'mp3',
  m4a: 'mp4',
  aac: 'mp4',
  webm: 'webm',
}

interface Options {
  dir: string
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dir: join(HERE, '..', 'public', 'original', 'sfx') }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') options.dir = argv[++i]
  }
  return options
}

/** The container a file actually starts with, or `null` when nothing matches. */
function containerOf(magic: Uint8Array): string | null {
  const text = String.fromCharCode(...magic.slice(0, 12))
  for (const container of CONTAINERS) {
    if (container.test(magic, text)) return container.name
  }
  return null
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const failures: string[] = []

  const cues: readonly SoundName[] = SOUND_NAMES
  process.stdout.write(`cues defined by the app: ${cues.length}\n`)

  let manifest: AudioSampleManifest | null = null
  try {
    const text = await readFile(join(options.dir, 'manifest.json'), 'utf8')
    manifest = JSON.parse(text) as AudioSampleManifest
  } catch {
    process.stdout.write(
      `\nNo manifest at ${join(options.dir, 'manifest.json')}\n` +
        'Nothing has been exported, so every cue is synthesised. Run:\n' +
        '  ./node_modules/.bin/tsx examples/arpg/tools/export-audio.ts\n',
    )
    process.stdout.write(`\ncues with real audio: 0/${cues.length} (0.0%)\n`)
    return
  }

  const entries: AudioSampleEntry[] = [...(manifest.entries ?? [])]
  if (manifest.music) entries.push(manifest.music)

  // -- the manifest's own integrity ----------------------------------------
  const audioEntries = manifest.entries ?? []
  const defined = new Set<string>(cues)
  const seen = new Set<string>()
  for (const entry of audioEntries) {
    if (typeof entry?.cue !== 'string' || !defined.has(entry.cue)) {
      failures.push(`manifest lists cue "${String(entry?.cue)}", which the app does not define`)
      continue
    }
    if (seen.has(entry.cue)) failures.push(`manifest lists cue "${entry.cue}" twice`)
    seen.add(entry.cue)
  }
  const resolved = resolveCueSamples(manifest)
  if (resolved.size !== seen.size) {
    failures.push(
      `the app resolves ${resolved.size} of the manifest's ${seen.size} distinct cues — they disagree`,
    )
  }

  // -- per-entry file checks ----------------------------------------------
  process.stdout.write(`\n${entries.length} entries in the manifest:\n`)
  let declared = 0
  for (const entry of entries) {
    const label = entry.cue === 'music' ? 'music' : entry.cue
    const at = join(options.dir, entry.file)
    let size = -1
    try {
      size = (await stat(at)).size
    } catch {
      failures.push(`${label}: ${entry.file} is missing from ${options.dir}`)
      process.stdout.write(`  ${label.padEnd(12)} ${entry.file} MISSING\n`)
      continue
    }
    if (typeof entry.bytes === 'number' && entry.bytes !== size) {
      failures.push(
        `${label}: ${entry.file} is ${size} bytes but the manifest says ${entry.bytes}`,
      )
    }
    const magic = new Uint8Array(await readFile(at)).slice(0, 12)
    const container = containerOf(magic)
    const expected = EXPECTED_CONTAINER[entry.format ?? ''] ?? null
    if (expected && container !== expected) {
      failures.push(
        `${label}: ${entry.file} is declared ${entry.format} but its bytes look like ${container ?? 'an unknown container'}`,
      )
    }
    declared += size
    process.stdout.write(
      `  ${label.padEnd(12)} ${entry.file.padEnd(20)} ${String(size).padStart(9)} B  ${container ?? '?'}  ${entry.source ?? ''}\n`,
    )
  }

  // -- the totals -----------------------------------------------------------
  const percentage = cues.length === 0 ? 0 : (resolved.size / cues.length) * 100
  process.stdout.write(
    `\ncues with real audio: ${resolved.size}/${cues.length} (${percentage.toFixed(1)}%)\n`,
  )
  const synthesised = cues.filter((cue) => !resolved.has(cue))
  process.stdout.write(
    `still synthesised: ${synthesised.length === 0 ? '(none)' : synthesised.join(', ')}\n`,
  )
  process.stdout.write(`bytes on disk: ${declared}\n`)
  if (typeof manifest.totalBytes === 'number') {
    process.stdout.write(`manifest totalBytes: ${manifest.totalBytes}\n`)
    if (manifest.totalBytes !== declared) {
      failures.push(
        `manifest totalBytes is ${manifest.totalBytes} but the files add up to ${declared}`,
      )
    }
  }

  if (failures.length > 0) {
    process.stdout.write(`\n${failures.length} problem(s):\n`)
    for (const failure of failures) process.stdout.write(`  - ${failure}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write('\nOK: every manifest entry exists, is the size it claims, and is playable.\n')
}

await main()
