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

const files = walk(root, []).slice(0, limit)
const byVersion = new Map()

for (const f of files) {
  const b = fs.readFileSync(f)
  const ver = b.readInt32LE(0)
  const W = b.readInt32LE(4) + 1
  const H = b.readInt32LE(8) + 1
  const cells = W * H
  const tagType = ver >= 10 ? b.readInt32LE(16) : 0
  const fileCountOff = ver >= 10 ? 20 : ver >= 8 ? 16 : 12
  const { end } = readStrings(b, fileCountOff + 4)

  // Anchor the object block from the end of the file: count, then count records.
  const anchors = []
  for (const rec of [16, 20]) {
    for (let n = 0; n <= 300; n++) {
      const objStart = b.length - 4 - n * rec
      if (objStart < end) break
      if (b.readInt32LE(objStart) !== n) continue
      let ok = true
      for (let k = 0; k < n; k++) {
        const o = objStart + 4 + k * rec
        const type = b.readInt32LE(o)
        const id = b.readInt32LE(o + 4)
        const x = b.readInt32LE(o + 8)
        const y = b.readInt32LE(o + 12)
        if (type < 1 || type > 4 || id < 0 || id > 100000) { ok = false; break }
        if (x < 0 || x > 5 * W || y < 0 || y > 5 * H) { ok = false; break }
      }
      if (ok) anchors.push({ rec, n, objStart })
    }
  }

  console.log(`v${ver} ${W}x${H} tag${tagType} strEnd${end} size${b.length} :: ${anchors.map((a) => `n${a.n}/${a.rec}@${a.objStart}`).join(' ') || 'none'}`)
  console.log('   ', f.replace(root, ''))
  for (const a of anchors) {
    const used = a.objStart - end
    const layerBytes = cells * 4
    const blocks = Math.floor(used / layerBytes)
    const headerBytes = used - blocks * layerBytes
    const dwords = []
    for (let k = 0; k * 4 < 64; k++) dwords.push(b.readInt32LE(end + k * 4))
    if (blocks >= 1 && blocks <= 8 && headerBytes >= 0 && headerBytes <= 64) {
      byVersion.set(ver, [...(byVersion.get(ver) ?? []), `${headerBytes}/${blocks}`])
      console.log(
        `      headerBytes=${headerBytes} blocks=${blocks} dwords=[${dwords.slice(0, 12).join(',')}]`,
      )
    }
  }
}

console.log('--- headerBytes by version ---')
for (const [v, arr] of [...byVersion].sort((a, b) => a[0] - b[0])) {
  const uniq = new Map()
  for (const x of arr) uniq.set(x, (uniq.get(x) ?? 0) + 1)
  console.log(' v' + v, [...uniq].map(([k, c]) => `${k}(${c})`).join(' '))
}
