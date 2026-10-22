/**
 * Minimal PNG encoder.
 *
 * The decoded original sprites are raw RGBA, and the app wants images. Encoding
 * PNG (rather than, say, raw dumps) keeps the extracted folder small and lets the
 * browser decode them natively, so nothing custom is involved at run time.
 *
 * Uses `CompressionStream('deflate')` — which is exactly the zlib stream a PNG
 * `IDAT` holds — so the same code runs under Node and in a browser.
 */

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  const transform = new CompressionStream('deflate') as unknown as TransformStream<
    Uint8Array,
    Uint8Array
  >
  const stream = source.pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Encode 8-bit RGBA pixels as a PNG. */
export async function encodePng(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const expected = width * height * 4
  if (rgba.length < expected) {
    throw new Error(`png: expected ${expected} bytes of RGBA, got ${rgba.length}`)
  }

  // One filter byte (0 = none) per scanline.
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const target = y * (width * 4 + 1)
    raw[target] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), target + 1)
  }

  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // compression: deflate
  ihdr[11] = 0 // filter method
  ihdr[12] = 0 // interlace: none

  const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
