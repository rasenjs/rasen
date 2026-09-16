/**
 * Perry host platform layer for the Spine example.
 *
 * This is the *only* part of the example that is Perry-specific, and it plugs
 * into the shared library's existing seams rather than forking it:
 *
 *   * `fs.readFileSync` + a PNG decoder supply raw bytes, since Perry has no
 *     DOM and therefore no `<img>`/`createImageBitmap`.
 *   * `setImageAdapter()` — the injection point `@rasenjs/assets` already
 *     exposes for native hosts — is how the decoded image reaches the loader.
 *
 * Everything above this file (Spine parsing, pose solving, geometry) comes
 * from `@rasenjs/assets` unchanged.
 */
import * as fs from "fs";
import * as zlib from "zlib";
import { setImageAdapter, type ImageLike } from "@rasenjs/assets";

/**
 * A decoded PNG: dimensions plus tightly packed RGBA8 pixels.
 *
 * Extends the shared `ImageLike` (which only promises dimensions) with the
 * pixel buffer a native renderer needs to upload.
 */
export interface DecodedImage extends ImageLike {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/**
 * Perry's `fs.readFileSync` returns a Buffer that is byte-addressable but whose
 * `.length` reports 0. Always size it from `.byteLength`.
 */
export function readBytes(path: string): Uint8Array {
  return fs.readFileSync(path) as unknown as Uint8Array;
}

/** Decode a byte view as UTF-8 text. */
export function readText(path: string): string {
  const buf = readBytes(path);
  const n = buf.byteLength;
  let out = "";
  let i = 0;
  while (i < n) {
    const b = buf[i];
    if (b < 0x80) {
      out = out + String.fromCharCode(b);
      i = i + 1;
    } else if (b < 0xe0) {
      out = out + String.fromCharCode(((b & 0x1f) << 6) | (buf[i + 1] & 0x3f));
      i = i + 2;
    } else if (b < 0xf0) {
      out = out + String.fromCharCode(
        ((b & 0x0f) << 12) | ((buf[i + 1] & 0x3f) << 6) | (buf[i + 2] & 0x3f));
      i = i + 3;
    } else {
      const cp = ((b & 0x07) << 18) | ((buf[i + 1] & 0x3f) << 12)
        | ((buf[i + 2] & 0x3f) << 6) | (buf[i + 3] & 0x3f);
      out = out + String.fromCodePoint(cp);
      i = i + 4;
    }
  }
  return out;
}

/** Big-endian u32 at `offset`. */
function u32be(b: Uint8Array, offset: number): number {
  return ((b[offset] << 24) | (b[offset + 1] << 16) | (b[offset + 2] << 8)
    | b[offset + 3]) >>> 0;
}

/**
 * Paeth predictor, per the PNG spec.
 */
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
 * Supports what the Spine atlases in this repo use: 8-bit RGB or RGBA,
 * non-interlaced, zlib-compressed IDAT — the same subset the official Spine
 * exporters emit. Throws a descriptive error on anything else rather than
 * producing silently wrong pixels.
 *
 * @param bytes Raw file contents.
 * @returns Dimensions plus a `width * height * 4` RGBA buffer (row-major,
 *          top-left origin, straight alpha).
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

  // Collect the IDAT stream and stop at IEND.
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
    // "IEND"
    if (t0 === 73 && t1 === 69 && t2 === 78 && t3 === 68) break;
    // "IDAT"
    if (t0 === 73 && t1 === 68 && t2 === 65 && t3 === 84) {
      parts.push(bytes.subarray(off + 8, off + 8 + len));
      idatLen = idatLen + len;
    }
    off = off + 8 + len + 4;
  }
  if (idatLen === 0) throw new Error("decodePng: no IDAT chunks found");

  // NOTE: `parts[i].length` must be `byteLength` — Perry reports 0 for the
  // `length` of a typed array (same defect as `Buffer.length`), which would
  // leave `cursor` at 0 and overwrite the stream from the start.
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

  const raw = zlib.inflateSync(idat as any) as unknown as Uint8Array;

  // Unfilter one scanline at a time. `prev` holds the *already unfiltered*
  // previous row (the spec's reference bytes); `cur` is the row being rebuilt.
  // Repacking to RGBA happens afterwards so the filter math always works in
  // source channel units.
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
      else {
        throw new Error("decodePng: unknown filter " + filter + " on row " + y);
      }
      cur[x] = v & 255;
    }
    // Repack `cur` into the RGBA output row.
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

  return { width, height, rgba: out };
}

/** Decode a PNG straight from disk. */
export function loadPng(path: string): DecodedImage {
  return decodePng(readBytes(path));
}

/**
 * Install the native image adapter on the shared library.
 *
 * `@rasenjs/assets` routes `loadImage`/`loadImageBitmap` through whatever
 * adapter the host registers; on a browser that is the `dom` package, and here
 * it is `fs` + {@link loadPng}. The caller passes already-resolved paths
 * because a native build has no document base URL.
 *
 * @param resolve Maps an asset reference (e.g. `"c010_02.png"`) to a path.
 */
export function installImageAdapter(resolve: (url: string) => string): void {
  setImageAdapter({
    loadImage: (url: string): Promise<ImageLike> =>
      Promise.resolve(loadPng(resolve(url))),
    loadImageBitmap: (url: string): Promise<ImageLike> =>
      Promise.resolve(loadPng(resolve(url))),
  });
}
