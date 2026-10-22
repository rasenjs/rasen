import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? '/tmp/d2r-all'
const limit = Number(process.argv[3] ?? 60)

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.toLowerCase().endsWith('.ds1')) out.push(p)
  }
  return out
}

function readStrings(b, start) {
  const strings = []
  let i = start
  while (i < b.length && strings.length < 64) {
    let j = i
    while (j < b.length && b[j] !== 0) j++
    const s = b.toString('latin1', i, j)
    if (!/^[A-Za-z\\]/.test(s) || s.length < 4) break
    strings.push(s)
    i = j + 1
  }
  return { strings, end: i }
}

// A wall layer followed by its orientation stream is a very strong signature:
// every non-empty wall cell has prop1 & 1 and a non-zero orientation <= 25, and
// the orientation stream is non-zero on *exactly* the occupied wall cells.
function wallSignature(b, start, cells) {
  if (start + 2 * cells * 4 > b.length) return -1
  let occupied = 0
  let propOk = true
  for (let i = 0; i < cells; i++) {
    const v = b.readUInt32LE(start + i * 4)
    if (v === 0) continue
    if ((v & 0xff) === 0 || (v & 1) === 0) { propOk = false; break }
    occupied++
  }
  if (!propOk || occupied === 0) return -1
  let orientNonZero = 0
  let orientMax = 0
  for (let i = 0; i < cells; i++) {
    const v = b.readUInt32LE(start + (cells + i) * 4)
    if (v === 0) continue
    orientNonZero++
    orientMax = Math.max(orientMax, v)
  }
  if (orientNonZero !== occupied || orientMax > 25) return -1
  return occupied
}

const files = walk(root, []).slice(0, limit)

for (const f of files) {
  const b = fs.readFileSync(f)
  const ver = b.readInt32LE(0)
  const W = b.readInt32LE(4) + 1
  const H = b.readInt32LE(8) + 1
  const cells = W * H
  const tagType = ver >= 10 ? b.readInt32LE(16) : 0
  const fileCountOff = ver >= 10 ? 20 : ver >= 8 ? 16 : 12
  const fileCount = ver >= 3 ? b.readInt32LE(fileCountOff) : 0
  const { strings, end } = readStrings(b, fileCountOff + 4)

  const hits = []
  for (let s = end; s <= end + 96; s++) {
    const occ = wallSignature(b, s, cells)
    if (occ > 0) hits.push(`+${s - end}(occ${occ})`)
  }

  // Header dwords between the string table and the layer start.
  const dwords = []
  if (hits.length) {
    const delta = Number(hits[0].match(/^\+(\d+)/)[1])
    for (let k = 0; k * 4 < delta; k++) dwords.push(b.readInt32LE(end + k * 4))
  }

  console.log(
    `v${ver} ${W}x${H} tag${tagType} files${fileCount} strEnd${end} size${b.length} :: ${hits.join(',') || 'NO WALL SIGNATURE'}`,
  )
  if (dwords.length) console.log(`    post-string dwords: [${dwords.join(', ')}]`)
  console.log('   ', f.replace(root, ''))
}
