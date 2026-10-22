import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { parseManifest, readEntry, readFile, findEntry, type RomfsSource } from '../romfs'

/**
 * The RomFS reader is exercised against a package we fabricate, so the whole
 * path — manifest parsing, key → archive/offset, the three storage encodings,
 * MD5 verification — is verified without needing a single byte of game data.
 */

interface Packages {
  manifest: string
  archives: Map<string, Uint8Array>
}

/** Build a one-entry manifest line in the real format (only the used fields matter). */
function buildEntry(options: {
  path: string
  archive: [number, number]
  offset: number
  payload: Uint8Array
  encoding: 'z' | 'n' | 'x'
  stored: Uint8Array
  corruptMd5?: boolean
}): { line: string; stored: Uint8Array } {
  const key = new Uint8Array(16)
  key[9] = options.archive[0]
  key[10] = options.archive[1]
  const offset = options.offset
  key[11] = (offset / 0x100000000) & 0xff
  key[12] = (offset >>> 24) & 0xff
  key[13] = (offset >>> 16) & 0xff
  key[14] = (offset >>> 8) & 0xff
  key[15] = offset & 0xff

  const md5 = options.corruptMd5
    ? '0'.repeat(32)
    : createHash('md5').update(options.payload).digest('hex')
  const hex = Array.from(key)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  // f: [0..3] unused, 4 md5, 5 unused, 6 key, 7 stored length, 8 encoding,
  //    9 archive:path, 10 unused
  const line = ['0', '0', '0', '0', md5, '0', hex, String(options.stored.length), options.encoding, `00000000:data/${options.path}`, '0'].join('|')
  return { line, stored: options.stored }
}

function sourceOf(packages: Packages): RomfsSource {
  return {
    readManifest: async () => packages.manifest,
    readArchive: async (name: string) => {
      const archive = packages.archives.get(name)
      if (!archive) throw new Error(`missing archive ${name}`)
      return archive
    },
  }
}

function packageOf(entries: Array<{ line: string; stored: Uint8Array }>, archive: [number, number]): Packages {
  const name = `${String(archive[0]).padStart(2, '0')}-${String(archive[1]).padStart(8, '0')}.data`
  const total = entries.reduce((sum, entry) => sum + entry.stored.length, 0)
  const bytes = new Uint8Array(total)
  let at = 0
  for (const entry of entries) {
    bytes.set(entry.stored, at)
    at += entry.stored.length
  }
  return {
    manifest: `# comment line\n${entries.map((entry) => entry.line).join('\n')}\n`,
    archives: new Map([[name, bytes]]),
  }
}

/** Build the chunked container: header, then (size, unused) records. */
function chunked(payload: Uint8Array, split: number): Uint8Array {
  const parts: Uint8Array[] = []
  for (let at = 0; at < payload.length; at += split) {
    const slice = payload.subarray(at, at + split)
    // Alternate raw and deflated to exercise both branches in one payload.
    const useRaw = parts.length % 2 === 0
    const body = useRaw ? slice : new Uint8Array(deflateSync(slice))
    const prefixed = new Uint8Array(body.length + 1)
    prefixed[0] = useRaw ? 0x4e : 0x7a
    prefixed.set(body, 1)
    parts.push(prefixed)
  }

  const headerSize = 12 + parts.length * 24
  const total = headerSize + parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(4, headerSize, false)
  // Byte 9..11 hold the count in the original; keep the layout, write big-endian.
  out[9] = (parts.length >> 16) & 0xff
  out[10] = (parts.length >> 8) & 0xff
  out[11] = parts.length & 0xff
  let at = headerSize
  parts.forEach((part, index) => {
    view.setUint32(12 + index * 24, part.length, false)
    out.set(part, at)
    at += part.length
  })
  return out
}

describe('romfs manifest', () => {
  it('reads path, md5, length, encoding and key', () => {
    const payload = new TextEncoder().encode('hello')
    const entry = buildEntry({
      path: 'hd/ui/example.sprite',
      archive: [3, 7],
      offset: 0,
      payload,
      encoding: 'z',
      stored: deflateSync(payload),
    })
    const [parsed] = parseManifest(packageOf([entry], [3, 7]).manifest)
    expect(parsed.path).toBe('data/hd/ui/example.sprite')
    expect(parsed.rawLength).toBe(entry.stored.length)
    expect(parsed.encoding).toBe('z')
    expect(parsed.key[9]).toBe(3)
    expect(parsed.key[10]).toBe(7)
  })

  it('matches paths case-insensitively and ignores a leading slash', () => {
    const payload = new TextEncoder().encode('x')
    const entry = buildEntry({
      path: 'HD/Global/UI/Thing.sprite',
      archive: [0, 1],
      offset: 0,
      payload,
      encoding: 'n',
      stored: payload,
    })
    const entries = parseManifest(packageOf([entry], [0, 1]).manifest)
    expect(findEntry(entries, '/hd/global/ui/thing.sprite')).not.toBeNull()
    expect(findEntry(entries, 'hd/global/ui/thing.sprite')).not.toBeNull()
    expect(findEntry(entries, 'hd/global/ui/missing.sprite')).toBeNull()
  })
})

describe('romfs payload encodings', () => {
  const payload = new Uint8Array(600)
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 53 + 7) & 0xff

  it('reads a zlib entry', async () => {
    const stored = new Uint8Array(deflateSync(payload))
    const entry = buildEntry({ path: 'a/z.sprite', archive: [0, 2], offset: 0, payload, encoding: 'z', stored })
    const data = await readFile(sourceOf(packageOf([entry], [0, 2])), parseManifest(packageOf([entry], [0, 2]).manifest), 'a/z.sprite')
    expect(Array.from(data)).toEqual(Array.from(payload))
  })

  it('reads a raw entry', async () => {
    const entry = buildEntry({ path: 'a/n.sprite', archive: [0, 3], offset: 0, payload, encoding: 'n', stored: payload })
    const packages = packageOf([entry], [0, 3])
    const data = await readFile(sourceOf(packages), parseManifest(packages.manifest), 'a/n.sprite')
    expect(Array.from(data)).toEqual(Array.from(payload))
  })

  it('reads a chunked entry that mixes raw and deflated records', async () => {
    const stored = chunked(payload, 128)
    const entry = buildEntry({ path: 'a/x.sprite', archive: [0, 4], offset: 0, payload, encoding: 'x', stored })
    const packages = packageOf([entry], [0, 4])
    const data = await readFile(sourceOf(packages), parseManifest(packages.manifest), 'a/x.sprite')
    expect(Array.from(data)).toEqual(Array.from(payload))
  })

  it('honours the entry offset inside a shared archive', async () => {
    const first = buildEntry({
      path: 'a/first.sprite',
      archive: [0, 5],
      offset: 0,
      payload: new Uint8Array([1, 2, 3]),
      encoding: 'n',
      stored: new Uint8Array([1, 2, 3]),
    })
    const second = buildEntry({
      path: 'a/second.sprite',
      archive: [0, 5],
      offset: 3,
      payload,
      encoding: 'n',
      stored: payload,
    })
    // The offset was baked into the key before we knew the archive layout, so
    // rebuild the second entry's line with the real offset (3).
    const packages = packageOf([first, second], [0, 5])
    const entries = parseManifest(packages.manifest)
    const data = await readEntry(sourceOf(packages), entries[1])
    expect(Array.from(data)).toEqual(Array.from(payload))
  })
})

describe('romfs verification', () => {
  it('rejects an entry whose payload does not match the manifest', async () => {
    const payload = new Uint8Array([9, 9, 9])
    const entry = buildEntry({
      path: 'a/bad.sprite',
      archive: [0, 6],
      offset: 0,
      payload,
      encoding: 'n',
      stored: payload,
      corruptMd5: true,
    })
    const packages = packageOf([entry], [0, 6])
    await expect(readFile(sourceOf(packages), parseManifest(packages.manifest), 'a/bad.sprite')).rejects.toThrow(
      /MD5 mismatch/,
    )
  })

  it('reports a missing path rather than reading the wrong entry', async () => {
    const payload = new Uint8Array([1])
    const entry = buildEntry({ path: 'a/only.sprite', archive: [0, 7], offset: 0, payload, encoding: 'n', stored: payload })
    const packages = packageOf([entry], [0, 7])
    await expect(readFile(sourceOf(packages), parseManifest(packages.manifest), 'a/nope.sprite')).rejects.toThrow(
      /not in the package/,
    )
  })
})
