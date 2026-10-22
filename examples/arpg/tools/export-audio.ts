#!/usr/bin/env node
/**
 * Export the game's own sound effects and music out of *your own* Diablo II:
 * Resurrected RomFS, one file per cue the app knows how to play.
 *
 * Usage
 * -----
 *   tsx tools/export-audio.ts            # export a sample per cue + a manifest
 *   tsx tools/export-audio.ts --list     # report what is in the package, write nothing
 *
 * Options
 * -------
 *   --romfs <dir>  extracted RomFS holding `data/build_manifest.psv` and the
 *                  `data/*.data` archives (default `$D2R_ROMFS`, else
 *                  `~/d2r-audio-work/romfs`)
 *   --out <dir>    output directory (default `examples/arpg/public/original/sfx`)
 *
 * Where the files come from
 * -------------------------
 * The package is read with the same reader the art exporter uses
 * (`src/original/romfs.ts`), so every sample is MD5-checked against the manifest
 * and a wrong game build fails loudly instead of exporting a wrong sound. This
 * tool downloads nothing; the output directory is git-ignored, and the game's
 * audio is never copied into the repository.
 *
 * What it exports, and why
 * ------------------------
 * One file per cue in `src/audio.ts` (`CUE_SOURCES` below). A cue is matched by
 * *name* — the game's own file names are descriptive (`critical_shot.opus`,
 * `cursor_level_up_1_hd.opus`, `sorceress_frostnova_opus`) — and, when a name has
 * several takes (`weapon_onehandswingsmall_1..6`), the smallest one inside the
 * highest-definition tier that has any match. Cues with no plausible match are
 * left out and reported as such: the app synthesises those, because a wrong
 * sound is worse than an honest one.
 *
 * The game's audio container
 * --------------------------
 * Every sound in the package is a `.opus` file that is **not** an Ogg stream:
 * it is a two-chunk container the game's own player understands. Measured from
 * the files themselves:
 *
 * ```
 * 0x00  u32le 0x80000001      chunk "format"
 * 0x04  u32le 24              its length
 * 0x08  u16le flags           0x0100 mono, 0x0200 stereo
 * 0x0a  u16le recordSize      bytes per record: 108 (mono/16 kHz), 248 (music)
 * 0x0c  u32le sampleRate      the original recording rate (16000 or 48000)
 * 0x10  u32le 32              constant in every file seen; purpose unknown
 * 0x14  u32le 0, 0x18 u32le 0 reserved
 * 0x1c  u32le 104 | 120       scales with the record; purpose unknown
 * 0x20  u32le 0x80000004      chunk "audio"
 * 0x24  u32le n               its length
 * 0x28  records, `recordSize` bytes each:
 *         u32be packetLength   bytes of Opus that follow
 *         u32be <unknown>      per-packet, not a CRC32/CRC32c/adler/md5 prefix
 *         Opus packet          `packetLength` bytes; recordSize = 8 + packetLength
 * ```
 *
 * The packets are ordinary 20 ms Opus packets (960 samples at 48 kHz); the two
 * trailing fields and the two unknown header words are recorded here but not
 * used. This tool re-frames those packets as a standard Ogg Opus file, which is
 * what a browser can decode: the packets themselves are copied bit-for-bit, so
 * nothing is re-encoded and no audio is lost.
 *
 * Verification during development: after re-framing, `ffmpeg` decodes the export
 * with no errors, `global/music/act1/town1` gives 247.2 s of audio whose energy
 * sits in 60-500 Hz with 56-75% of it in the harmonics of a ~164 Hz fundamental,
 * and the 16 kHz sound effects have under 0.5% of their energy above 8 kHz —
 * i.e. what a decoded sound is supposed to look like, not noise.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SOUND_NAMES, type SoundName } from '../src/audio'
import { parseManifest, readEntry, type ManifestEntry, type RomfsSource } from '../src/original/romfs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** One decoded sound asset: the game's format, reduced to Opus packets. */
export interface OpusAsset {
  /** 1 or 2, from the header flag and cross-checked against every packet's TOC. */
  channels: number
  /** The original recording rate stored in the header (informational for Opus). */
  sampleRate: number
  /** The bytes of each 20 ms Opus packet, in order. */
  packets: Uint8Array[]
  /** Bytes per record in the container. */
  recordSize: number
}

/** Chunky little-endian reads, kept explicit so the offsets above stay readable. */
function u16le(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8)
}

function u32le(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
}

function u32be(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
  )
}

const CHUNK_FORMAT = 0x80000001
const CHUNK_AUDIO = 0x80000004

/**
 * Split one of the game's `.opus` files into the Opus packets it carries.
 *
 * Throws when a file does not match the measured layout, rather than exporting
 * silence: a sound that cannot be read is a cue that stays synthesised.
 *
 * @param bytes the file exactly as the RomFS reader returned it (MD5-verified)
 * @returns the packets plus the parameters needed to frame them
 */
export function decodeOpusAsset(bytes: Uint8Array): OpusAsset {
  if (bytes.length < 0x28) throw new Error('audio: file is too short for the container header')
  if (u32le(bytes, 0) !== CHUNK_FORMAT) {
    throw new Error(`audio: unexpected first chunk 0x${u32le(bytes, 0).toString(16)}`)
  }
  const headerLength = u32le(bytes, 4)
  const flags = u16le(bytes, 8)
  const recordSize = u16le(bytes, 10)
  const sampleRate = u32le(bytes, 12)
  const audioAt = 8 + headerLength
  if (u32le(bytes, audioAt) !== CHUNK_AUDIO) {
    throw new Error(`audio: unexpected second chunk 0x${u32le(bytes, audioAt).toString(16)}`)
  }
  const audioLength = u32le(bytes, audioAt + 4)
  const body = bytes.subarray(audioAt + 8, audioAt + 8 + audioLength)
  if (recordSize < 9 || body.length % recordSize !== 0) {
    throw new Error(`audio: ${body.length} bytes is not a whole number of ${recordSize}-byte records`)
  }

  const channels = flags & 0x0200 ? 2 : 1
  const packets: Uint8Array[] = []
  for (let at = 0; at < body.length; at += recordSize) {
    const length = u32be(body, at)
    if (length === 0 || at + 8 + length > body.length) {
      throw new Error(`audio: record ${packets.length} claims ${length} bytes`)
    }
    const packet = body.subarray(at + 8, at + 8 + length)
    // The TOC byte's stereo bit has to agree with the header, or one of the two
    // is being misread and every sample after it would be wrong.
    const stereo = (packet[0] & 0x04) !== 0
    if (stereo !== (channels === 2)) {
      throw new Error(
        `audio: record ${packets.length} is ${stereo ? 'stereo' : 'mono'} but the header says ${channels} channel(s)`,
      )
    }
    packets.push(packet)
  }
  return { channels, sampleRate, packets, recordSize }
}

/** Ogg's CRC: polynomial 0x04c11db7, MSB first, no reflection, zero initial value. */
const CRC_TABLE = ((): Int32Array => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let remainder = i << 24
    for (let bit = 0; bit < 8; bit++) {
      remainder =
        remainder & 0x80000000 ? (remainder << 1) ^ 0x04c11db7 : (remainder << 1)
    }
    table[i] = remainder
  }
  return table
})()

function oggCrc(bytes: Uint8Array): number {
  let crc = 0
  for (const byte of bytes) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0
  }
  return crc >>> 0
}

/** One Ogg page: header, segment table, then the packets it carries back to back. */
function oggPage(
  serial: number,
  sequence: number,
  granule: bigint,
  packets: readonly Uint8Array[],
  flags: number,
): Uint8Array {
  const segments: number[] = []
  let size = 0
  for (const packet of packets) {
    let remaining = packet.length
    while (remaining >= 255) {
      segments.push(255)
      remaining -= 255
    }
    segments.push(remaining)
    size += packet.length
  }
  const page = new Uint8Array(27 + segments.length + size)
  page.set([0x4f, 0x67, 0x67, 0x53, 0, flags], 0)
  new DataView(page.buffer).setBigUint64(6, granule, true)
  const view = new DataView(page.buffer)
  view.setUint32(14, serial, true)
  view.setUint32(18, sequence, true)
  view.setUint32(22, 0, true)
  page[26] = segments.length
  page.set(segments, 27)
  let at = 27 + segments.length
  for (const packet of packets) {
    page.set(packet, at)
    at += packet.length
  }
  view.setUint32(22, oggCrc(page), true)
  return page
}

/** 20 ms per packet at Opus's fixed 48 kHz decoding rate. */
const SAMPLES_PER_PACKET = 960
/** Packets per page: fewer pages than one-per-packet, still comfortably small. */
const PACKETS_PER_PAGE = 40

/** Containers a browser can decode as they are, so they need no re-framing. */
const DECODABLE: readonly string[] = ['ogg', 'oga', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'webm']

/** One line of the exported manifest. */
interface WrittenEntry {
  cue: string
  file: string
  source: string
  bytes: number
  format: string
  packets?: number
  channels?: number
  sampleRate?: number
}

/**
 * Walk an Ogg Opus stream and check every page.
 *
 * Used on our own output before it is written: a stream whose page CRCs or
 * segment tables are wrong is a cue that silently plays nothing, so it is better
 * to refuse it here than to discover it in the browser. The two header pages
 * (`OpusHead`, `OpusTags`) are checked by name and not counted as audio packets.
 *
 * @param file the bytes of an Ogg stream
 * @returns whether every page checked out, how many audio packets were found, and why not
 */
export function inspectOggOpus(file: Uint8Array): {
  ok: boolean
  pages: number
  packets: number
  reason: string
} {
  let at = 0
  let pages = 0
  let packets = 0
  while (at < file.length) {
    if (at + 27 > file.length || u32be(file, at) !== 0x4f676753) {
      return { ok: false, pages, packets, reason: `page ${pages} does not start with OggS` }
    }
    const segments = file[at + 26]
    const tableAt = at + 27
    let bodyLength = 0
    for (let i = 0; i < segments; i++) bodyLength += file[tableAt + i]
    const size = 27 + segments + bodyLength
    if (at + size > file.length) {
      return { ok: false, pages, packets, reason: `page ${pages} runs past the end of the file` }
    }
    const page = file.slice(at, at + size)
    const stored = u32le(page, 22)
    const zeroed = page.slice()
    new DataView(zeroed.buffer).setUint32(22, 0, true)
    if (oggCrc(zeroed) !== stored) {
      return { ok: false, pages, packets, reason: `page ${pages} fails its CRC` }
    }
    const bodyAt = 27 + segments
    const magic = String.fromCharCode(...page.subarray(bodyAt, bodyAt + 8))
    if (pages === 0 && magic !== 'OpusHead') {
      return { ok: false, pages, packets, reason: 'the first page is not an OpusHead' }
    }
    if (pages === 1 && magic !== 'OpusTags') {
      return { ok: false, pages, packets, reason: 'the second page is not an OpusTags' }
    }
    if (pages >= 2) {
      packets += page.subarray(27, 27 + segments).filter((value) => value < 255).length
    }
    pages++
    at += size
  }
  return {
    ok: at === file.length && pages >= 3 && packets > 0,
    pages,
    packets,
    reason: at === file.length ? '' : 'trailing bytes',
  }
}

/**
 * Re-frame decoded packets as a standard Ogg Opus stream.
 *
 * The packets are copied verbatim; only the container is written, so this is a
 * lossless change of framing — the same audio the game plays.
 *
 * @param asset a decoded asset, as returned by {@link decodeOpusAsset}
 * @returns the complete `.ogg` file
 */
export function encodeOggOpus(asset: OpusAsset): Uint8Array {
  if (asset.packets.length === 0) throw new Error('audio: refusing to write an empty stream')
  const head = new Uint8Array(19)
  head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0) // "OpusHead"
  head[8] = 1
  head[9] = asset.channels
  const headView = new DataView(head.buffer)
  headView.setUint16(10, 0, true) // pre-skip: the game's own value is not in the file
  headView.setUint32(12, asset.sampleRate, true)
  headView.setInt16(16, 0, true)
  head[18] = 0

  const vendor = new TextEncoder().encode('rasen/arpg')
  const tags = new Uint8Array(8 + 4 + vendor.length + 4)
  tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0) // "OpusTags"
  const tagsView = new DataView(tags.buffer)
  tagsView.setUint32(8, vendor.length, true)
  tags.set(vendor, 12)
  tagsView.setUint32(12 + vendor.length, 0, true)

  const pages: Uint8Array[] = [oggPage(0x72617365, 0, 0n, [head], 0x02), oggPage(0x72617365, 1, 0n, [tags], 0)]
  let sequence = 2
  let granule = 0n
  for (let at = 0; at < asset.packets.length; at += PACKETS_PER_PAGE) {
    const group = asset.packets.slice(at, at + PACKETS_PER_PAGE)
    granule += BigInt(group.length * SAMPLES_PER_PACKET)
    const last = at + PACKETS_PER_PAGE >= asset.packets.length
    pages.push(oggPage(0x72617365, sequence++, granule, group, last ? 0x04 : 0))
  }

  const total = pages.reduce((sum, page) => sum + page.length, 0)
  const file = new Uint8Array(total)
  let at = 0
  for (const page of pages) {
    file.set(page, at)
    at += page.length
  }
  return file
}

/** How a cue is found in the package. `match` values are substring tests. */
interface CueSource {
  cue: SoundName
  /** Path fragments, any of which selects a candidate. */
  match: readonly string[]
  /** Why this is the right sound, for the report and for review. */
  why: string
}

/**
 * Cue -> game file, by name.
 *
 * `match` fragments are matched case-insensitively against the logical path
 * inside the package, so `weapon_onehandswingsmall` selects the six one-handed
 * swing takes and the smallest HD one is exported.
 */
const CUE_SOURCES: readonly CueSource[] = [
  {
    cue: 'swing',
    match: ['sfx/combat/weapon/weapon_onehandswingsmall'],
    why: 'a one-handed weapon swing (the hero attacks with a one-hander)',
  },
  {
    cue: 'hit',
    match: ['sfx/combat/impact/damage_dealt'],
    why: 'the impact the game plays when a hit lands ("damage dealt")',
  },
  {
    cue: 'crit',
    match: ['sfx/combat/impact/critical_shot'],
    why: 'the only file the game names after a critical hit',
  },
  {
    cue: 'fireball',
    match: ['sfx/skill/sorceress/sorceress_fireball_'],
    why: 'the Sorceress Fireball cast',
  },
  {
    cue: 'nova',
    match: ['sfx/skill/sorceress/sorceress_frostnova'],
    why: 'the app\'s nova skill is Frost Nova, and this is its cast',
  },
  {
    cue: 'potion',
    match: ['sfx/item/item_potiondrink'],
    why: 'drinking a potion',
  },
  {
    cue: 'pickup-gold',
    match: ['sfx/item/item_gold'],
    why: 'picking gold up off the ground',
  },
  {
    cue: 'pickup-item',
    match: ['sfx/cursor/cursor_item_pickup'],
    why: 'the UI sound for picking an item up',
  },
  {
    cue: 'levelup',
    match: ['sfx/cursor/cursor_level_up_1', 'sfx/cursor/levelup.opus'],
    why: 'the character level-up jingle (not the hireling variant)',
  },
  {
    cue: 'death',
    match: ['sfx/monster/skeleton/monster_skeleton_death'],
    why: 'a monster death — this cue fires on every kill; the hero\'s death cry is per-class, so no single file answers it',
  },
  {
    cue: 'ui',
    match: ['sfx/cursor/cursor_button'],
    why: 'a UI button click',
  },
  {
    cue: 'roar',
    match: ['sfx/monster/fallen/roar'],
    why: 'a demon roar: the game has no roar for the app\'s stand-in boss, and Fallen roars are the only ones besides the Druid bear\'s',
  },
]

/** The looping music track: the Act I town theme, which is where the game starts. */
const MUSIC_MATCH: readonly string[] = ['music/act1/town1']

/** Formats the browser can decode directly, best first. Nothing else is preferred over `.wav`. */
const FORMAT_RANK: readonly string[] = ['opus', 'ogg', 'mp3', 'm4a', 'aac', 'wav']

interface Candidate {
  path: string
  bytes: number
  format: string
  /** 0 = the HD tree, 1 = the classic tree. */
  tier: number
}

interface Options {
  romfs: string
  out: string
  list: boolean
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    romfs:
      process.env.D2R_ROMFS ?? join(process.env.HOME ?? '', 'd2r-audio-work', 'romfs'),
    out: join(HERE, '..', 'public', 'original', 'sfx'),
    list: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--romfs') options.romfs = argv[++i]
    else if (arg === '--out') options.out = argv[++i]
    else if (arg === '--list') options.list = true
  }
  return options
}

/**
 * A directory-backed RomFS source that keeps the last couple of archives in
 * memory. Each archive is up to 1 GiB and every entry read starts by slicing
 * one, so without this a 13-file export re-reads gigabytes.
 */
function directorySource(romfs: string, cacheLimit = 2): RomfsSource {
  const cache = new Map<string, Uint8Array>()
  return {
    readManifest: () => readFile(join(romfs, 'data', 'build_manifest.psv'), 'utf8'),
    readArchive: async (name) => {
      const hit = cache.get(name)
      if (hit) {
        // Refresh recency: the Map's insertion order is the eviction order.
        cache.delete(name)
        cache.set(name, hit)
        return hit
      }
      const bytes = new Uint8Array(await readFile(join(romfs, 'data', name)))
      cache.set(name, bytes)
      if (cache.size > cacheLimit) {
        const oldest = cache.keys().next()
        if (!oldest.done) cache.delete(oldest.value)
      }
      return bytes
    },
  }
}

/** Manifest paths are prefixed with the archive-relative root (`data/`). */
function logicalPath(path: string): string {
  return path.startsWith('data/') ? path.slice('data/'.length) : path
}

/** The tree an audio file belongs to, with locale directories collapsed. */
function treeOf(path: string): string {
  const logical = logicalPath(path)
  const locale = /^locales\/audio\/[a-z]{4}\//.exec(logical)
  const normalised = locale
    ? logical.replace(/^locales\/audio\/[a-z]{4}\//, 'locales/audio/*/')
    : logical
  const segments = normalised.split('/')
  const audio = segments.findIndex((segment) => segment === 'sfx' || segment === 'music')
  return audio < 0 ? normalised : segments.slice(0, audio + 1).join('/')
}

function formatOf(path: string): string {
  const extension = extname(path)
  return extension === '' ? '(none)' : extension.slice(1).toLowerCase()
}

function isAudioDirectory(path: string): boolean {
  return /(^|\/)sfx\//.test(path) || /(^|\/)music\//.test(path)
}

/**
 * Rank candidates for one cue: highest-definition tier first, then a decodable
 * container, then the smallest file, then path order so a re-run is stable.
 */
function choose(candidates: readonly Candidate[]): Candidate | null {
  const ranked = [...candidates].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    const rank = (candidate: Candidate): number => {
      const at = FORMAT_RANK.indexOf(candidate.format)
      return at < 0 ? FORMAT_RANK.length : at
    }
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (a.bytes !== b.bytes) return a.bytes - b.bytes
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  })
  return ranked[0] ?? null
}

function candidatesFor(entries: readonly ManifestEntry[], match: readonly string[]): Candidate[] {
  const found: Candidate[] = []
  for (const entry of entries) {
    if (!isAudioDirectory(entry.path)) continue
    if (!match.some((fragment) => entry.path.includes(fragment))) continue
    found.push({
      path: entry.path,
      bytes: entry.rawLength,
      format: formatOf(entry.path),
      tier: logicalPath(entry.path).startsWith('hd/') ? 0 : 1,
    })
  }
  return found
}

/** File count, stored bytes and formats per audio tree. */
function reportTrees(entries: readonly ManifestEntry[]): void {
  const trees = new Map<string, { files: number; bytes: number; formats: Map<string, number> }>()
  for (const entry of entries) {
    if (!isAudioDirectory(entry.path)) continue
    const tree = treeOf(entry.path)
    let stats = trees.get(tree)
    if (!stats) {
      stats = { files: 0, bytes: 0, formats: new Map() }
      trees.set(tree, stats)
    }
    stats.files++
    stats.bytes += entry.rawLength
    const format = formatOf(entry.path)
    stats.formats.set(format, (stats.formats.get(format) ?? 0) + 1)
  }

  const ranked = [...trees.entries()].sort((a, b) => b[1].bytes - a[1].bytes)
  process.stdout.write(`\naudio trees (${ranked.length}):\n`)
  let files = 0
  let bytes = 0
  for (const [tree, stats] of ranked) {
    const formats = [...stats.formats.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([format, count]) => `${format} ${count}`)
      .join(', ')
    process.stdout.write(
      `  ${String(stats.files).padStart(7)} files ${String(stats.bytes).padStart(13)} bytes  ${tree}\n` +
        `  ${' '.repeat(7)}       ${' '.repeat(13)}        ${formats}\n`,
    )
    files += stats.files
    bytes += stats.bytes
  }
  process.stdout.write(
    `  ${String(files).padStart(7)} files ${String(bytes).padStart(13)} bytes  total\n`,
  )
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const source = directorySource(options.romfs)

  let manifestText: string
  try {
    manifestText = await source.readManifest()
  } catch {
    process.stderr.write(
      `No package at ${options.romfs}\n` +
        'Point --romfs (or $D2R_ROMFS) at the RomFS directory extracted from your own copy:\n' +
        '  hactool -t nca -k prod.keys --romfsdir=romfs base.nca\n',
    )
    process.exit(1)
  }

  const entries = parseManifest(manifestText)
  reportTrees(entries)

  const resolved = new Map<SoundName, { candidate: Candidate; entry: ManifestEntry; why: string }>()
  const unmatched: SoundName[] = []
  for (const spec of CUE_SOURCES) {
    const candidates = candidatesFor(entries, spec.match)
    const candidate = choose(candidates)
    const entry = candidate ? entries.find((e) => e.path === candidate.path) : undefined
    if (!candidate || !entry) {
      unmatched.push(spec.cue)
      continue
    }
    resolved.set(spec.cue, { candidate, entry, why: spec.why })
  }

  process.stdout.write(`\ncue -> game file (${resolved.size}/${SOUND_NAMES.length} matched):\n`)
  for (const spec of CUE_SOURCES) {
    const hit = resolved.get(spec.cue)
    if (!hit) {
      process.stdout.write(`  ${spec.cue.padEnd(12)} (no match — stays synthesised)\n`)
      continue
    }
    process.stdout.write(
      `  ${spec.cue.padEnd(12)} ${String(hit.candidate.bytes).padStart(9)} B  ${logicalPath(hit.candidate.path)}\n` +
        `  ${' '.repeat(12)} ${hit.why}\n`,
    )
  }

  const musicCandidates = candidatesFor(entries, MUSIC_MATCH)
  const music = choose(musicCandidates)
  process.stdout.write(
    `\nmusic track: ${music ? `${String(music.bytes)} B  ${logicalPath(music.path)}` : '(no match)'}\n`,
  )

  if (options.list) return

  if (resolved.size === 0 && !music) {
    process.stderr.write('Nothing matched — refusing to write an empty manifest.\n')
    process.exit(1)
  }

  await mkdir(options.out, { recursive: true })

  const written: WrittenEntry[] = []
  const skipped: string[] = []
  let total = 0

  /** Convert one package entry into a browser-playable file, or explain why not. */
  const exportEntry = async (
    entry: ManifestEntry,
    label: string,
  ): Promise<{ bytes: Uint8Array; file: string; format: string; packets: number; channels: number; sampleRate: number } | null> => {
    const format = formatOf(entry.path)
    const raw = await readEntry(source, entry)
    if (format !== 'opus') {
      if (!DECODABLE.includes(format)) {
        skipped.push(`${label}: ${logicalPath(entry.path)} is a ${format}, which the browser does not decode`)
        return null
      }
      return { bytes: raw, file: `${label}.${format}`, format, packets: 0, channels: 0, sampleRate: 0 }
    }
    const asset = decodeOpusAsset(raw)
    const ogg = encodeOggOpus(asset)
    const check = inspectOggOpus(ogg)
    if (!check.ok || check.packets !== asset.packets.length) {
      skipped.push(`${label}: re-framed stream failed its own check (${check.reason})`)
      return null
    }
    return {
      bytes: ogg,
      file: `${label}.ogg`,
      format: 'opus',
      packets: asset.packets.length,
      channels: asset.channels,
      sampleRate: asset.sampleRate,
    }
  }

  for (const [cue, hit] of resolved) {
    const result = await exportEntry(hit.entry, cue)
    if (!result) continue
    await writeFile(join(options.out, result.file), result.bytes)
    written.push({
      cue,
      file: result.file,
      source: logicalPath(hit.candidate.path),
      bytes: result.bytes.length,
      format: result.format,
      ...(result.packets > 0
        ? { packets: result.packets, channels: result.channels, sampleRate: result.sampleRate }
        : {}),
    })
    total += result.bytes.length
  }

  let musicEntry: WrittenEntry | null = null
  if (music) {
    const entry = entries.find((e) => e.path === music.path)
    if (entry) {
      const result = await exportEntry(entry, 'music')
      if (result) {
        await writeFile(join(options.out, result.file), result.bytes)
        musicEntry = {
          cue: 'music',
          file: result.file,
          source: logicalPath(music.path),
          bytes: result.bytes.length,
          format: result.format,
          ...(result.packets > 0
            ? { packets: result.packets, channels: result.channels, sampleRate: result.sampleRate }
            : {}),
        }
        total += result.bytes.length
      }
    }
  }

  const manifest = {
    generator: 'tools/export-audio.ts',
    base: 'original/sfx/',
    source:
      'Diablo II: Resurrected package extracted from the player\'s own copy. `source` is the ' +
      'logical path inside build_manifest.psv, lower-cased the way the RomFS reader normalises it.',
    container:
      'Each package .opus file is the game\'s own 2-chunk container; the Opus packets it carries ' +
      'were re-framed as Ogg Opus here, bit-for-bit, so nothing was re-encoded.',
    totalBytes: total,
    entries: written.filter((entry) => entry.cue !== 'music'),
    music: musicEntry,
  }
  await writeFile(join(options.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  process.stdout.write(
    `\nwrote ${manifest.entries.length} cues${musicEntry ? ' + 1 music track' : ''} — ` +
      `${String(total)} bytes to ${options.out}\n`,
  )
  if (unmatched.length > 0) process.stdout.write(`no match, stays synthesised: ${unmatched.join(', ')}\n`)
  for (const note of skipped) process.stdout.write(`skipped: ${note}\n`)
}


// Run only as a script: the tests import the container helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
