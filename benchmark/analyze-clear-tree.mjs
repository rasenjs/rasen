import fs from 'fs'

// Collect the FULL ancestor closure of teardown markers (removeChild /
// removeEventListener) — every frame that participates in the clear call
// tree — then attribute samples falling inside that frame set.
const profile = JSON.parse(fs.readFileSync('/tmp/clear-cpu.json', 'utf8'))
const nodes = new Map(profile.nodes.map(n => [n.id, n]))
const parentOf = new Map()
for (const n of profile.nodes) {
  for (const c of (n.children || [])) parentOf.set(c, n.id)
}

const MARKERS = ['removeChild', 'removeEventListener']
const teardownFrames = new Set()
for (const n of profile.nodes) {
  const fn = n.callFrame.functionName || ''
  if (!MARKERS.includes(fn)) continue
  let cur = n.id
  while (cur != null) {
    teardownFrames.add(cur)
    cur = parentOf.get(cur)
  }
}

const selfHits = new Map()
let total = 0
for (const nodeId of profile.samples) {
  if (!teardownFrames.has(nodeId)) continue
  total++
  const n = nodes.get(nodeId)
  const cf = n.callFrame
  const key = (cf.functionName || '(anon)') + ' @' + (cf.url ? cf.url.split('/').pop().slice(-24) : 'native')
  selfHits.set(key, (selfHits.get(key) || 0) + 1)
}
console.log('teardown-tree samples:', total, '(of', profile.samples.length, 'total)')
;[...selfHits.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).forEach(([k,v]) => {
  console.log(((v/total)*100).toFixed(1).padStart(5) + '%  ' + v.toString().padStart(6) + '  ' + k)
})
