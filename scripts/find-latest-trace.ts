#!/usr/bin/env tsx
/**
 * Find the latest Chrome DevTools trace file
 * 
 * Usage:
 *   tsx scripts/find-latest-trace.ts [directory]
 */

import fs from 'fs'
import path from 'path'

function findLatestTrace(dir: string = '.'): void {
  const traceFiles: Array<{ path: string; mtime: Date }> = []

  function searchDir(currentDir: string): void {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            searchDir(fullPath)
          }
        } else if (entry.isFile() && /^Trace-\d{8}T\d{6}\.json$/.test(entry.name)) {
          const stats = fs.statSync(fullPath)
          traceFiles.push({ path: fullPath, mtime: stats.mtime })
        }
      }
    } catch (err) {
      // Ignore permission errors
    }
  }

  console.log(`\n🔍 Searching for trace files in: ${path.resolve(dir)}\n`)
  searchDir(dir)

  if (traceFiles.length === 0) {
    console.log('❌ No trace files found')
    process.exit(1)
  }

  // Sort by modification time (newest first)
  traceFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  console.log(`📊 Found ${traceFiles.length} trace file(s):\n`)

  // Show top 10
  traceFiles.slice(0, 10).forEach((file, i) => {
    const relPath = path.relative(process.cwd(), file.path)
    const size = (fs.statSync(file.path).size / 1024 / 1024).toFixed(2)
    const time = file.mtime.toLocaleString()
    console.log(`${i === 0 ? '✨' : '  '} ${i + 1}. ${relPath}`)
    console.log(`     ${size} MB - ${time}`)
  })

  console.log(`\n🎯 Latest: ${path.relative(process.cwd(), traceFiles[0].path)}\n`)
}

// Main
const dir = process.argv[2] || '.'
findLatestTrace(dir)
