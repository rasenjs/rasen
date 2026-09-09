/* eslint-disable */
/**
 * Compare two spine benchmark reports (baseline vs new), WebGL group focus.
 * Usage: node compare-reports.mjs <baseline.json> <new.json>
 */

import fs from 'node:fs'

const [baselinePath, newPath] = process.argv.slice(2)
const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
const neu = JSON.parse(fs.readFileSync(newPath, 'utf8'))

function median(a) {
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function animAgg(t, count) {
  const entry = t?.anim?.[String(count)]
  if (!entry) return { avgFrameMs: null, p95FrameMs: null, avgFps: null, jankPct: null }
  const runs = entry.runs ?? []
  const vals = runs.map((r) => r.avgFrameMs).filter((v) => typeof v === 'number')
  return {
    avgFrameMs: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null,
    p95FrameMs: entry.p95FrameMs ?? null,
    avgFps: entry.avgFps ?? null,
    jankPct: entry.jankPct ?? null
  }
}

const keys = Object.keys(neu.targets).filter((k) => k.startsWith('WebGL'))
console.log(`baseline: ${baselinePath} (${base.meta.date})`)
console.log(`new     : ${newPath} (${neu.meta.date})`)
console.log(`instances: baseline [${base.meta.instanceCounts}] new [${neu.meta.instanceCounts}]`)
console.log('')

for (const key of keys) {
  const b = base.targets[key]
  const n = neu.targets[key]
  if (!b || !n) continue
  console.log(`== ${key}`)
  // pose (per instance count, median of ticks)
  for (const count of Object.keys(n.pose ?? {})) {
    const bp = b.pose?.[count] ? median(b.pose[count]) : null
    const np = median(n.pose[count])
    const d = bp ? ((np - bp) / bp) * 100 : null
    console.log(
      `  pose ${count}: ${bp?.toFixed(2) ?? 'n/a'} → ${np.toFixed(2)} ms${d !== null ? ` (${d > 0 ? '+' : ''}${d.toFixed(1)}%)` : ''}`
    )
  }
  // create
  for (const count of Object.keys(n.create ?? {})) {
    const bc = b.create?.[count] ? median(b.create[count]) : null
    const nc = median(n.create[count])
    const d = bc ? ((nc - bc) / bc) * 100 : null
    console.log(
      `  create ${count}: ${bc?.toFixed(1) ?? 'n/a'} → ${nc.toFixed(1)} ms${d !== null ? ` (${d > 0 ? '+' : ''}${d.toFixed(1)}%)` : ''}`
    )
  }
  // anim (aggregate across runs) — per instance count
  for (const count of Object.keys(n.anim ?? {})) {
    const ba = animAgg(b, count)
    const na = animAgg(n, count)
    const fmt = (a) =>
      a.avgFrameMs == null ? 'n/a' : `${a.avgFrameMs.toFixed(2)}ms p95 ${a.p95FrameMs?.toFixed(1)} ${a.avgFps?.toFixed(1)}fps jank ${a.jankPct?.toFixed(0)}%`
    console.log(`  anim ${count}: ${fmt(ba)} → ${fmt(na)}`)
  }

  const fmt = (a) =>
    a.avgFrameMs == null ? 'n/a' : `${a.avgFrameMs.toFixed(2)}ms p95 ${a.p95FrameMs?.toFixed(1)} ${a.avgFps?.toFixed(1)}fps jank ${a.jankPct}%`
  console.log('')
}
