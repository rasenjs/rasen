/**
 * Reading a Diablo II: Resurrected RomFS.
 *
 * A port of `dm/ios/tools/romfs_art.py` + `touch_layout.py`'s entry reader. The
 * format is: a `build_manifest.psv` index, and a set of `.data` archives that
 * entries are sliced out of — compressed as zlib, stored raw, or split into
 * chunked records whose first byte says whether that chunk is raw (`'N'`) or
 * zlib.
 *
 * **This module contains no game data and does not fetch any.** It only knows
 * how to read files that the caller supplies; the reference project takes the
 * same position (`docs/GAME_FILES.md`: the repository "does not contain any game
 * files and never will"). Every entry is MD5-verified against the manifest, so a
 * mismatched game version fails loudly instead of decoding into wrong pixels.
 */

import { md5Hex } from './md5'

/** Where the bytes come from. The caller decides (File System Access API, Node fs, tests). */
export interface RomfsSource {
  /** Contents of `data/build_manifest.psv`. */
  readManifest(): Promise<string>
  /** Contents of an archive, named like `00-00000001.data`. */
  readArchive(name: string): Promise<Uint8Array>
}

export interface ManifestEntry {
  /** Logical path inside the package, e.g. `hd/global/ui/.../front_panel.sprite`. */
  path: string
  /** Expected MD5 of the decompressed payload, from the manifest. */
  md5: string
  /** Byte count of the stored (still compressed) payload. */
  rawLength: number
  /** `z` = zlib, `n` = raw, anything else = chunked. */
  encoding: string
  /** The 16-byte per-entry key: bytes 9/10 hold the archive pair, 11..15 the offset. */
  key: Uint8Array
}

/**
 * Archive name for an entry. The original builds it as `%02d-%08d.data` from
 * key bytes 9 and 10 (each a single byte), and takes the stored offset from key
 * bytes 11..15 as a 5-byte big-endian value.
 */
const ARCHIVE_OF = (key: Uint8Array): string =>
  `${String(key[9]).padStart(2, '0')}-${String(key[10]).padStart(8, '0')}.data`

const OFFSET_OF = (key: Uint8Array): number => {
  let offset = 0
  for (let i = 11; i < 16; i++) offset = offset * 256 + key[i]
  return offset
}

function readUint32BE(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]
}

/** The chunk count is stored as three bytes (`raw[9:12]` in the original). */
function readUint24BE(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2]
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

/**
 * Parse the pipe-separated manifest.
 *
 * Field 9 is `archive:logical/path`; fields 4/6/7/8 are the MD5, the entry key,
 * the stored length and the encoding. Lines with fewer than 11 fields and
 * comments are skipped, as in the original.
 */
export function parseManifest(text: string): ManifestEntry[] {
  const entries: ManifestEntry[] = []
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const fields = line.replace(/\r$/, '').split('|')
    if (fields.length < 11) continue
    const rawPath = fields[9]
    const colon = rawPath.indexOf(':')
    entries.push({
      path: colon < 0 ? rawPath.toLowerCase() : rawPath.slice(colon + 1).toLowerCase(),
      md5: fields[4],
      rawLength: Number(fields[7]),
      encoding: fields[8],
      key: hexToBytes(fields[6]),
    })
  }
  return entries
}

/**
 * Inflate a zlib stream.
 *
 * Fed from a hand-built `ReadableStream` rather than `Blob.stream()`, which is
 * missing in some embedded environments (and in the jsdom test environment).
 */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  const transform = new DecompressionStream('deflate') as unknown as TransformStream<
    Uint8Array,
    Uint8Array
  >
  const stream = source.pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Slice one entry's stored bytes out of its archive. */
async function readRaw(source: RomfsSource, entry: ManifestEntry): Promise<Uint8Array> {
  const archive = await source.readArchive(ARCHIVE_OF(entry.key))
  const offset = OFFSET_OF(entry.key)
  return archive.subarray(offset, offset + entry.rawLength)
}

/** Decompress (and verify) one entry. */
export async function readEntry(
  source: RomfsSource,
  entry: ManifestEntry,
): Promise<Uint8Array> {
  const raw = await readRaw(source, entry)
  let data: Uint8Array

  if (entry.encoding === 'n') {
    data = raw
  } else if (entry.encoding === 'z') {
    data = await inflate(raw)
  } else {
    // Chunked: a header, then records of (size, unused) pairs. Each chunk is
    // prefixed by 'N' when it is stored rather than compressed.
    const headerSize = readUint32BE(raw, 4)
    const count = readUint24BE(raw, 9)
    let position = headerSize
    const parts: Uint8Array[] = []
    for (let i = 0; i < count; i++) {
      const size = readUint32BE(raw, 12 + i * 24)
      const chunk = raw.subarray(position, position + size)
      parts.push(chunk[0] === 0x4e ? chunk.subarray(1) : await inflate(chunk.subarray(1)))
      position += size
    }
    const total = parts.reduce((sum, part) => sum + part.length, 0)
    data = new Uint8Array(total)
    let at = 0
    for (const part of parts) {
      data.set(part, at)
      at += part.length
    }
  }

  if (entry.md5 && md5Hex(data) !== entry.md5) {
    throw new Error(
      `romfs: MD5 mismatch for ${entry.path} — the game files are not the expected version`,
    )
  }
  return data
}

/** Find an entry by logical path (case-insensitive, leading slashes ignored). */
export function findEntry(
  entries: readonly ManifestEntry[],
  path: string,
): ManifestEntry | null {
  let want = path.toLowerCase().replace(/^\/+/, '')
  if (!want.startsWith('data/')) want = `data/${want}`
  return entries.find((entry) => entry.path === want) ?? null
}

/** Convenience: read one file out of the package. */
export async function readFile(
  source: RomfsSource,
  manifest: readonly ManifestEntry[],
  path: string,
): Promise<Uint8Array> {
  const entry = findEntry(manifest, path)
  if (!entry) {
    throw new Error(`romfs: ${path} is not in the package (wrong RomFS version?)`)
  }
  return readEntry(source, entry)
}
