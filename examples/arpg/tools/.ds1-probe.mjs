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

const files = walk(root, [])

function parseStrings(b, start) {
  const strings = []
  let i = start
  while (i < b.length && strings.length < 16) {
    let j = i
    while (j < b.length && b[j] !== 0) j++
    const s = b.toString('latin1', i, j)
    if (!/^[A-Za-z\\]/.test(s) || s.length < 4) break
    strings.push(s)
    i = j + 1
  }
  return { strings, end: i }
}

const nIntsByVer = new Map()
const extraCounts = new Map()
const int3Counts = new Map()
let mismatch = 0
const mismatchSamples = []
const samples = new Map()

for (const f of files) {
  const b = fs.readFileSync(f)
  const ver = b.readInt32LE(0)

  let strStart = -1
  for (let k = 12; k < 4096 && k < b.length - 8; k++) {
    let ok = true
    for (let n = 0; n < 6; n++) {
      const c = b[k + n]
      if (c < 0x20 || c > 0x7e) { ok = false; break }
    }
    if (ok && k % 4 === 0) { strStart = k; break }
  }
  if (strStart < 0) { console.log('NO STRING TABLE', f); continue }

  const nInts = strStart / 4
  nIntsByVer.set(ver + '|' + nInts, (nIntsByVer.get(ver + '|' + nInts) ?? 0) + 1)

  const extra = []
  for (let k = 3; k < nInts; k++) extra.push(b.readInt32LE(k * 4))
  const r = parseStrings(b, strStart)

  const ek = ver + '  extra=' + JSON.stringify(extra)
  extraCounts.set(ek, (extraCounts.get(ek) ?? 0) + 1)
  if (!samples.has(ek)) samples.set(ek, { f, strings: r.strings.length, strEnd: r.end, size: b.length })

  int3Counts.set(ver + '|' + extra[0] + '|' + (extra[1] ?? '-'), (int3Counts.get(ver + '|' + extra[0] + '|' + (extra[1] ?? '-')) ?? 0) + 1)

  const last = extra[extra.length - 1]
  if (last !== r.strings.length) {
    mismatch++
    if (mismatchSamples.length < 10) mismatchSamples.push([f.replace(root, ''), extra, r.strings.length])
  }
}

console.log('=== ver|nHeaderInts -> count ===')
for (const [k, v] of [...nIntsByVer].sort()) console.log(' ', k, '->', v)
console.log('=== ver extra=[...] -> count (top 40) ===')
for (const [k, v] of [...extraCounts].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  const s = samples.get(k)
  console.log(' ', v, k, ' #strs=' + s.strings, 'size=' + s.size, s.f.replace(root, ''))
}
console.log('=== last-extra-int != #strings mismatches:', mismatch)
console.log(JSON.stringify(mismatchSamples, null, 1))
console.log('=== ver|int3|int4 -> count ===')
for (const [k, v] of [...int3Counts].sort()) console.log(' ', k, '->', v)
