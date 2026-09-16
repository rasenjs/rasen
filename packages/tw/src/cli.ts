#!/usr/bin/env node
/**
 * `tw-generate` — AOT class-table generator for @rasenjs/tw.
 *
 * Scans source directories for class strings (`tw("...")`, `className="..."`,
 * `class="..."`, `class: "..."`) and emits a static full-string → record table
 * that makes `tw()` an O(1) lookup for every class string in your app.
 *
 * Usage:
 *   tw-generate --scan src --scan components --out src/tw.generated.ts
 *   tw-generate --scan src --out src/tw.generated.ts --extensions ts,tsx
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { emitGeneratedFile, generateTable, scanClassStrings } from './generator'

interface CliArgs {
  scan: string[]
  out: string
  extensions: string[]
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { scan: [], out: '', extensions: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--scan') {
      const v = argv[++i]
      if (v) args.scan.push(v)
    } else if (a === '--out') {
      args.out = argv[++i] ?? ''
    } else if (a === '--extensions') {
      const v = argv[++i]
      if (v) args.extensions = v.split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a === '--help' || a === '-h') {
      printHelp()
      process.exit(0)
    }
  }
  return args
}

function printHelp(): void {
  console.log(`tw-generate — AOT class-table generator for @rasenjs/tw

Usage:
  tw-generate --scan <dir> [--scan <dir> ...] --out <file> [--extensions ts,tsx]

Options:
  --scan <dir>       Directory to scan (repeatable). Defaults to ["src"].
  --out <file>       Output file for the generated table (required).
  --extensions <csv> File extensions to scan. Default: ts,tsx,js,jsx,html,vue,svelte,mdx
  --help             Show this help.`)
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (!args.out) {
    console.error('tw-generate: missing required --out <file>')
    printHelp()
    process.exit(1)
  }
  const dirs = args.scan.length > 0 ? args.scan : ['src']
  const scanned = scanClassStrings(dirs, args.extensions)
  const classStrings = scanned.flatMap((r) => r.classes)
  const table = generateTable(classStrings)
  const content = emitGeneratedFile(table, scanned.map((r) => r.file))

  mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, content, 'utf8')

  console.log(
    `tw-generate: scanned ${scanned.length} file(s), found ${classStrings.length} class string(s), ` +
      `emitted ${Object.keys(table).length} unique record(s) → ${args.out}`
  )
}

main()