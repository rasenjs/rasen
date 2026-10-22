import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? '/tmp/d2r-all'

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

const files = walk(root, []).slice(0, Number(process.argv[3] ?? 80))

for (const f of files) {
  const b = fs.readFileSync(f)
  const ver = b.readInt32LE(0)
  const W = b.readInt32LE(4) + 1
  const H = b.readInt32LE(8) + 1
  const cells = W * H
  const act = ver >= 8 ? b.readInt32LE(12) : 0
  const tagType = ver >= 10 ? b.readInt32LE(16) : 0
  const fileCountOff = ver >= 10 ? 20 : ver >= 8 ? 16 : 12
  const fileCount = ver >= 3 ? b.readInt32LE(fileCountOff) : 0
  const { strings, end } = readStrings(b, fileCountOff + 4)

  const fits = []
  for (let header = 8; header <= 80; header += 4) {
    const layerStart = end + header
    if (layerStart + 4 > b.length) continue
    for (let walls = 0; walls <= 4; walls++) {
      const floorOpts = ver >= 16 ? [0, 1, 2] : [1]
      for (const floors of floorOpts) {
        const tagOpts = tagType === 1 || tagType === 2 ? [0, 1] : [0]
        for (const tag of tagOpts) {
          const blocks = walls * 2 + floors + 1 + tag
          const objEnd = layerStart + blocks * cells * 4
          if (objEnd + 4 > b.length) continue
          const n = b.readInt32LE(objEnd)
          if (n < 0 || n > 2000) continue
          for (const rec of [16, 20]) {
            if (objEnd + 4 + n * rec === b.length) {
              fits.push(`hdr${header} w${walls} f${floors} t${tag} n${n} r${rec}`)
            }
          }
          // files that stop mid-block: object block starts past EOF
          if (objEnd === b.length) fits.push(`hdr${header} w${walls} f${floors} t${tag} EOF`)
        }
      }
    }
  }
  console.log(
    `v${ver} ${W}x${H} act${act} tag${tagType} files${fileCount}(found ${strings.length}) strEnd${end} size${b.length} :: ${fits.join(' | ') || 'NO FIT'}`,
  )
  console.log('   ', f.replace(root, ''))
}
