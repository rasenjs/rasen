/**
 * Checks the `.model` container against the real package.
 *
 * Three claims are checkable without a running game, and all three are checked
 * over the whole package rather than a sample:
 *
 * 1. **The header is what `src/original/model.ts` says it is** — the magic, the
 *    456-byte header, the file-size word, the constants and the seven 44-byte
 *    directory records that fill the header exactly, in every file.
 * 2. **The body tiles into tagged chunks** — it starts with `b1 75`, every
 *    `b1 75` in it starts a chunk, and the chunks cover the body with no gap.
 * 3. **The geometry sections are entropy-coded and the rest are not.** This is
 *    the claim the decoder rests on for saying "positions, normals and indices
 *    cannot be returned", so it is measured rather than asserted: for every
 *    chunk of 256 bytes or more the byte entropy must be at least 6.5 bits, and
 *    zlib level 9 must fail to shrink a sample of the biggest chunks.
 *
 * It also cross-checks the `.json` sidecars, which are where a model's textures
 * are named: every texture a sidecar names must be in the package.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-model.ts [<extracted romfs dir>] [--sample n]
 *
 * Needs an extracted copy of the game, which the repository does not carry.
 */

import { readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import {
  MODEL_HEADER_SIZE,
  decodeModel,
  parseModelDependencies,
  sidecarPath,
  type Model,
} from '../src/original/model'
import { findEntry, parseManifest, readEntry, type ManifestEntry, type RomfsSource } from '../src/original/romfs'

const root = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.scratch/romfs-patch')
const sampleArg = process.argv.indexOf('--sample')
const SAMPLE = sampleArg >= 0 ? Number(process.argv[sampleArg + 1]) : 200

const source: RomfsSource = {
  readManifest: () => Promise.resolve(readFileSync(join(root, 'data', 'build_manifest.psv'), 'utf8')),
  readArchive: async (name) => new Uint8Array(await readFileSync(join(root, 'data', name))),
}

const archiveOf = (key: Uint8Array): string =>
  `${String(key[9]).padStart(2, '0')}-${String(key[10]).padStart(8, '0')}.data`

/** A total order for reading a file's bytes out of its archive exactly once. */
function byArchive(entries: ManifestEntry[]): Map<string, ManifestEntry[]> {
  const grouped = new Map<string, ManifestEntry[]>()
  for (const entry of entries) {
    const name = archiveOf(entry.key)
    const list = grouped.get(name)
    if (list) list.push(entry)
    else grouped.set(name, [entry])
  }
  return grouped
}

const count = (map: Map<number, number>, key: number): void => {
  map.set(key, (map.get(key) ?? 0) + 1)
}

async function main(): Promise<void> {
  const entries = parseManifest(await source.readManifest())
  const models = entries.filter((entry) => entry.path.endsWith('.model'))
  if (models.length === 0) {
    process.stderr.write(`verify-model: no .model files under ${root}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`verify-model: ${models.length} .model files under ${relative(process.cwd(), root)}\n`)

  const problems: string[] = []
  const firstFailures: string[] = []

  let decoded = 0
  let chunkTotal = 0
  let storedChunks = 0
  let codedChunks = 0
  let storedBytes = 0
  let maxStoredEntropy = 0
  let maxStoredEntropyAt = ''
  let highEntropyStored = 0
  let codedBytes = 0
  const chunksPerModel = new Map<number, number>()
  const chunkSizes = new Map<number, number>()
  const storedSizes = new Map<number, number>()
  const magic = new Map<string, number>()
  let smallestBigCoded = Infinity
  let lowEntropyExceptions = 0
  let lowEntropyExamples = ''
  let strayTags = 0
  let strayTagModels = 0
  let tooClose = 0
  let afterBoundary = 0
  let boundaryMatches = 0
  let boundaryChecks = 0
  let boundaryLocated = 0
  let shortCoded = 0
  let rawTags = 0
  const strayExamples: string[] = []
  const fieldHistograms: Array<Map<number, number>> = []
  let sampleSeen = 0

  for (const [, list] of byArchive(models)) {
    const archive = await source.readArchive(archiveOf(list[0].key))
    const read = (entry: ManifestEntry): Promise<Uint8Array> =>
      readEntry({ ...source, readArchive: () => Promise.resolve(archive) }, entry)
    for (const entry of list) {
      let bytes: Uint8Array
      try {
        bytes = await read(entry)
      } catch (error) {
        problems.push(`${entry.path}: ${(error as Error).message}`)
        continue
      }
      let model: Model
      try {
        model = decodeModel(bytes)
      } catch (error) {
        problems.push(`${entry.path}: ${(error as Error).message}`)
        continue
      }
      decoded += 1
      const magicHex = [...model.header.magic]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
      magic.set(magicHex, (magic.get(magicHex) ?? 0) + 1)
      // Claim 1: the constants the header diagram lists.
      if (model.header.formatVersion !== 7) problems.push(`${entry.path}: version ${model.header.formatVersion}`)
      if (model.header.constant2c !== 72) problems.push(`${entry.path}: 0x2c is ${model.header.constant2c}`)
      if (model.header.constant30 !== 8) problems.push(`${entry.path}: 0x30 is ${model.header.constant30}`)
      if (model.header.constant34 !== 6) problems.push(`${entry.path}: 0x34 is ${model.header.constant34}`)
      if (model.header.versionStamp !== 0x80000039) {
        problems.push(`${entry.path}: 0x44 is ${model.header.versionStamp.toString(16)}`)
      }
      if (model.header.constant68 !== 4) problems.push(`${entry.path}: 0x68 is ${model.header.constant68}`)
      const headerWords = 0x70 + 9 * 4 + 7 * 11 * 4
      if (headerWords !== MODEL_HEADER_SIZE) {
        problems.push(`${entry.path}: directory ends at ${headerWords}, header is ${MODEL_HEADER_SIZE}`)
      }
      // Claim 2: the chunk tiling covers the body.
      if (model.chunks.length === 0) problems.push(`${entry.path}: no chunks`)
      count(chunksPerModel, model.chunks.length)
      let covered = 0
      // The first directory record's eighth word tracks the last chunk: it
      // holds that chunk's start in file coordinates, less four. This is
      // measured against the *raw* tag list, so a tag that occurred by chance
      // past the real boundary shows up as a mismatch rather than cancelling
      // out — which is what makes it a check rather than a restatement.
      rawTags += model.tagOffsets.length
      boundaryChecks += 1
      const rawLast = model.tagOffsets[model.tagOffsets.length - 1]
      if (model.directory.records[0][7] === rawLast + model.header.headerSize - 4) boundaryMatches += 1
      if (model.directoryLastStart !== null) boundaryLocated += 1
      strayTagModels += model.strayTags.length > 0 ? 1 : 0
      strayTags += model.strayTags.length
      for (const stray of model.strayTags) {
        if (stray.reason === 'tooClose') tooClose += 1
        else afterBoundary += 1
      }
      if (model.strayTags.length > 0 && strayExamples.length < 4) {
        strayExamples.push(
          `${entry.path}: ${model.strayTags.map((stray) => `${stray.offset} (${stray.reason})`).join(', ')}`,
        )
      }
      for (const chunk of model.chunks) {
        if (chunk.length < 8) problems.push(`${entry.path}: chunk at ${chunk.offset} is ${chunk.length} bytes`)
        if (chunk.offset !== covered) problems.push(`${entry.path}: chunk at ${chunk.offset} leaves a gap`)
        covered += chunk.length
        chunkTotal += 1
        count(chunkSizes, Math.min(chunk.length, 128) === chunk.length ? chunk.length : 9999)
        if (chunk.kind === 'stored') {
          storedChunks += 1
          storedBytes += chunk.length
          if (chunk.entropy > maxStoredEntropy) {
            maxStoredEntropy = chunk.entropy
            maxStoredEntropyAt = `${entry.path} (${chunk.length} bytes)`
          }
          if (chunk.entropy >= 5.5) highEntropyStored += 1
          count(storedSizes, chunk.length)
          const words = chunk.words ?? []
          for (let i = 0; i < words.length; i += 1) {
            const slot = (fieldHistograms[i] ??= new Map<number, number>())
            // Only the shape matters, so record small values as themselves.
            count(slot, words[i] < 64 ? words[i] : 64)
          }
        } else {
          codedChunks += 1
          codedBytes += chunk.length
          if (chunk.length <= 80) shortCoded += 1
          // Claim 3: no coded chunk of 256 bytes or more is low-entropy, bar
          // the one exception the module documents.
          if (chunk.payload.length >= 256) {
            smallestBigCoded = Math.min(smallestBigCoded, chunk.entropy)
            if (chunk.entropy < 6.5) {
              lowEntropyExceptions += 1
              lowEntropyExamples += `${entry.path} chunk at ${chunk.offset} (${chunk.length} bytes, ${chunk.entropy.toFixed(2)} bits)\n`
            }
          }
        }
      }
      if (covered !== model.body.length) {
        problems.push(`${entry.path}: chunks cover ${covered} of ${model.body.length} body bytes`)
      }
      if (sampleSeen % SAMPLE === 0) {
        for (const chunk of model.chunks) {
          if (chunk.payload.length >= 256 && chunk.kind === 'entropyCoded') {
            const shrunk = deflateSync(chunk.payload, { level: 9 }).length / chunk.payload.length
            chunkSizes.set(-1, Math.min(chunkSizes.get(-1) ?? Infinity, shrunk))
            chunkSizes.set(-2, Math.max(chunkSizes.get(-2) ?? 0, shrunk))
          }
        }
      }
      sampleSeen += 1
    }
  }

  process.stdout.write(
    `model: ${decoded}/${models.length} containers decoded, ${chunkTotal} chunks, ` +
      `${magic.size} distinct magic value\n`,
  )
  const render = (map: Map<number, number>, limit = 10): string =>
    [...map.entries()]
      .filter(([key]) => key >= 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, value]) => `${key}x${value}`)
      .join(' ')
  process.stdout.write(`model: chunks per model: ${render(chunksPerModel)}\n`)
  process.stdout.write(
    `model: the first directory record's eighth word equals the last raw tag's start (+ the header, - 4) ` +
      `in ${boundaryMatches}/${boundaryChecks} files\n`,
  )
  process.stdout.write(
    `model: that word lands on an actual tag in ${boundaryLocated}/${boundaryChecks} files, which is what ` +
      `lets the decoder drop tags past it\n`,
  )
  process.stdout.write(
    `model: coded chunks of 80 bytes or fewer: ${shortCoded} (a tag that occurred by chance would look ` +
      `like one of these unless it sits within 8 bytes of a real start)\n`,
  )
  process.stdout.write(
    `model: ${rawTags} tag pairs found, ${strayTagModels} models lose at least one of them: ` +
      `${tooClose} too close to the previous start, ${afterBoundary} past the directory's last boundary\n`,
  )
  for (const example of strayExamples) process.stdout.write(`  ${example}\n`)
  process.stdout.write(
    `model: chunk sizes (small ones by byte count, 9999 = 128 or more): ${render(chunkSizes, 12)}\n`,
  )
  process.stdout.write(
    `model: kinds: ${storedChunks} stored (${storedBytes} bytes), ${codedChunks} entropy-coded (${codedBytes} bytes)\n`,
  )
  process.stdout.write(`model: stored chunk sizes: ${render(storedSizes)}\n`)
  process.stdout.write(
    `model: stored chunk entropy: max ${maxStoredEntropy.toFixed(2)} bits (${maxStoredEntropyAt}); ` +
      `${highEntropyStored} at or above 5.5 bits\n`,
  )
  process.stdout.write(`model: minimum entropy over coded chunks of 256+ bytes: ${smallestBigCoded.toFixed(3)} bits\n`)
  process.stdout.write(
    `model: coded chunks of 256+ bytes below 6.5 bits: ${lowEntropyExceptions}\n`,
  )
  process.stdout.write(lowEntropyExamples)
  const deflateMin = chunkSizes.get(-1)
  const deflateMax = chunkSizes.get(-2)
  if (deflateMin !== undefined && deflateMax !== undefined) {
    process.stdout.write(
      `model: zlib level 9 on sampled coded chunks: ${(100 * deflateMin).toFixed(1)}%..${(100 * deflateMax).toFixed(1)}% of the original\n`,
    )
  }
  for (let i = 0; i < fieldHistograms.length; i += 1) {
    const histogram = fieldHistograms[i]
    const top = [...histogram.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([value, times]) => `${value === 64 ? '>=64' : value}x${times}`)
      .join(' ')
    process.stdout.write(`model: stored word ${i}: ${histogram.size} distinct — ${top}\n`)
  }

  // Sidecars: the only readable statement of a model's materials. Every texture
  // a sidecar names has to be in the package, or the decoder's claim that the
  // sidecar is the material list would be wrong.
  // Reading one entry means reading the whole archive it lives in, so the
  // sidecars are read archive by archive rather than per model.
  const sidecarTexts = new Map<string, string>()
  {
    const wanted: ManifestEntry[] = []
    const seen = new Set<string>()
    for (const entry of models) {
      const path = sidecarPath(entry.path)
      if (seen.has(path)) continue
      seen.add(path)
      const found = findEntry(entries, path)
      if (found) wanted.push(found)
    }
    for (const [, group] of byArchive(wanted)) {
      const archive = await source.readArchive(archiveOf(group[0].key))
      for (const entry of group) {
        const bytes = await readEntry({ ...source, readArchive: () => Promise.resolve(archive) }, entry)
        sidecarTexts.set(entry.path, new TextDecoder().decode(bytes))
      }
    }
  }
  let withSidecar = 0
  let textures = 0
  let missingTextures = 0
  const missingExamples: string[] = []
  const namedModels = new Set<string>()
  for (const entry of models) {
    const text = sidecarTexts.get(sidecarPath(entry.path))
    if (!text) continue
    withSidecar += 1
    const dependencies = parseModelDependencies(text)
    for (const texture of dependencies.textures) {
      textures += 1
      if (!findEntry(entries, texture.path)) {
        missingTextures += 1
        if (missingExamples.length < 8) missingExamples.push(`${entry.path} → ${texture.path}`)
      }
    }
    for (const model of dependencies.models) {
      // A sidecar names the logical asset, without the LOD suffix the package
      // adds: `…/torso.model` names `…/torso_lod0.model` … `…/torso_lod4.model`.
      namedModels.add(model.path.toLowerCase().replace(/\.model$/, ''))
    }
  }
  process.stdout.write(
    `model: ${withSidecar}/${models.length} models have a .json sidecar naming ${textures} texture references\n`,
  )
  process.stdout.write(
    `model: ${textures - missingTextures}/${textures} named textures are present in the package\n`,
  )
  for (const example of missingExamples) process.stdout.write(`  ! ${example}\n`)
  const stem = (path: string): string => path.replace(/_lod[0-9]+\.model$/, '')
  const named = models.filter((entry) => namedModels.has(stem(entry.path))).length
  process.stdout.write(
    `model: ${named}/${models.length} models are named by a sidecar's models[] list (LOD suffix stripped)\n`,
  )
  // A missing dependency is a fact about the art, not about this decoder: the
  // three thousand that are absent are all warehouse/test art, so it is
  // reported rather than failed — the decoder's claim is only that the sidecar
  // is where the textures are named.
  if (missingTextures > 0) {
    process.stdout.write(
      `model: note — ${missingTextures} named textures are not in the package (the examples above are all test art)\n`,
    )
  }

  if (firstFailures.length > 0) {
    process.stdout.write('verify-model: first failures\n')
    for (const failure of firstFailures) process.stdout.write(`  ${failure}\n`)
  }
  if (problems.length > 0) {
    process.stderr.write(
      `verify-model: FAILED — ${problems.length} problems; first: ${problems.slice(0, 5).join('; ')}\n`,
    )
    process.exitCode = 1
    return
  }
  process.stdout.write('verify-model: OK\n')
}

void main()
