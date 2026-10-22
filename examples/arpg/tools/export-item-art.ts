/**
 * Decodes every DC6 in the game's `global/items` into a PNG.
 *
 * The inventory artwork is the one class of sprite the game still ships in its
 * classic 2D form: characters and monsters became 3D models in Resurrected, but
 * items are still DC6, so these decode straight to pixels through the shared
 * 256-entry palette.
 *
 * Usage:
 *   tsx examples/arpg/tools/export-item-art.ts [<extracted romfs dir>] [<out dir>]
 *
 * Reads only, and the output lives beside the other extracted art, which is
 * git-ignored: the game's assets are not redistributable and this script is the
 * reproducible way to rebuild them from a copy the user owns.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseDc6, frameToRgba } from '../src/d2/dc6'
import { parsePalette } from '../src/d2/tileart'
import { encodePng } from '../src/original/png'

const source = resolve(process.argv[2] ?? '/tmp/d2r-all')
const outDir = resolve(process.argv[3] ?? join(import.meta.dirname, '../public/original/itemart'))

interface ManifestEntry {
  code: string
  file: string
  width: number
  height: number
}

async function main(): Promise<void> {
  const palettePath = join(source, 'global/palette/act1/pal.dat')
  const palette = parsePalette(new Uint8Array(readFileSync(palettePath)))
  const itemDir = join(source, 'global/items')
  mkdirSync(outDir, { recursive: true })

  const files = readdirSync(itemDir).filter((file) => file.toLowerCase().endsWith('.dc6'))
  const items: ManifestEntry[] = []
  const failures: Array<{ file: string; reason: string }> = []

  for (const file of files) {
    try {
      const dc6 = parseDc6(new Uint8Array(readFileSync(join(itemDir, file))))
      // Frame 0 of direction 0 is the artwork the inventory cell shows; the
      // remaining frames are drop animations, which the world draws instead.
      const frame = dc6.frames[0]?.[0]
      if (!frame || frame.width === 0 || frame.height === 0) continue
      const rgba = frameToRgba(frame, palette)
      const code = basename(file, '.dc6')
      const out = `${code}.png`
      writeFileSync(join(outDir, out), await encodePng(rgba, frame.width, frame.height))
      items.push({ code, file: out, width: frame.width, height: frame.height })
    } catch (error) {
      failures.push({ file, reason: String(error) })
    }
  }

  items.sort((a, b) => a.code.localeCompare(b.code))
  writeFileSync(join(outDir, 'index.json'), `${JSON.stringify({ items }, null, 1)}\n`)

  const wide = items.reduce((max, item) => Math.max(max, item.width), 0)
  const tall = items.reduce((max, item) => Math.max(max, item.height), 0)
  console.log(`item art: ${items.length}/${files.length} written to ${outDir}`)
  console.log(`item art: largest cell ${wide}x${tall}`)
  if (failures.length > 0) {
    console.warn(`item art: ${failures.length} failed`)
    for (const failure of failures.slice(0, 10)) {
      console.warn(`  ${failure.file}: ${failure.reason}`)
    }
  }
}

void main()
