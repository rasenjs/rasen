/**
 * PNG decoding for the Perry host.
 *
 * ── Duplication, and why it is flagged rather than hidden ─────────────────
 * This is byte-for-byte the decoder in `examples/perry-spine/src/platform.ts`.
 * Duplicating it is a deliberate, temporary choice: the logic is subtle (PNG
 * filters, Paeth) and both examples need exactly it, so the alternatives were
 * worse —
 *
 *   * importing across examples would couple two independent examples through
 *     a deep relative path;
 *   * extracting a package now would mean inventing a `@rasenjs/perry` boundary
 *     before the Perry UI layer has settled, which is the abstraction this
 *     stage is explicitly deferring.
 *
 * The right end state is one shared native-host package holding this file, the
 * window/GPU surface plumbing, and the perry-ui bindings. Until then, ANY change
 * here must be mirrored in `perry-spine/src/platform.ts` and vice versa.
 *
 * ── Perry quirks encoded below ───────────────────────────────────────────
 * `fs.readFileSync` returns a Buffer whose `.length` reports 0; every byte count
 * must come from `.byteLength`. The same defect applies to typed-array `.length`
 * inside the decoder, which is why `parts[i].byteLength` is spelled out.
 */
import * as zlib from "zlib";

/** A decoded PNG: dimensions plus tightly packed RGBA8 pixels. */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** Big-endian u32 at `offset`. */
function u32be(b: Uint8Array, offset: number): number {
  return ((b[offset] << 24) | (b[offset + 1] << 16) | (b[offset + 2] << 8)
    | b[offset + 3]) >>> 0;
}

/** Paeth predictor, per the PNG spec. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = p > a ? p - a : a - p;
  const pb = p > b ? p - b : b - p;
  const pc = p > c ? p - c : c - p;
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG into RGBA8.
 *
 * Supports what the Spine atlases use: 8-bit RGB or RGBA, non-interlaced,
 * zlib-compressed IDAT. Throws a descriptive error on anything else rather than
 * producing silently wrong pixels.
 */
export function decodePng(bytes: Uint8Array): DecodedImage {
  const sig = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78
    && bytes[3] === 71;
  if (!sig) throw new Error("decodePng: not a PNG (bad signature)");

  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const interlace = bytes[28];
  if (bitDepth !== 8) {
    throw new Error("decodePng: unsupported bit depth " + bitDepth);
  }
  if (colorType !== 6 && colorType !== 2) {
    throw new Error("decodePng: unsupported colour type " + colorType
      + " (only RGB=2 and RGBA=6 are implemented)");
  }
  if (interlace !== 0) {
    throw new Error("decodePng: interlaced PNGs are not supported");
  }

  const parts: Uint8Array[] = [];
  let idatLen = 0;
  let off = 8;
  const total = bytes.byteLength;
  while (off + 8 <= total) {
    const len = u32be(bytes, off);
    const t0 = bytes[off + 4];
    const t1 = bytes[off + 5];
    const t2 = bytes[off + 6];
    const t3 = bytes[off + 7];
    if (t0 === 73 && t1 === 69 && t2 === 78 && t3 === 68) break; // IEND
    if (t0 === 73 && t1 === 68 && t2 === 65 && t3 === 84) {      // IDAT
      parts.push(bytes.subarray(off + 8, off + 8 + len));
      idatLen = idatLen + len;
    }
    off = off + 8 + len + 4;
  }
  if (idatLen === 0) throw new Error("decodePng: no IDAT chunks found");

  // `byteLength`, not `length` — see the module note.
  const idat = new Uint8Array(idatLen);
  let cursor = 0;
  for (let i = 0; i < parts.length; i++) {
    idat.set(parts[i], cursor);
    cursor = cursor + parts[i].byteLength;
  }
  if (cursor !== idatLen) {
    throw new Error("decodePng: assembled " + cursor + " of " + idatLen
      + " IDAT bytes");
  }

  const raw = zlib.inflateSync(idat as never) as unknown as Uint8Array;

  const channels = colorType === 2 ? 3 : 4;
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const cur = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp];
    rp = rp + 1;
    for (let x = 0; x < stride; x++) {
      const rawv = raw[rp];
      rp = rp + 1;
      const a = x >= channels ? cur[x - channels] : 0;
      const b = y > 0 ? prev[x] : 0;
      const c = (x >= channels && y > 0) ? prev[x - channels] : 0;
      let v: number;
      if (filter === 0) v = rawv;
      else if (filter === 1) v = rawv + a;
      else if (filter === 2) v = rawv + b;
      else if (filter === 3) v = rawv + ((a + b) >> 1);
      else if (filter === 4) v = rawv + paeth(a, b, c);
      else throw new Error("decodePng: unknown filter " + filter + " on row " + y);
      cur[x] = v & 255;
    }
    const dst = y * width * 4;
    if (channels === 4) {
      out.set(cur, dst);
    } else {
      for (let px = 0; px < width; px++) {
        const src = px * 3;
        out[dst + px * 4] = cur[src];
        out[dst + px * 4 + 1] = cur[src + 1];
        out[dst + px * 4 + 2] = cur[src + 2];
        out[dst + px * 4 + 3] = 255;
      }
    }
    prev.set(cur);
  }

  return { width: width, height: height, rgba: out };
}
