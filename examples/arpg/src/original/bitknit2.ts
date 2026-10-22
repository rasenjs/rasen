/**
 * BitKnit2 — the entropy coder inside Resurrected's Granny3D containers.
 *
 * `.model`, `.skeleton` and `.animations` files (and the `.gr2` files they are
 * built from) are a 456-byte header plus a body of back-to-back compressed
 * section payloads; each payload starts with the two bytes `b1 75` and decodes
 * to one Granny section (geometry, the deformable-index section, the
 * discardable section, and so on). Pointer-fixup tables are framed as
 * `[u32 compressedSize][BitKnit2 payload]` and each decompresses to
 * `count * 12` bytes of `(u32 srcOffset, u32 dstSection, u32 dstOffset)`
 * triples. All of those payloads are standalone BitKnit2 streams and are what
 * `decodeBitknit2` decodes.
 *
 * A stream is a 2-byte little-endian magic `0x75B1`, then output *quanta*:
 * the output is split at 64 KiB boundaries of the *output*, and each quantum
 * carries its own pair of interleaved 32-bit rANS states whose initialization
 * block reads two `u16`s into a merged 32-bit state that is split by an
 * in-band nibble. Symbols come from three deferred adaptive probability
 * models (command word, copy-offset cache reference, copy offset length),
 * copies go through an 8-entry LRU copy-offset cache, and literals are delta
 * coded against the most recent copy offset (or the previous byte).
 *
 * ## Sources and what is measured versus cited
 *
 * - **Ported from** `rans.h` in eiz/pybg3 by Mackenzie Straight (MIT — the
 *   notice is reproduced above the implementation below). That file is a
 *   complete tested decoder and is the *authoritative* description of the
 *   format; every constant and algorithm here follows it.
 * - **Cited:** the draft format sketch `bitknit2.txt` (same project) and the
 *   rANS references listed in `rans.h` (Duda, Giesen, ryg_rans). The draft is
 *   marked unverified; where it disagrees with `rans.h` — a raw quantum that
 *   would copy past the end of the source, the truncating 32-bit division in
 *   the model update, and the per-quantum (not per-stream) final-state check —
 *   `rans.h` wins and is what is implemented.
 * - **Measured:** the decoder is checked byte-exact against real Resurrected
 *   section payloads (see `__tests__/bitknit2.test.ts` and
 *   `tools/verify-bitknit2.ts`, which decode the `diablo`, `spheres` and
 *   `blend_sphere` sections from `.scratch/model-probe`). The sample bytes
 *   agree with `rans.h` as written; no format divergence was found.
 */

/*
 * This file is a port of `rans.h` from eiz/pybg3 and includes material from
 * that work. Its license notice follows.
 *
 * pybg3
 *
 * Copyright (C) 2024 Mackenzie Straight.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/** Little-endian magic word every stream starts with: the bytes `b1 75`. */
export const BITKNIT2_MAGIC = 0x75b1

/** Frequency tables sum to 2^15; codes are 15-bit. */
const FREQUENCY_BITS = 15
const TOTAL_FREQUENCY = 1 << FREQUENCY_BITS

/** Reverse lookups are accelerated by a 2^10-entry table of start symbols. */
const LOOKUP_BITS = 10
const LOOKUP_SHIFT = FREQUENCY_BITS - LOOKUP_BITS

/** Each model recomputes its table every 1024 symbols it has seen. */
const ADAPTATION_INTERVAL = 1024

/** Two rANS states each renormalize with one 16-bit stream word. */
const RENORM_THRESHOLD = 1 << 16

/**
 * A deferred adaptive symbol probability model.
 *
 * The distribution starts as `vocabSize - minProbableSymbols` (approximately)
 * equal-probability symbols followed by `minProbableSymbols` symbols of
 * frequency 1. Every {@link ADAPTATION_INTERVAL} decoded symbols the table is
 * recomputed as an exponential moving average of the observed prefix sums.
 * Every bin keeps a frequency of at least 1, so codes always resolve.
 */
class DeferredAdaptiveModel {
  /** Prefix sums of frequencies; `sums[vocabSize]` is always 2^15. */
  readonly sums: Uint16Array
  /** Maps the high bits of a code to the symbol a linear scan starts at. */
  private readonly lookup: Uint16Array = new Uint16Array(1 << LOOKUP_BITS)
  /** Per-symbol observation counts since the last adaptation. */
  private readonly accumulators: Uint16Array
  private readonly frequencyIncrement: number
  private readonly lastFrequencyIncrement: number
  private adaptationCounter = 0

  constructor(
    readonly vocabSize: number,
    minProbableSymbols: number,
  ) {
    this.sums = new Uint16Array(vocabSize + 1)
    this.accumulators = new Uint16Array(vocabSize)
    this.frequencyIncrement = Math.floor((TOTAL_FREQUENCY - vocabSize) / ADAPTATION_INTERVAL)
    // The remainder after `frequencyIncrement` rounds out the total, so the
    // accumulated frequencies of one interval always sum to 2^15 + 1.
    this.lastFrequencyIncrement =
      1 + TOTAL_FREQUENCY - vocabSize - this.frequencyIncrement * ADAPTATION_INTERVAL
    const equiprobable = vocabSize - minProbableSymbols
    for (let i = 0; i < equiprobable; i++) {
      this.sums[i] = Math.floor(((TOTAL_FREQUENCY - minProbableSymbols) * i) / equiprobable)
    }
    for (let i = equiprobable; i <= vocabSize; i++) {
      this.sums[i] = TOTAL_FREQUENCY - vocabSize + i
    }
    this.accumulators.fill(1)
    this.finishUpdate()
  }

  /** Frequency of a symbol. */
  frequencyOf(symbol: number): number {
    return this.sums[symbol + 1] - this.sums[symbol]
  }

  /** Sum of the frequencies of all symbols below `symbol`. */
  sumBelow(symbol: number): number {
    return this.sums[symbol]
  }

  /** Given a 15-bit code, the symbol whose frequency range contains it. */
  findSymbol(code: number): number {
    let symbol = this.lookup[code >>> LOOKUP_SHIFT]
    while (code >= this.sums[symbol + 1]) {
      symbol++
      if (symbol >= this.vocabSize) {
        throw new Error(`BitKnit2: corrupt symbol model (code ${code})`)
      }
    }
    return symbol
  }

  /** Count a decoded symbol and adapt every {@link ADAPTATION_INTERVAL}-th time. */
  observe(symbol: number): void {
    this.accumulators[symbol] += this.frequencyIncrement
    this.adaptationCounter = (this.adaptationCounter + 1) % ADAPTATION_INTERVAL
    if (this.adaptationCounter !== 0) return
    this.accumulators[symbol] += this.lastFrequencyIncrement
    // Move every bin halfway towards the prefix sums of the accumulators,
    // then restart the accumulators. The division must floor for negative
    // differences, which is what `rans.h` gets from its 32-bit unsigned
    // division once the wrapped sum is truncated back into the 16-bit table.
    let prefix = 0
    for (let i = 1; i <= this.vocabSize; i++) {
      prefix += this.accumulators[i - 1]
      this.sums[i] += (prefix - this.sums[i]) >> 1
      this.accumulators[i - 1] = 1
    }
    this.finishUpdate()
  }

  /** Recompute the reverse-lookup table from `sums`. */
  private finishUpdate(): void {
    let code = 0
    let symbol = 0
    let next = this.sums[1]
    while (code < TOTAL_FREQUENCY) {
      if (code < next) {
        this.lookup[code >>> LOOKUP_SHIFT] = symbol
        code += 1 << LOOKUP_SHIFT
      } else {
        symbol++
        next = this.sums[symbol + 1]
      }
    }
  }
}

/**
 * The 8-entry copy-offset cache.
 *
 * Entries never move; a 32-bit swizzle table of 4-bit slot indices is rotated
 * on a hit, and a fresh offset replaces the second-most-recently-used entry
 * for stability (which is why an entry of 1 is reachable at stream start).
 */
class OffsetCache {
  private readonly entries = new Uint32Array(8).fill(1)
  private entryOrder = 0x76543210

  /** Cache reference `index`, marking the entry most recently used. */
  hit(index: number): number {
    const slot = (this.entryOrder >>> (index * 4)) & 15
    const rotateMask = (16 << (index * 4)) - 1
    const rotated = ((this.entryOrder << 4) | slot) & rotateMask
    this.entryOrder = (this.entryOrder & ~rotateMask) | rotated
    return this.entries[slot]
  }

  /** Insert a fresh offset as second-most-recently-used, evicting the oldest. */
  insert(value: number): void {
    this.entries[this.entryOrder >>> 28] = this.entries[(this.entryOrder >>> 24) & 15]
    this.entries[(this.entryOrder >>> 24) & 15] = value
  }
}

/** True when `src` begins with the BitKnit2 magic word (`b1 75`). */
export function isBitknit2(src: Uint8Array): boolean {
  return src.length >= 2 && src[0] === 0xb1 && src[1] === 0x75
}

/**
 * Decode one standalone BitKnit2 stream to exactly `dstLen` bytes.
 *
 * @param src the stream, magic word included; any odd trailing byte is unused
 * @param dstLen the exact number of output bytes the stream encodes
 * @returns a `dstLen`-byte buffer with the decoded data
 * @throws `Error` when the stream has bad magic, is truncated, or is corrupt
 */
export function decodeBitknit2(src: Uint8Array, dstLen: number): Uint8Array {
  return new Bitknit2Decoder(src, dstLen).decode()
}

/** Bounds-checked decoder state for one stream; see {@link decodeBitknit2}. */
class Bitknit2Decoder {
  /** Source position in 16-bit words, like `rans.h`'s stack of stream words. */
  private wordPos = 0
  private readonly wordCount: number
  private readonly out: Uint8Array
  private outPos = 0
  /** The two interleaved rANS states; both renormalize to >= 2^16. */
  private state1 = RENORM_THRESHOLD
  private state2 = RENORM_THRESHOLD
  /** Literals are delta coded against this offset (initially the previous byte). */
  private deltaOffset = 1
  private readonly commandModels = [
    new DeferredAdaptiveModel(300, 36),
    new DeferredAdaptiveModel(300, 36),
    new DeferredAdaptiveModel(300, 36),
    new DeferredAdaptiveModel(300, 36),
  ]
  private readonly cacheReferenceModels = [
    new DeferredAdaptiveModel(40, 0),
    new DeferredAdaptiveModel(40, 0),
    new DeferredAdaptiveModel(40, 0),
    new DeferredAdaptiveModel(40, 0),
  ]
  private readonly copyOffsetModel = new DeferredAdaptiveModel(21, 0)
  private readonly offsetCache = new OffsetCache()

  constructor(
    private readonly src: Uint8Array,
    dstLen: number,
  ) {
    if (!Number.isInteger(dstLen) || dstLen < 0) {
      throw new Error(`BitKnit2: invalid destination length ${dstLen}`)
    }
    this.wordCount = src.length >>> 1
    this.out = new Uint8Array(dstLen)
  }

  decode(): Uint8Array {
    if (!isBitknit2(this.src)) {
      throw new Error('BitKnit2: bad magic (expected the bytes b1 75)')
    }
    this.wordPos = 1
    while (this.outPos < this.out.length) {
      if (this.wordPos >= this.wordCount) {
        throw new Error(`BitKnit2: truncated stream (need more output at ${this.outPos}/${this.out.length})`)
      }
      this.decodeQuantum()
    }
    return this.out
  }

  /** Decode one quantum: output up to the next 64 KiB boundary of the output. */
  private decodeQuantum(): void {
    const quantumEnd = Math.min(this.out.length, (this.outPos & ~0xffff) + 0x10000)
    // A NUL word at the start of a quantum means the rest of it is raw bytes.
    if (this.peekWord() === 0) {
      this.wordPos++
      const copyLen = Math.min((this.wordCount - this.wordPos) * 2, quantumEnd - this.outPos)
      this.out.set(this.src.subarray(this.wordPos * 2, this.wordPos * 2 + copyLen), this.outPos)
      this.outPos += copyLen
      this.wordPos += copyLen >>> 1
      return
    }
    this.decodeInitialState()
    if (this.outPos === 0) {
      this.out[this.outPos++] = this.popBits(8)
    }
    while (this.outPos < quantumEnd) {
      const modelIndex = this.outPos & 3
      const command = this.popSymbol(this.commandModels[modelIndex])
      if (command >= 256) {
        this.decodeCopy(command, modelIndex)
      } else {
        this.writeDeltaLiteral(command)
      }
    }
    // The encoder writes each quantum's streams in reverse and "ties the
    // knot" on the initial state, so both states end at exactly 2^16.
    if (this.state1 !== RENORM_THRESHOLD || this.state2 !== RENORM_THRESHOLD) {
      throw new Error(`BitKnit2: rANS stream corrupted (quantum ending at ${this.outPos})`)
    }
  }

  /** A delta-coded literal: `value + out[outPos - deltaOffset]`, wrapping mod 256. */
  private writeDeltaLiteral(value: number): void {
    const base = this.outPos - this.deltaOffset
    if (base < 0) {
      throw new Error(`BitKnit2: delta literal before its base byte (offset ${this.outPos})`)
    }
    this.out[this.outPos++] = (value + this.out[base]) & 0xff
  }

  /** A copy command: LZ-style, offset from the cache or the offset model. */
  private decodeCopy(command: number, modelIndex: number): void {
    // Command 256..287 carries the copy length inline (minimum 2); 288..299
    // extends it with B = command - 287 raw bits (minimum 34).
    let copyLength: number
    if (command < 288) {
      copyLength = command - 254
    } else {
      const copyLengthBits = command - 287
      copyLength = (1 << copyLengthBits) + this.popBits(copyLengthBits) + 32
    }
    const cacheReference = this.popSymbol(this.cacheReferenceModels[modelIndex])
    let copyOffset: number
    if (cacheReference < 8) {
      copyOffset = this.offsetCache.hit(cacheReference)
    } else {
      const offsetLength = this.popSymbol(this.copyOffsetModel)
      let offsetBits = this.popBits(offsetLength % 16)
      if (offsetLength >= 16) {
        offsetBits = (offsetBits << 16) | this.readWord()
      }
      // Offsets are reduced by 32 so that cacheReference 8 and offsetLength 0
      // yield offset 1 (32 << 0 is already 32).
      copyOffset = (32 << offsetLength) + (offsetBits << 5) - 32 + (cacheReference - 7)
      this.offsetCache.insert(copyOffset)
    }
    if (copyOffset > this.outPos) {
      throw new Error(`BitKnit2: copy offset ${copyOffset} past the start of the output (${this.outPos})`)
    }
    if (copyLength > this.out.length - this.outPos) {
      throw new Error(`BitKnit2: copy of ${copyLength} bytes overruns the output (${this.out.length - this.outPos} left)`)
    }
    this.deltaOffset = copyOffset
    for (let i = 0; i < copyLength; i++) {
      this.out[this.outPos] = this.out[this.outPos - copyOffset]
      this.outPos++
    }
  }

  /**
   * Read the per-quantum rANS init block: two words into a merged 32-bit
   * state, a 4-bit in-band split point, then the high half feeds state 1 and
   * the low half becomes the high bits of state 2.
   */
  private decodeInitialState(): void {
    const merged = this.readWord() * 0x10000 + this.readWord()
    let init = merged
    const splitPoint = init & 0xf
    init = init >>> 4
    if (init < RENORM_THRESHOLD) {
      init = init * 0x10000 + this.readWord()
    }
    this.state1 = Math.floor(init / 2 ** splitPoint)
    if (this.state1 < RENORM_THRESHOLD) {
      this.state1 = this.state1 * 0x10000 + this.readWord()
    }
    // The low half of `init` plus one fresh word form state 2's body; one bit
    // above the split is always set, so the split needs one bit fewer.
    const state2Body = init * 0x10000 + this.readWord()
    this.state2 = (state2Body % 2 ** (16 + splitPoint)) + 2 ** (16 + splitPoint)
  }

  /** Extract `nbits` raw bits from state 1, then swap the two states. */
  private popBits(nbits: number): number {
    const value = this.state1 & ((1 << nbits) - 1)
    this.state1 = this.state1 >>> nbits
    this.renormalize()
    const state = this.state1
    this.state1 = this.state2
    this.state2 = state
    return value
  }

  /** Decode one symbol from state 1 through `model`, then swap the states. */
  private popSymbol(model: DeferredAdaptiveModel): number {
    const code = this.state1 & (TOTAL_FREQUENCY - 1)
    const symbol = model.findSymbol(code)
    this.state1 = Math.floor(this.state1 / TOTAL_FREQUENCY) * model.frequencyOf(symbol) + code - model.sumBelow(symbol)
    this.renormalize()
    model.observe(symbol)
    const state = this.state1
    this.state1 = this.state2
    this.state2 = state
    return symbol
  }

  /** Pull one 16-bit word into state 1 whenever it has dropped below 2^16. */
  private renormalize(): void {
    if (this.state1 < RENORM_THRESHOLD) {
      this.state1 = this.state1 * 0x10000 + this.readWord()
    }
  }

  private peekWord(): number {
    if (this.wordPos >= this.wordCount) {
      throw new Error('BitKnit2: unexpected end of stream')
    }
    return this.src[this.wordPos * 2] | (this.src[this.wordPos * 2 + 1] << 8)
  }

  private readWord(): number {
    const word = this.peekWord()
    this.wordPos++
    return word
  }
}
