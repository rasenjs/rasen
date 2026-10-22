/**
 * Renders a contact sheet of one animation file, for eyeballing a decode.
 *
 * Usage:
 *   tsx examples/arpg/tools/preview-sheet.ts <file relative to the romfs> [frames] [out.png]
 *
 * Reads an extracted copy of the game, which the repository does not carry; the
 * output is a throwaway image, not an asset.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { frameToRgba, parseDc6, type Dc6Frame } from '../src/d2/dc6'
import { parsePalette } from '../src/d2/tileart'
import { encodePng } from '../src/original/png'

const source = resolve(process.env.RASEN_ROMFS ?? '/tmp/d2r-all')
const relative = process.argv[2]
if (!relative) throw new Error('usage: preview-sheet.ts <file> [frames] [out.png]')
const want = Number(process.argv[3] ?? 8)
const out = resolve(process.argv[4] ?? '/tmp/preview-sheet.png')

async function main(): Promise<void> {
  const palette = parsePalette(new Uint8Array(readFileSync(join(source, 'global/palette/act1/pal.dat'))))
  const dc6 = parseDc6(new Uint8Array(readFileSync(join(source, relative))))
  const frames: Dc6Frame[] = dc6.frames[0].slice(0, want).filter((f) => f.width > 0 && f.height > 0)
  if (frames.length === 0) throw new Error('no drawable frames in direction 0')

  const width = frames.reduce((sum, f) => sum + f.width, 0)
  const height = frames.reduce((max, f) => Math.max(max, f.height), 0)
  const sheet = new Uint8Array(width * height * 4)
  let offsetX = 0
  for (const frame of frames) {
    const rgba = frameToRgba(frame, palette)
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        const from = (y * frame.width + x) * 4
        const to = (y * width + offsetX + x) * 4
        sheet.set(rgba.subarray(from, from + 4), to)
      }
    }
    offsetX += frame.width
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, await encodePng(sheet, width, height))
  console.log(`${relative}: ${dc6.directions} directions x ${dc6.framesPerDirection} frames, sheet ${width}x${height} -> ${out}`)
}

void main()
