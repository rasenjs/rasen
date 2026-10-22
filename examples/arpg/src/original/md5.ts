/**
 * MD5 (RFC 1321).
 *
 * Needed because the RomFS manifest stores each entry's MD5 and the reader
 * verifies it before use — that is how a wrong game version is caught rather
 * than producing silently wrong pixels. Implemented here rather than using
 * `node:crypto` because the reader also has to run in the browser, where the
 * user picks their extracted RomFS folder.
 */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const K = new Uint32Array(64)
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)

function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c))
}

/** Returns the 16-byte digest. */
export function md5(input: Uint8Array): Uint8Array {
  const length = input.length
  // Pad: 0x80, then zeros, then the bit length as a 64-bit little-endian value.
  const padded = new Uint8Array((((length + 8) >> 6) + 1) << 6)
  padded.set(input)
  padded[length] = 0x80
  const bitLength = length * 8
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, bitLength >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(bitLength / 4294967296), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const m = new Uint32Array(16)
  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(chunk + i * 4, true)

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      f = (f + a + K[i] + m[g]) | 0
      a = d
      d = c
      c = b
      b = (b + rotl(f, S[i])) | 0
    }

    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const out = new Uint8Array(16)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, a0 >>> 0, true)
  outView.setUint32(4, b0 >>> 0, true)
  outView.setUint32(8, c0 >>> 0, true)
  outView.setUint32(12, d0 >>> 0, true)
  return out
}

/** Lowercase hex digest. */
export function md5Hex(input: Uint8Array): string {
  let out = ''
  for (const byte of md5(input)) out += byte.toString(16).padStart(2, '0')
  return out
}
