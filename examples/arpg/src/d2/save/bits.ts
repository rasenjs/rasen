/**
 * The save file's bit stream.
 *
 * Diablo II writes a save as a byte header followed by bit-packed sections, so
 * every reader and writer in this folder sits on this buffer. Stream bit `p` is
 * bit `p mod 8` of byte `p div 8` — LSB first, bytes in order — and a fresh byte
 * is zeroed before bits are ORed into it, which is what makes the padding zero.
 *
 * The widths are 1..32 and every writer clamps rather than throws: the game's own
 * writers disagree about how to clamp (`BITBUF_WriteClamped` saturates as
 * unsigned, the `gf` stat writer as signed), so the clamp lives at the call site
 * and this buffer only refuses what would corrupt the stream.
 */

/** Bit-level writer over a growing byte buffer. */
export class BitWriter {
  private bytes = new Uint8Array(256)
  private bit = 0

  /** Bits written so far. */
  get position(): number {
    return this.bit
  }

  /** The stream up to the last whole byte, plus any partly written one. */
  toBytes(): Uint8Array {
    return this.bytes.slice(0, Math.ceil(this.bit / 8))
  }

  /** Appends the low `width` bits of `value`, LSB first. */
  write(value: number, width: number): void {
    if (width < 1 || width > 32 || !Number.isInteger(width)) {
      throw new RangeError(`bit width must be 1..32, got ${width}`)
    }
    const needed = Math.ceil((this.bit + width) / 8)
    if (needed > this.bytes.length) {
      let size = this.bytes.length * 2
      while (size < needed) size *= 2
      const next = new Uint8Array(size)
      next.set(this.bytes)
      this.bytes = next
    }
    let remaining = width
    let value32 = value >>> 0
    while (remaining > 0) {
      const byteIndex = this.bit >>> 3
      const bitIndex = this.bit & 7
      const take = Math.min(8 - bitIndex, remaining)
      const mask = (1 << take) - 1
      this.bytes[byteIndex] |= (value32 & mask) << bitIndex
      value32 >>>= take
      remaining -= take
      this.bit += take
    }
  }

  /** Appends whole bytes at the current position. */
  writeBytes(bytes: Uint8Array): void {
    for (const byte of bytes) this.write(byte, 8)
  }

  /** Writes a string as `width` bits per character, including its terminating zero. */
  writePaddedString(text: string, width: number): void {
    for (let i = 0; i < text.length; i += 1) this.write(text.charCodeAt(i), width)
    this.write(0, width)
  }

  /** Pads with zero bits up to the next byte boundary. */
  align(): void {
    this.bit = (this.bit + 7) & ~7
  }
}

/** Bit-level reader, the inverse of {@link BitWriter}. */
export class BitReader {
  private bit = 0

  constructor(private readonly bytes: Uint8Array) {}

  get position(): number {
    return this.bit
  }

  /** Moves to the next byte boundary. */
  align(): void {
    this.bit = (this.bit + 7) & ~7
  }

  /** Reads `count` whole bytes at the current position. */
  readBytes(count: number): Uint8Array {
    const out = new Uint8Array(count)
    for (let i = 0; i < count; i += 1) out[i] = this.read(8)
    return out
  }

  /** Reads `width` bits as an unsigned value. Bits past the end read as zero. */
  read(width: number): number {
    if (width < 1 || width > 32 || !Number.isInteger(width)) {
      throw new RangeError(`bit width must be 1..32, got ${width}`)
    }
    let remaining = width
    let out = 0
    let shift = 0
    while (remaining > 0) {
      const byteIndex = this.bit >>> 3
      const bitIndex = this.bit & 7
      const take = Math.min(8 - bitIndex, remaining)
      const byte = byteIndex < this.bytes.length ? this.bytes[byteIndex] : 0
      const mask = (1 << take) - 1
      out |= ((byte >>> bitIndex) & mask) << shift
      shift += take
      remaining -= take
      this.bit += take
    }
    return out >>> 0
  }

  /** Reads `width` bits and sign-extends them. */
  readSigned(width: number): number {
    const value = this.read(width)
    if (width >= 32) return value | 0
    const sign = 1 << (width - 1)
    return (value & sign) === 0 ? value : (value | (0xffffffff << width)) | 0
  }
}
