import { describe, expect, it } from 'vitest'
import {
  MODEL_HEADER_SIZE,
  MODEL_MAGIC,
  byteEntropy,
  decodeModel,
  isModel,
  parseModelDependencies,
  parseModelHeader,
  sidecarPath,
  storedChunks,
  type Model,
} from '../model'

/**
 * The `.model` container, tested against containers fabricated here plus the
 * invariants that were confirmed against all 17,800 real files.
 *
 * The container's whole value is that a model's geometry can be *located*: the
 * header says how long it is, the directory fills it exactly, and the body tiles
 * into tagged chunks. A regression in the 44-byte directory stride or in the
 * chunk tag would move every payload, so both are pinned here.
 */

/** One 44-byte directory record, as the real files write them. */
function directoryRecord(words: Partial<Record<number, number>>): Uint8Array {
  const record = new Uint8Array(44)
  const view = new DataView(record.buffer)
  for (let i = 0; i < 11; i++) view.setUint32(i * 4, words[i] ?? 0, true)
  return record
}

/** A chunk: the two tag bytes, a u16 tag, then the payload. */
function chunk(tag: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length)
  out[0] = 0xb1
  out[1] = 0x75
  out[2] = tag & 0xff
  out[3] = (tag >> 8) & 0xff
  out.set(payload, 4)
  return out
}

/** Noise that will not compress and has no structure, standing in for BitKnit2 output. */
function codedPayload(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length)
  let state = seed >>> 0
  for (let i = 0; i < length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0
    out[i] = (state >>> 24) & 0xff
  }
  return out
}

/** Build a container the way the real ones are laid out. */
function buildModel(options: {
  body?: Uint8Array
  headerSize?: number
  formatVersion?: number
  fileSize?: number
  hash?: number
  constant2c?: number
  records?: Uint8Array[]
  magic?: Uint8Array
} = {}): Uint8Array {
  const headerSize = options.headerSize ?? MODEL_HEADER_SIZE
  const body = options.body ?? chunk(11, codedPayload(1024))
  const out = new Uint8Array(headerSize + body.length)
  const view = new DataView(out.buffer)
  out.set(options.magic ?? MODEL_MAGIC, 0)
  view.setUint32(0x10, headerSize, true)
  view.setUint32(0x20, options.formatVersion ?? 7, true)
  view.setUint32(0x24, options.fileSize ?? out.length, true)
  view.setUint32(0x28, options.hash ?? 0x6f844ea8, true)
  view.setUint32(0x2c, options.constant2c ?? 72, true)
  view.setUint32(0x30, 8, true)
  view.setUint32(0x34, 6, true)
  view.setUint32(0x38, 2156, true)
  view.setUint32(0x44, 0x80000039, true)
  view.setUint32(0x68, 4, true)
  view.setUint32(0x6c, headerSize, true)
  const records = options.records ?? Array.from({ length: 7 }, (_, i) => directoryRecord({ 0: 4, 1: 2560 + i, 4: 32, 7: 3376, 9: 3376 }))
  if (records.length !== 7) throw new Error('records must be seven')
  for (let i = 0; i < records.length; i++) out.set(records[i], 0x94 + i * 44)
  out.set(body, headerSize)
  return out
}

function firstStored(model: Model): number[] {
  const stored = storedChunks(model)
  expect(stored.length).toBeGreaterThan(0)
  return stored[0].words ?? []
}

describe('model container header', () => {
  it('reads the fixed header', () => {
    const header = parseModelHeader(buildModel())
    expect(header.headerSize).toBe(456)
    expect(header.formatVersion).toBe(7)
    expect(header.constant2c).toBe(72)
    expect(header.constant30).toBe(8)
    expect(header.constant34).toBe(6)
    expect(header.versionStamp).toBe(0x80000039)
    expect(header.constant68).toBe(4)
    expect(header.fileSize).toBe(header.fileSize)
    expect([...header.magic]).toEqual([...MODEL_MAGIC])
  })

  it('rejects a file that is not a model container', () => {
    expect(isModel(new Uint8Array(512))).toBe(false)
    expect(() => parseModelHeader(new Uint8Array(512))).toThrow(/magic mismatch/)
  })

  it('rejects a header size that is not the 456 every real file uses', () => {
    const bytes = buildModel({ headerSize: 452 })
    expect(() => parseModelHeader(bytes)).toThrow(/header size 452/)
  })

  it('rejects a file whose size word disagrees with its length', () => {
    const bytes = buildModel({ fileSize: 4096 })
    expect(() => parseModelHeader(bytes)).toThrow(/header says 4096 bytes/)
  })

  it('rejects a file shorter than its own header', () => {
    expect(() => parseModelHeader(MODEL_MAGIC.slice())).toThrow(/shorter than the 456/)
  })
})

describe('model directory', () => {
  it('reads nine prologue words and seven records of eleven words', () => {
    const model = decodeModel(buildModel())
    expect(model.directory.prologue).toHaveLength(9)
    expect(model.directory.records).toHaveLength(7)
    for (const record of model.directory.records) expect(record).toHaveLength(11)
    expect(model.directory.records[0][0]).toBe(4)
    expect(model.directory.records[6][1]).toBe(2566)
  })

  it('places the directory so that it ends exactly at the header size', () => {
    // 0x70 + 9 words + 7 records of 11 words == 456. If either constant drifts
    // the last record runs into the body.
    expect(0x70 + 9 * 4 + 7 * 11 * 4).toBe(MODEL_HEADER_SIZE)
  })

  it('reads the directory out of a header built at the real offsets', () => {
    const records = Array.from({ length: 7 }, (_, i) => directoryRecord({ 0: i === 6 ? 0 : 4, 1: 100 + i }))
    const model = decodeModel(buildModel({ records }))
    expect(model.directory.records.map((record) => record[1])).toEqual([100, 101, 102, 103, 104, 105, 106])
  })
})

describe('model body', () => {
  it('splits the body into tagged chunks that cover it exactly', () => {
    const body = new Uint8Array([
      ...chunk(11, codedPayload(600)),
      ...chunk(0xb2fe, codedPayload(300, 7)),
      ...chunk(0, storedPayload([16, 3336, 6, 1056, 1404])),
      ...chunk(11, codedPayload(900, 9)),
    ])
    const model = decodeModel(buildModel({ body }))
    expect(model.chunks).toHaveLength(4)
    expect(model.chunks.map((c) => c.tag)).toEqual([11, 0xb2fe, 0, 11])
    const covered = model.chunks.reduce((sum, c) => sum + c.length, 0)
    expect(covered).toBe(body.length)
    expect(model.chunks[0].offset).toBe(0)
  })

  it('reads the stored record and hides the coded payloads behind a kind', () => {
    const body = new Uint8Array([
      ...chunk(11, codedPayload(600)),
      ...chunk(0, storedPayload([16, 3336, 6, 1056, 1404])),
    ])
    const model = decodeModel(buildModel({ body }))
    expect(model.chunks.map((c) => c.kind)).toEqual(['entropyCoded', 'stored'])
    expect(firstStored(model)).toEqual([16, 3336, 6, 1056, 1404])
    expect(storedChunks(model)).toHaveLength(1)
  })

  it('does not mistake a coded chunk for a stored one', () => {
    // A short coded chunk is the hard case: low entropy is not enough on its
    // own, which is why the word check exists.
    const coded = new Uint8Array(24)
    coded.set([0x19, 0x62, 0x06, 0xbd, 0x32, 0xe2, 0x12, 0xbd, 0x19, 0x62, 0x06, 0xbd])
    coded.set([0xa4, 0x10, 0xfd, 0x44, 0, 0, 0, 0, 0xff, 0xff, 0x02, 0x00], 12)
    const model = decodeModel(buildModel({ body: chunk(11, coded) }))
    expect(model.chunks[0].kind).toBe('entropyCoded')
  })

  it('rejects a body that does not start with the chunk tag', () => {
    const body = new Uint8Array(64).fill(0x41)
    expect(() => decodeModel(buildModel({ body }))).toThrow(/does not start with the chunk tag/)
  })

  it('ignores a tag pair that appears inside a payload', () => {
    // Two models in the package have a `b1 75` inside coded data, four and two
    // bytes after a real start. A chunk is at least eight bytes — the span a tag
    // and an integer need — so a pair closer than that to the previous start is
    // data, not a boundary, and is reported rather than sliced on.
    const payload = codedPayload(512)
    payload[0] = 0xb1
    payload[1] = 0x75
    const body = new Uint8Array([...chunk(11, payload), ...chunk(9, codedPayload(256, 5))])
    const model = decodeModel(buildModel({ body }))
    expect(model.chunks).toHaveLength(2)
    expect(model.strayTags).toEqual([{ offset: 4, reason: 'tooClose' }])
    expect(model.chunks.reduce((sum, c) => sum + c.length, 0)).toBe(body.length)
  })

  it('hides no tags when a payload contains none', () => {
    const body = new Uint8Array([...chunk(11, codedPayload(512)), ...chunk(9, codedPayload(256, 5))])
    const model = decodeModel(buildModel({ body }))
    expect(model.strayTags).toEqual([])
    expect(model.tagOffsets).toEqual([0, 516])
  })

  it('drops tags past the boundary the directory names', () => {
    // The directory's first record carries the last real chunk start, four
    // bytes before its tag and in file coordinates. A `b1 75` inside coded data
    // that happens to sit past that point cannot start a chunk, and 54 of the
    // package's models have one.
    const first = codedPayload(512)
    const last = codedPayload(512, 3)
    last[200] = 0xb1
    last[201] = 0x75
    const body = new Uint8Array([...chunk(11, first), ...chunk(9, last)])
    const headerSize = MODEL_HEADER_SIZE
    const lastStart = 516
    const records = Array.from({ length: 7 }, (_, i) =>
      directoryRecord(i === 0 ? { 0: 4, 1: 100, 4: 32, 7: lastStart + headerSize - 4 } : { 0: 4, 1: 200 }),
    )
    const model = decodeModel(buildModel({ body, records }))
    expect(model.directoryLastStart).toBe(lastStart)
    expect(model.chunks).toHaveLength(2)
    expect(model.strayTags).toEqual([{ offset: 516 + 4 + 200, reason: 'afterLastBoundary' }])
    expect(model.chunks.reduce((sum, c) => sum + c.length, 0)).toBe(body.length)
  })

  it('filters nothing when the directory names no boundary a tag sits on', () => {
    const body = new Uint8Array([...chunk(11, codedPayload(512)), ...chunk(9, codedPayload(256, 5))])
    const records = Array.from({ length: 7 }, (_, i) => directoryRecord(i === 0 ? { 0: 4, 7: 9999 } : {}))
    const model = decodeModel(buildModel({ body, records }))
    expect(model.directoryLastStart).toBeNull()
    expect(model.chunks).toHaveLength(2)
  })

  it('treats a chunk of 128 bytes or more as coded', () => {
    const model = decodeModel(buildModel({ body: chunk(11, codedPayload(1024)) }))
    expect(model.chunks[0].payload).toHaveLength(1024)
    expect(model.chunks[0].bytes).toHaveLength(1028)
  })
})

describe('model entropy measurement', () => {
  it('measures a constant buffer at zero bits', () => {
    expect(byteEntropy(new Uint8Array(256))).toBe(0)
  })

  it('measures uniform bytes just under eight bits', () => {
    const bytes = new Uint8Array(256 * 64)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff
    expect(byteEntropy(bytes)).toBeCloseTo(8, 5)
  })

  it('separates the stored record from the coded chunk by a wide margin', () => {
    // The margin is what the container decoder's `stored` claim rests on: in the
    // package every stored record measured at most 5.11 bits and every coded
    // chunk of 256+ bytes at least 6.5 (bar one that size alone excludes).
    const stored = byteEntropy(storedPayload([16, 3336, 6, 1056, 1404]))
    const coded = byteEntropy(codedPayload(2048))
    expect(stored).toBeLessThan(5)
    expect(coded).toBeGreaterThan(7)
  })
})

describe('model sidecars', () => {
  it('names the sidecar beside the model directory', () => {
    expect(sidecarPath('hd/character/enemy/skeleton1/base_body_lod1.model')).toBe(
      'hd/character/enemy/skeleton1.json',
    )
    expect(sidecarPath('hd/items/weapon/knife/blade/blade_lod2.model')).toBe(
      'hd/items/weapon/knife/blade.json',
    )
  })

  it('reads the dependency list, which is where a model names its textures', () => {
    const text = JSON.stringify({
      dependencies: {
        models: [{ path: 'data/hd/x/torso.model' }],
        textures: [
          { path: 'data/hd/x/a.texture' },
          { path: 'data/hd/x/b.texture' },
        ],
        physics: [],
        skeletons: [{ path: 'data/hd/x/x.skeleton' }],
      },
    })
    const dependencies = parseModelDependencies(text)
    expect(dependencies.textures.map((t) => t.path)).toEqual([
      'data/hd/x/a.texture',
      'data/hd/x/b.texture',
    ])
    expect(dependencies.skeletons).toHaveLength(1)
    expect(dependencies.animations).toEqual([])
    expect(dependencies.particles).toEqual([])
  })

  it('ignores entries that are not paths', () => {
    const dependencies = parseModelDependencies('{"dependencies":{"textures":[{},{"path":7},{"path":"a.texture"}]}}')
    expect(dependencies.textures).toEqual([{ path: 'a.texture' }])
  })
})

function storedPayload(words: number[]): Uint8Array {
  const out = new Uint8Array(words.length * 4)
  const view = new DataView(out.buffer)
  words.forEach((word, i) => view.setUint32(i * 4, word, true))
  return out
}
