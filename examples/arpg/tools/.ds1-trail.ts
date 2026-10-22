import fs from 'node:fs'
import path from 'node:path'
import { parseDs1 } from '../src/original/ds1'

const root = process.argv[2] ?? '/tmp/d2r-all'

function walk(dir: string, out: string[]): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.toLowerCase().endsWith('.ds1')) out.push(p)
  }
  return out
}

const files = walk(root, [])
const trailValues = new Map<number, Map<number, number>>()

for (const f of files) {
  const bytes = new Uint8Array(fs.readFileSync(f))
  const map = parseDs1(bytes)
  if (map.trailingBytes === 4) {
    const v = new DataView(bytes.buffer, bytes.byteOffset + map.bytesRead, 4).getInt32(0, true)
    const per = trailValues.get(map.version) ?? new Map<number, number>()
    per.set(v, (per.get(v) ?? 0) + 1)
    trailValues.set(map.version, per)
  }
}
console.log('=== 4-byte trailing dword values, by version ===')
for (const [v, per] of [...trailValues].sort((a, b) => a[0] - b[0])) {
  console.log(` v${v}:`, [...per].map(([val, c]) => `${val}x${c}`).join(' '))
}

for (const target of ['outdoors/swamp2.ds1', 'colossalsummit.ds1']) {
  const f = files.find((p) => p.endsWith(target))
  if (!f) continue
  const bytes = new Uint8Array(fs.readFileSync(f))
  const map = parseDs1(bytes)
  console.log(`\n=== ${f.replace(root, '')} version=${map.version} ${map.width}x${map.height} act=${map.act} tagType=${map.tagType}`)
  console.log(
    ` walls=${map.walls.length} floors=${map.floors.length} shadow=${map.shadow ? 'yes' : 'no'} tag=${map.tag ? 'yes' : 'no'} objects=${map.objects.length} groups=${map.groups.length} paths=${map.paths.length}`,
  )
  console.log(` bytesRead=${map.bytesRead} size=${bytes.length} trailing=${map.trailingBytes}`)
  const tail = bytes.subarray(map.bytesRead)
  console.log(
    ` trailing dwords: ${[...Array(Math.min(16, Math.floor(tail.length / 4)))]
      .map((_, i) => new DataView(tail.buffer, tail.byteOffset + i * 4, 4).getInt32(0, true))
      .join(' ')}`,
  )
  // Re-read the block headers immediately before bytesRead to check the group/path counts.
  console.log(
    ` last 3 dwords before bytesRead: ${[-3, -2, -1]
      .map((k) => new DataView(bytes.buffer, bytes.byteOffset + map.bytesRead + k * 4, 4).getInt32(0, true))
      .join(' ')}`,
  )
}
