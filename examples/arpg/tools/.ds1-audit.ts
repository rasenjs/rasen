import fs from 'node:fs'
import path from 'node:path'
import { parseDs1 } from '@rasenjs/assets'

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
const byVersion = new Map<string, { n: number; exact: number; trails: Map<number, number>; trunc: number }>()
let exact = 0
const problems: string[] = []

for (const f of files) {
  const bytes = new Uint8Array(fs.readFileSync(f))
  let map
  try {
    map = parseDs1(bytes)
  } catch (error) {
    problems.push(`${f.replace(root, '')} THREW ${(error as Error).message}`)
    continue
  }
  const key = `v${map.version} w${map.walls.length} f${map.floors.length} tag${map.tagType}`
  const entry = byVersion.get(key) ?? { n: 0, exact: 0, trails: new Map(), trunc: 0 }
  entry.n++
  if (map.trailingBytes === 0) {
    entry.exact++
    exact++
  }
  entry.trails.set(map.trailingBytes, (entry.trails.get(map.trailingBytes) ?? 0) + 1)
  if (map.truncated) entry.trunc += 1
  byVersion.set(key, entry)
  if (map.trailingBytes > 8) {
    problems.push(
      `${f.replace(root, '')} v${map.version} ${map.width}x${map.height} trailing=${map.trailingBytes} read=${map.bytesRead} size=${bytes.length}`,
    )
  }
}

console.log(`files=${files.length} exact=${exact} (${((exact / files.length) * 100).toFixed(1)}%)`)
console.log('=== version/shape -> files, exact-to-EOF, trailing byte histogram ===')
for (const [k, v] of [...byVersion].sort()) {
  const histogram = [...v.trails].sort((a, b) => a[0] - b[0]).map(([t, c]) => `${t}x${c}`).join(' ')
  console.log(` ${k.padEnd(28)} n=${String(v.n).padStart(4)} exact=${String(v.exact).padStart(4)} trunc=${v.trunc} trailing: ${histogram}`)
}
console.log(`=== problems (${problems.length}) ===`)
for (const p of problems.slice(0, 40)) console.log(' ', p)
