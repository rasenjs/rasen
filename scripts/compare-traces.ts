#!/usr/bin/env tsx
/**
 * Compare two Chrome DevTools trace files
 * 
 * Usage:
 *   tsx scripts/compare-traces.ts <baseline.json> <optimized.json>
 */

import fs from 'fs'
import path from 'path'

interface TraceEvent {
  name: string
  ph: string
  dur?: number
}

interface TraceFile {
  traceEvents: TraceEvent[]
}

interface Stats {
  frames: {
    total: number
    avgTime: number
    over16ms: number
  }
  runTask: {
    total: number
    totalTime: number
  }
  gc: {
    total: number
    totalTime: number
  }
}

function getStats(trace: TraceFile): Stats {
  const frames = trace.traceEvents.filter(
    (e) => e.name === 'FireAnimationFrame' && e.ph === 'X'
  )
  const frameTimes = frames.map((f) => (f.dur || 0) / 1000)

  const runTasks = trace.traceEvents.filter(
    (e) => e.name === 'RunTask' && e.ph === 'X'
  )
  const runTaskTime = runTasks.reduce((s, e) => s + (e.dur || 0), 0) / 1000

  const gcEvents = trace.traceEvents.filter(
    (e) => e.name.includes('GC') && e.ph === 'X' && (e.dur || 0) > 0
  )
  const gcTime = gcEvents.reduce((s, e) => s + (e.dur || 0), 0) / 1000

  return {
    frames: {
      total: frames.length,
      avgTime: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length,
      over16ms: frameTimes.filter((t) => t >= 16).length,
    },
    runTask: {
      total: runTasks.length,
      totalTime: runTaskTime,
    },
    gc: {
      total: gcEvents.length,
      totalTime: gcTime,
    },
  }
}

function formatChange(before: number, after: number, unit: string = '', lowerIsBetter: boolean = true): string {
  const diff = after - before
  const percent = ((diff / before) * 100)
  const sign = diff > 0 ? '+' : ''
  const color = lowerIsBetter 
    ? (diff < 0 ? '✅' : '❌')
    : (diff > 0 ? '✅' : '❌')
  
  return `${sign}${diff.toFixed(2)}${unit} (${sign}${percent.toFixed(1)}%) ${color}`
}

function compareTraces(baselineFile: string, optimizedFile: string): void {
  if (!fs.existsSync(baselineFile)) {
    console.error(`❌ Baseline file not found: ${baselineFile}`)
    process.exit(1)
  }
  if (!fs.existsSync(optimizedFile)) {
    console.error(`❌ Optimized file not found: ${optimizedFile}`)
    process.exit(1)
  }

  console.log('\n📊 Trace Comparison\n')
  console.log(`Baseline:  ${path.basename(baselineFile)}`)
  console.log(`Optimized: ${path.basename(optimizedFile)}\n`)

  const baseline: TraceFile = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
  const optimized: TraceFile = JSON.parse(fs.readFileSync(optimizedFile, 'utf8'))

  const baselineStats = getStats(baseline)
  const optimizedStats = getStats(optimized)

  console.log('🎬 Animation Frames')
  console.log(`   Avg Frame Time:`)
  console.log(`     Before: ${baselineStats.frames.avgTime.toFixed(2)}ms`)
  console.log(`     After:  ${optimizedStats.frames.avgTime.toFixed(2)}ms`)
  console.log(`     Change: ${formatChange(baselineStats.frames.avgTime, optimizedStats.frames.avgTime, 'ms')}`)
  
  console.log(`   Dropped Frames (>16ms):`)
  console.log(`     Before: ${baselineStats.frames.over16ms}`)
  console.log(`     After:  ${optimizedStats.frames.over16ms}`)
  console.log(`     Change: ${formatChange(baselineStats.frames.over16ms, optimizedStats.frames.over16ms, '')}`)

  console.log('\n⚙️  RunTask Events')
  console.log(`   Total Count:`)
  console.log(`     Before: ${baselineStats.runTask.total}`)
  console.log(`     After:  ${optimizedStats.runTask.total}`)
  console.log(`     Change: ${formatChange(baselineStats.runTask.total, optimizedStats.runTask.total, '')}`)
  
  console.log(`   Total Time:`)
  console.log(`     Before: ${baselineStats.runTask.totalTime.toFixed(2)}ms`)
  console.log(`     After:  ${optimizedStats.runTask.totalTime.toFixed(2)}ms`)
  console.log(`     Change: ${formatChange(baselineStats.runTask.totalTime, optimizedStats.runTask.totalTime, 'ms')}`)

  console.log('\n🗑️  Garbage Collection')
  console.log(`   Total Events:`)
  console.log(`     Before: ${baselineStats.gc.total}`)
  console.log(`     After:  ${optimizedStats.gc.total}`)
  console.log(`     Change: ${formatChange(baselineStats.gc.total, optimizedStats.gc.total, '')}`)
  
  console.log(`   Total Time:`)
  console.log(`     Before: ${baselineStats.gc.totalTime.toFixed(2)}ms`)
  console.log(`     After:  ${optimizedStats.gc.totalTime.toFixed(2)}ms`)
  console.log(`     Change: ${formatChange(baselineStats.gc.totalTime, optimizedStats.gc.totalTime, 'ms')}`)

  // Overall verdict
  const frameTimeImprovement = ((baselineStats.frames.avgTime - optimizedStats.frames.avgTime) / baselineStats.frames.avgTime) * 100
  console.log('\n📈 Overall Assessment')
  if (frameTimeImprovement > 10) {
    console.log(`   🎉 Great! ${frameTimeImprovement.toFixed(1)}% faster frame time`)
  } else if (frameTimeImprovement > 5) {
    console.log(`   👍 Good! ${frameTimeImprovement.toFixed(1)}% faster frame time`)
  } else if (frameTimeImprovement > 0) {
    console.log(`   ✓ Slight improvement: ${frameTimeImprovement.toFixed(1)}% faster`)
  } else if (frameTimeImprovement > -5) {
    console.log(`   ⚠️  Minimal regression: ${Math.abs(frameTimeImprovement).toFixed(1)}% slower`)
  } else {
    console.log(`   ❌ Regression: ${Math.abs(frameTimeImprovement).toFixed(1)}% slower`)
  }

  console.log('')
}

// Main
const baselineFile = process.argv[2]
const optimizedFile = process.argv[3]

if (!baselineFile || !optimizedFile) {
  console.error('Usage: tsx scripts/compare-traces.ts <baseline.json> <optimized.json>')
  process.exit(1)
}

compareTraces(baselineFile, optimizedFile)
