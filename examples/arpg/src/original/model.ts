/**
 * `.model` — Resurrected's model container (17,800 files in the retail package).
 *
 * This is the format every character, monster, NPC and piece of environment in
 * Resurrected is made of: the classic 2D `.dcc`/`.cof` art that `src/d2` draws
 * is the built-in "classic mode" copy that ships beside it, not what the
 * Resurrected renderer uses.
 *
 * Everything below was read off the files themselves. All 17,800 `.model`
 * files in the package were checked, and the counts are quoted so the evidence
 * is visible; nothing here comes from a specification.
 *
 * ## What the container is
 *
 * A fixed header, a directory, and a body made of tagged chunks.
 *
 * ```
 *   0x00  u8[16]   magic — byte for byte identical in all 17,800 `.model`,
 *                  727 `.skeleton` and 455 `.animations` files
 *   0x10  u32      header size — 456 in 17,800/17,800
 *   0x14  u32      0
 *   0x18  u32      0
 *   0x1c  u32      0
 *   0x20  u32      7            format version, constant
 *   0x24  u32      file size — equal to the file's own length in 17,800/17,800
 *   0x28  u32      content hash — differs in 17,800/17,800, the only word in
 *                  the fixed header that is neither a constant nor a size.
 *                  Neither CRC32 nor Adler-32 of the file, the header or the
 *                  body reproduces it, so it is left unidentified.
 *   0x2c  u32      72           constant
 *   0x30  u32      8            constant
 *   0x34  u32      6            constant
 *   0x38  u32      varies       not a size, an offset or a value from the
 *                  directory (checked on a spread of files), and unidentified
 *   0x3c  u32      0
 *   0x40  u32      0
 *   0x44  u32      0x80000039   constant — a version stamp
 *   0x48  u32[8]   0
 *   0x68  u32      4            constant
 *   0x6c  u32      456          the header size again
 *   0x70  u32[9]   directory prologue — varies
 *   0x94  u32[77]  seven 44-byte directory records (eleven words each)
 *   0x1c8 …        body
 * ```
 *
 * The `0x94` step was established by autocorrelation rather than by eye: over
 * `0x70 .. 0x1c8` a stride of 44 bytes reproduces the byte class of every
 * earlier word 95.3% of the time, and no other stride does better — and
 * `0x94 + 7 * 44` lands exactly on the header size, which is why the header is
 * 456 bytes and not something else. All 17,800 headers are the same length, and
 * the 344 bytes between `0x70` and `0x1c8` are all the header holds.
 *
 * ## The body
 *
 * A chunk starts with the two bytes `b1 75` followed by a `u16` that varies.
 * Coded data contains that pair by chance too — 100,644 of them in the package —
 * so two rules decide which are really starts, and both kinds of rejection are
 * reported in `Model.strayTags` rather than hidden:
 *
 * - a pair closer than 8 bytes to the previous start is data. The shortest chunk
 *   the package contains is 8 bytes, and 2 models have a pair 2 and 4 bytes
 *   after a real start;
 * - a pair past the point the *directory* names as the last chunk's start
 *   cannot begin a chunk. 54 models have one.
 *
 * That leaves 100,588 chunks, and they tile each body exactly: no gap and no
 * overlap in 17,800/17,800 files. Most models have five chunks (12,717 of them).
 *
 * The directory earns that last rule, and only that one, at the eighth word of
 * its first record: **firstRecord[7] - headerSize + 4** is the last chunk's
 * start in body coordinates. That holds against the raw tag list in 17,746 of
 * 17,800 files, and in 17,800/17,800 it is a position where a tag actually is.
 * The 54 files where the raw tag list disagrees are exactly the ones with a
 * tag past that boundary — which is how the rule was found. Every other
 * directory field is returned undecoded.
 *
 * Each chunk has a *kind*, which is measurable without knowing the codec:
 *
 * - **stored** — a short run of plain little-endian integers. 15,165 of the
 *   100,588 chunks are like this, 394,816 bytes in total, and their sizes are
 *   12, 24 (13,235 of them), 40, 44 or 48 bytes. In 15,157 of the 15,165 the
 *   third word of the record is exactly 6, and none of them measures above 5.26
 *   bits of entropy per byte.
 * - **entropy-coded** — everything else, i.e. all the geometry: 85,423 chunks,
 *   886,364,780 bytes.
 *
 * ## Why the geometry cannot be read here
 *
 * **Superseded:** the file is a Granny3D GR2 container and the coded payloads
 * are BitKnit2 streams — `bitknit2.ts` decodes them and `gr2.ts` materializes
 * the meshes, skeletons and materials. This module stays as the record of what
 * the bytes looked like before that was known; its chunk/directory framing was
 * a misreading (consecutive-match scanning tiles any file by construction).
 *
 * The coded chunks are the output of an adaptive bit-level coder
 * ("BitKnit2"; the game's own executable carries the Oodle entry points
 * `_oodle0_compr` / `_oodle1_c` in the string table of `main`). Four
 * measurements say so, and `tools/verify-model.ts` reproduces all of them over
 * the whole package:
 *
 * 1. `Granny` does not occur in any of the 17,800 models (a classic Granny file
 *    is full of type and member names), and neither does any other ASCII run of
 *    eight characters. Nor does the container start with the classic Granny
 *    magic: no model begins with `0xDEADBEEF`, and that value does not occur
 *    anywhere in the game's own executable either.
 * 2. Of the 85,423 coded chunks, every one of 256 bytes or more measures at
 *    least 6.5 bits of entropy per byte but for eight of them, the lowest of
 *    which is a 304-byte chunk at 5.45 bits
 *    (`overseer_extragutsb_flipbook_lod3.model`).
 * 3. zlib level 9 does not shrink them: over a sample of the largest chunks the
 *    result is 91.3%–103.7% of the original. Raw DEFLATE, gzip, zstd, brotli,
 *    LZMA, bzip2 and an LZ4 block do not decode them at any offset, so it is
 *    not a standard container either.
 * 4. The byte histogram peaks at `00`, `7e`–`81` and `fc`–`ff`, which is what
 *    biased binary decisions look like once they have been packed into bytes.
 *
 * So **this module cannot return positions, normals, UVs or indices**: those
 * live in the entropy-coded chunks. What it returns is the container decoded —
 * the header, the seven directory records, the chunk table with each chunk's
 * bytes addressable, and the stored records — so that a BitKnit2 decoder, when
 * one exists, has only to be handed `chunk.payload`.
 *
 * ## Materials and textures
 *
 * The model's own material list is inside the compressed body and cannot be
 * read, but it is not lost: a model's directory has a `.json` beside it naming
 * everything the model depends on (`dependencies.models[] / skeletons[] /
 * animations[] / textures[] / physics[]`). 4,704 of the 17,800 models have one,
 * and between them they name 689,243 texture references, of which 686,130 are
 * present in the package. `parseModelDependencies` reads it, and it is where
 * the texture paths for a model come from.
 *
 * ## What is *not* claimed
 *
 * The directory's fields are read out and returned, but they are not decoded
 * far enough to say which chunk holds vertices, which holds indices or where a
 * submesh's material list begins — the data to check such a reading against is
 * inside the coded chunks. `verify-model.ts` therefore checks only what it can
 * see: the header, the tiling, and the stored records.
 */

/** The 16-byte container magic, identical across every 3D asset in the package. */
export const MODEL_MAGIC = Uint8Array.from([
  0xe5, 0x9b, 0x49, 0x5e, 0x6f, 0x63, 0x1f, 0x14, 0x1e, 0x13, 0xeb, 0xa9, 0x90, 0xbe, 0xed,
  0xc4,
])

/** Header size in every `.model` in the package. */
export const MODEL_HEADER_SIZE = 456

/** Directory records: seven records of eleven words. See the header diagram. */
export const DIRECTORY_PROLOGUE_WORDS = 9
export const DIRECTORY_RECORD_WORDS = 11
export const DIRECTORY_RECORD_COUNT = 7

/**
 * A chunk's kind. `stored` chunks hold plain integers; `entropyCoded` chunks
 * are BitKnit2 output and are returned as bytes rather than decoded.
 */
export type ChunkKind = 'stored' | 'entropyCoded'

export interface ModelHeader {
  /** The 16-byte magic, verified against {@link MODEL_MAGIC}. */
  magic: Uint8Array
  headerSize: number
  formatVersion: number
  /** The size the header claims; equal to the file's length. */
  fileSize: number
  /** `0x28` — varies in 17,800/17,800 files and is left unidentified. */
  hash: number
  /** `0x2c`, 72 in every file — kept because it is part of the header. */
  constant2c: number
  constant30: number
  constant34: number
  /** `0x38` — varies per file and is not identified; see the header diagram. */
  unknown38: number
  versionStamp: number
  /** `0x68`, 4 in every file. */
  constant68: number
}

/** The directory: a nine-word prologue and seven eleven-word records. */
export interface ModelDirectory {
  prologue: number[]
  records: number[][]
}

export interface ModelChunk {
  /** Offset of the chunk's `b1 75` tag, relative to the start of the body. */
  offset: number
  /** Length of the whole chunk, tag included. */
  length: number
  /** The `u16` that follows the tag; varies per chunk. */
  tag: number
  /** Byte entropy of the payload, in bits per byte. */
  entropy: number
  kind: ChunkKind
  /** The chunk's bytes, tag included. */
  bytes: Uint8Array
  /** The chunk's bytes after the four-byte tag. */
  payload: Uint8Array
  /** The stored integers, for `stored` chunks only. */
  words: number[] | null
}

export interface Model {
  header: ModelHeader
  directory: ModelDirectory
  /** The body after the header, as a view into the input. */
  body: Uint8Array
  chunks: ModelChunk[]
  /** Every `b1 75` position in the body, before any of it is filtered out. */
  tagOffsets: number[]
  /**
   * `b1 75` pairs that are not chunk starts. Coded data contains them by
   * chance, so two rules drop them and both are reported here:
   *
   * - `tooClose` — closer than {@link MIN_CHUNK_BYTES} to the previous start.
   *   Two models in the package have one of these.
   * - `afterLastBoundary` — past the point the directory's first record names
   *   as the last chunk's start, so it cannot begin a chunk. 54 models in the
   *   package have one of these.
   */
  strayTags: Array<{ offset: number; reason: 'tooClose' | 'afterLastBoundary' }>
  /**
   * The body offset the directory names as the last chunk's start, or null when
   * that relation does not hold for this file. Measured on the package as the
   * first record's eighth word less the header size plus four, which holds in
   * 17,746 of 17,800 files; the value is used to drop stray tags only when a
   * tag is actually there.
   */
  directoryLastStart: number | null
}

/**
 * The shortest gap between two chunk starts. The shortest chunk the package
 * contains is 8 bytes (a tag and one integer), and the two stray `b1 75` pairs
 * found in 17,800 files sit 2 and 4 bytes after a real start.
 */
const MIN_CHUNK_BYTES = 8

/** One entry of a model's `.json` sidecar. */
export interface ModelDependency {
  path: string
}

/** The `dependencies` block of a model's `.json` sidecar. */
export interface ModelDependencies {
  particles: ModelDependency[]
  models: ModelDependency[]
  skeletons: ModelDependency[]
  animations: ModelDependency[]
  textures: ModelDependency[]
  physics: ModelDependency[]
  json: ModelDependency[]
}

function readUint32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
  )
}

function hasMagic(bytes: Uint8Array): boolean {
  if (bytes.length < MODEL_MAGIC.length) return false
  for (let i = 0; i < MODEL_MAGIC.length; i++) if (bytes[i] !== MODEL_MAGIC[i]) return false
  return true
}

/** True when the bytes begin with the container magic. */
export function isModel(bytes: Uint8Array): boolean {
  return hasMagic(bytes)
}

/**
 * Byte entropy of a buffer, in bits per byte.
 *
 * This is the test that separates a stored chunk from a coded one, and it is
 * deliberately a measurement rather than a guess: the stored records observed
 * across the package sit at or below 5.1 bits, and no coded chunk of 256 bytes
 * or more is below 6.5 (see {@link STORED_ENTROPY_LIMIT}).
 */
export function byteEntropy(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0
  const counts = new Uint32Array(256)
  for (const byte of bytes) counts[byte] += 1
  let entropy = 0
  for (const count of counts) {
    if (count === 0) continue
    const p = count / bytes.length
    entropy -= p * Math.log2(p)
  }
  return entropy
}

/**
 * Entropy below which a chunk is a candidate for being a stored record.
 *
 * Calibrated on the package: the 15,165 stored records measured at most 5.26
 * bits, and every coded chunk of 256 bytes or more at least 6.5 but for eight.
 * Those eight are excluded by {@link STORED_MAX_BYTES} instead, which is why
 * both limits are needed.
 */
export const STORED_ENTROPY_LIMIT = 6

/**
 * A stored record is short: across the package they are 12, 24, 40, 44 or 48
 * bytes. A coded chunk this short also exists, so the word check in
 * {@link classifyChunk} does the rest of the work.
 */
export const STORED_MAX_BYTES = 64

function classifyChunk(payload: Uint8Array, entropy: number): ChunkKind {
  if (entropy >= STORED_ENTROPY_LIMIT) return 'entropyCoded'
  if (payload.length < 8 || payload.length > STORED_MAX_BYTES) return 'entropyCoded'
  // Stored records are a short run of small integers. Every word of every one
  // of the 15,165 found in the package is below 2^31; a coded chunk of this
  // size that happens to be low-entropy almost always has a high bit set
  // somewhere, and the 44-byte coded chunk in `diablo/torso_lod3.model` is
  // rejected by exactly this test.
  if (payload.length % 4 !== 0) return 'entropyCoded'
  for (let at = 0; at + 4 <= payload.length; at += 4) {
    if (readUint32(payload, at) >= 0x80000000) return 'entropyCoded'
  }
  return 'stored'
}

/** Read the fixed header, checking the magic and the header size. */
export function parseModelHeader(bytes: Uint8Array): ModelHeader {
  if (!hasMagic(bytes)) {
    throw new Error('model: not a D2R model container (magic mismatch)')
  }
  if (bytes.length < MODEL_HEADER_SIZE) {
    throw new Error(`model: ${bytes.length} bytes is shorter than the 456-byte header`)
  }
  const headerSize = readUint32(bytes, 0x10)
  if (headerSize !== MODEL_HEADER_SIZE) {
    throw new Error(`model: header size ${headerSize}, expected ${MODEL_HEADER_SIZE}`)
  }
  const fileSize = readUint32(bytes, 0x24)
  if (fileSize !== bytes.length) {
    throw new Error(`model: header says ${fileSize} bytes, file is ${bytes.length}`)
  }
  return {
    magic: bytes.slice(0, MODEL_MAGIC.length),
    headerSize,
    formatVersion: readUint32(bytes, 0x20),
    fileSize,
    hash: readUint32(bytes, 0x28),
    constant2c: readUint32(bytes, 0x2c),
    constant30: readUint32(bytes, 0x30),
    constant34: readUint32(bytes, 0x34),
    unknown38: readUint32(bytes, 0x38),
    versionStamp: readUint32(bytes, 0x44),
    constant68: readUint32(bytes, 0x68),
  }
}

/**
 * Read the directory: the nine-word prologue at `0x70` and the seven 44-byte
 * records that follow it, which together fill the header exactly.
 */
export function parseModelDirectory(bytes: Uint8Array): ModelDirectory {
  const prologue: number[] = []
  for (let i = 0; i < DIRECTORY_PROLOGUE_WORDS; i++) {
    prologue.push(readUint32(bytes, 0x70 + i * 4))
  }
  const records: number[][] = []
  const base = 0x70 + DIRECTORY_PROLOGUE_WORDS * 4
  for (let record = 0; record < DIRECTORY_RECORD_COUNT; record++) {
    const words: number[] = []
    for (let word = 0; word < DIRECTORY_RECORD_WORDS; word++) {
      words.push(readUint32(bytes, base + record * DIRECTORY_RECORD_WORDS * 4 + word * 4))
    }
    records.push(words)
  }
  return { prologue, records }
}

const CHUNK_TAG_HIGH = 0xb1
const CHUNK_TAG_LOW = 0x75

/**
 * Split the body into its tagged chunks.
 *
 * Returns `null` when the tiling does not hold — the body must start with the
 * tag, and the tags found must be the only chunk starts — so the caller can
 * report a file that does not match rather than silently mis-slicing it.
 */
export function parseChunks(
  bytes: Uint8Array,
  headerSize: number,
  lastStart: number | null = null,
): {
  chunks: ModelChunk[]
  strayTags: Array<{ offset: number; reason: 'tooClose' | 'afterLastBoundary' }>
  tagOffsets: number[]
} | null {
  const body = bytes.subarray(headerSize)
  if (body.length < MIN_CHUNK_BYTES) return null
  if (body[0] !== CHUNK_TAG_HIGH || body[1] !== CHUNK_TAG_LOW) return null
  const starts: number[] = []
  const strayTags: Array<{ offset: number; reason: 'tooClose' | 'afterLastBoundary' }> = []
  const tagOffsets: number[] = []
  for (let at = 0; at + 1 < body.length; at++) {
    if (body[at] !== CHUNK_TAG_HIGH || body[at + 1] !== CHUNK_TAG_LOW) continue
    tagOffsets.push(at)
    if (starts.length > 0 && at - starts[starts.length - 1] < MIN_CHUNK_BYTES) {
      strayTags.push({ offset: at, reason: 'tooClose' })
      continue
    }
    if (lastStart !== null && at > lastStart) {
      strayTags.push({ offset: at, reason: 'afterLastBoundary' })
      continue
    }
    starts.push(at)
  }
  const chunks: ModelChunk[] = []
  for (let i = 0; i < starts.length; i++) {
    const offset = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1] : body.length
    const chunkBytes = body.subarray(offset, end)
    const payload = chunkBytes.subarray(4)
    const entropy = byteEntropy(payload)
    const kind = classifyChunk(payload, entropy)
    const words: number[] | null = kind === 'stored' ? readWords(payload) : null
    chunks.push({
      offset,
      length: chunkBytes.length,
      tag: chunkBytes[2] | (chunkBytes[3] << 8),
      entropy,
      kind,
      bytes: chunkBytes,
      payload,
      words,
    })
  }
  return { chunks, strayTags, tagOffsets }
}

/**
 * The body offset the directory names as the last chunk's start, checked
 * against the tags that were actually found: when no tag sits there the
 * relation does not hold for this file and nothing is filtered.
 */
function directoryLastStart(directory: ModelDirectory, headerSize: number, tagOffsets: number[]): number | null {
  const stated = directory.records[0][7] - headerSize + 4
  return tagOffsets.includes(stated) ? stated : null
}

function readWords(payload: Uint8Array): number[] {
  const words: number[] = []
  for (let at = 0; at + 4 <= payload.length; at += 4) words.push(readUint32(payload, at))
  return words
}

/**
 * Decode a `.model` container.
 *
 * Throws when the header is not a model header, or when the body does not tile
 * into tagged chunks.
 */
export function decodeModel(bytes: Uint8Array): Model {
  const header = parseModelHeader(bytes)
  const directory = parseModelDirectory(bytes)
  const raw = parseChunks(bytes, header.headerSize)
  if (!raw) {
    throw new Error('model: body does not start with the chunk tag')
  }
  const lastStart = directoryLastStart(directory, header.headerSize, raw.tagOffsets)
  const parsed = parseChunks(bytes, header.headerSize, lastStart)
  if (!parsed) {
    throw new Error('model: body does not start with the chunk tag')
  }
  return {
    header,
    directory,
    body: bytes.subarray(header.headerSize),
    chunks: parsed.chunks,
    tagOffsets: parsed.tagOffsets,
    strayTags: parsed.strayTags,
    directoryLastStart: lastStart,
  }
}

/** The stored chunks of a model, in body order. */
export function storedChunks(model: Model): ModelChunk[] {
  return model.chunks.filter((chunk) => chunk.kind === 'stored')
}

/** The coded chunks of a model, in body order — the geometry, still packed. */
export function codedChunks(model: Model): ModelChunk[] {
  return model.chunks.filter((chunk) => chunk.kind === 'entropyCoded')
}

/**
 * Read a model's `.json` sidecar.
 *
 * The sidecar is the model's dependency list, and it is where its textures are
 * named — the material references inside the compressed body cannot be read.
 */
export function parseModelDependencies(text: string): ModelDependencies {
  const parsed = JSON.parse(text) as { dependencies?: Partial<ModelDependencies> }
  const dependencies = parsed.dependencies ?? {}
  const list = (value: ModelDependency[] | undefined): ModelDependency[] =>
    (value ?? []).filter((entry) => typeof entry?.path === 'string')
  return {
    particles: list(dependencies.particles),
    models: list(dependencies.models),
    skeletons: list(dependencies.skeletons),
    animations: list(dependencies.animations),
    textures: list(dependencies.textures),
    physics: list(dependencies.physics),
    json: list(dependencies.json),
  }
}

/**
 * The `.json` sidecar path for a model path.
 *
 * The sidecar is named after the model's own directory and sits beside it:
 * `…/skeleton1/base_body_lod1.model` → `…/skeleton1.json`, and
 * `…/weapon/knife/blade/blade_lod2.model` → `…/weapon/knife/blade.json`. Not
 * every model has one (`hd/bvt/models/…` and some nested environment art do
 * not), so the caller has to be ready for the file to be missing.
 */
export function sidecarPath(modelPath: string): string {
  const trimmed = modelPath.replace(/\/+$/, '')
  const slash = trimmed.lastIndexOf('/')
  if (slash <= 0) return '.json'
  const directory = trimmed.slice(0, slash)
  return `${directory}.json`
}
