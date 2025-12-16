#!/usr/bin/env tsx
/**
 * Chrome DevTools Trace Analyzer
 * 
 * Usage:
 *   tsx scripts/analyze-trace.ts <trace-file.json>
 */

import fs from 'fs'
import path from 'path'

interface TraceEvent {
  name: string
  ph: string
  dur?: number
  args?: {
    data?: {
      functionName?: string
      url?: string
    }
  }
}

interface TraceFile {
  traceEvents: TraceEvent[]
}

interface FrameStats {
  total: number
  avgTime: number
  minTime: number
  maxTime: number
  under8ms: number
  between8and16ms: number
  over16ms: number
}

interface TaskStats {
  total: number
  totalTime: number
  avgTime: number
  slowCount: number
}

interface GCStats {
  total: number
  totalTime: number
  byType: Record<string, number>
}

function analyzeTrace(traceFile: string): void {
  if (!fs.existsSync(traceFile)) {
    console.error(`❌ File not found: ${traceFile}`)
    process.exit(1)
  }

  console.log(`\n📊 Analyzing: ${path.basename(traceFile)}\n`)

  const trace: TraceFile = JSON.parse(fs.readFileSync(traceFile, 'utf8'))

  // Analyze animation frames
  const frames = trace.traceEvents.filter(
    (e) => e.name === 'FireAnimationFrame' && e.ph === 'X'
  )

  const frameTimes = frames.map((f) => (f.dur || 0) / 1000)
  const frameStats: FrameStats = {
    total: frames.length,
    avgTime: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length,
    minTime: Math.min(...frameTimes),
    maxTime: Math.max(...frameTimes),
    under8ms: frameTimes.filter((t) => t < 8).length,
    between8and16ms: frameTimes.filter((t) => t >= 8 && t < 16).length,
    over16ms: frameTimes.filter((t) => t >= 16).length,
  }

  // Analyze RunTask
  const runTasks = trace.traceEvents.filter(
    (e) => e.name === 'RunTask' && e.ph === 'X'
  )
  const taskStats: TaskStats = {
    total: runTasks.length,
    totalTime: runTasks.reduce((s, e) => s + (e.dur || 0), 0) / 1000,
    avgTime: 0,
    slowCount: runTasks.filter((t) => (t.dur || 0) > 1000).length,
  }
  taskStats.avgTime = taskStats.totalTime / taskStats.total

  // Analyze GC
  const gcEvents = trace.traceEvents.filter(
    (e) => e.name.includes('GC') && e.ph === 'X' && (e.dur || 0) > 0
  )
  const gcStats: GCStats = {
    total: gcEvents.length,
    totalTime: gcEvents.reduce((s, e) => s + (e.dur || 0), 0) / 1000,
    byType: {},
  }

  gcEvents.forEach((e) => {
    const time = gcStats.byType[e.name] || 0
    gcStats.byType[e.name] = time + (e.dur || 0) / 1000
  })

  // Print results
  console.log('🎬 Animation Frames')
  console.log(`   Total: ${frameStats.total}`)
  console.log(`   Avg: ${frameStats.avgTime.toFixed(2)}ms`)
  console.log(`   Min: ${frameStats.minTime.toFixed(2)}ms`)
  console.log(`   Max: ${frameStats.maxTime.toFixed(2)}ms`)
  console.log(
    `   <8ms: ${frameStats.under8ms} (${((frameStats.under8ms / frameStats.total) * 100).toFixed(1)}%) ✨`
  )
  console.log(
    `   8-16ms: ${frameStats.between8and16ms} (${((frameStats.between8and16ms / frameStats.total) * 100).toFixed(1)}%) ✅`
  )
  console.log(
    `   >16ms: ${frameStats.over16ms} (${((frameStats.over16ms / frameStats.total) * 100).toFixed(1)}%) ⚠️`
  )

  console.log('\n⚙️  RunTask Events')
  console.log(`   Total: ${taskStats.total}`)
  console.log(`   Total Time: ${taskStats.totalTime.toFixed(2)}ms`)
  console.log(`   Avg Time: ${taskStats.avgTime.toFixed(3)}ms`)
  console.log(`   Slow (>1ms): ${taskStats.slowCount}`)
  console.log(
    `   Per Frame: ${(taskStats.totalTime / frameStats.total).toFixed(2)}ms`
  )

  console.log('\n🗑️  Garbage Collection')
  console.log(`   Total Events: ${gcStats.total}`)
  console.log(`   Total Time: ${gcStats.totalTime.toFixed(2)}ms`)
  console.log(
    `   Per Frame: ${(gcStats.totalTime / frameStats.total).toFixed(2)}ms`
  )

  const topGCTypes = Object.entries(gcStats.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  console.log('\n   Top GC Types:')
  topGCTypes.forEach(([name, time]) => {
    console.log(`     ${name}: ${time.toFixed(2)}ms`)
  })

  // Find expensive functions
  const functionCalls = trace.traceEvents.filter(
    (e) =>
      e.name === 'FunctionCall' && e.ph === 'X' && e.args?.data?.functionName
  )

  const funcStats = new Map<
    string,
    { count: number; totalTime: number; maxTime: number }
  >()

  functionCalls.forEach((call) => {
    const name = call.args?.data?.functionName || 'anonymous'
    const url = call.args?.data?.url || ''
    const fileName = url.split('/').pop() || 'unknown'
    const key = `${name}@${fileName}`

    const stats = funcStats.get(key) || { count: 0, totalTime: 0, maxTime: 0 }
    stats.count++
    stats.totalTime += (call.dur || 0) / 1000
    stats.maxTime = Math.max(stats.maxTime, (call.dur || 0) / 1000)
    funcStats.set(key, stats)
  })

  console.log('\n🔥 Top 10 Functions by Total Time')
  const topFuncs = [...funcStats.entries()]
    .sort((a, b) => b[1].totalTime - a[1].totalTime)
    .slice(0, 10)

  topFuncs.forEach(([name, stats], i) => {
    console.log(
      `   ${i + 1}. ${name}\n      Total: ${stats.totalTime.toFixed(2)}ms, Count: ${stats.count}, Avg: ${(stats.totalTime / stats.count).toFixed(3)}ms`
    )
  })

  // Performance score
  console.log('\n📈 Performance Score')
  const smoothFrames = (frameStats.under8ms + frameStats.between8and16ms) / frameStats.total
  const score = Math.round(smoothFrames * 100)
  const emoji = score >= 95 ? '🏆' : score >= 90 ? '✨' : score >= 80 ? '👍' : '⚠️'
  console.log(`   ${emoji} ${score}/100 (${(smoothFrames * 100).toFixed(1)}% frames <16ms)`)

  console.log('')
}

// Main
const traceFile = process.argv[2]
if (!traceFile) {
  console.error('Usage: tsx scripts/analyze-trace.ts <trace-file.json>')
  process.exit(1)
}

analyzeTrace(traceFile)
