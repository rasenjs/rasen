import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { emitGeneratedFile, extractClassStrings, generateTable, scanClassStrings } from './generator'

describe('extractClassStrings()', () => {
  it('extracts tw() calls', () => {
    const src = `const a = tw('flex flex-col')
const b = tw("gap-2")
const c = tw(\`p-4\`)`
    expect(extractClassStrings(src)).toEqual(['flex flex-col', 'gap-2', 'p-4'])
  })

  it('extracts className / class attributes', () => {
    const src = `<div className="flex items-center">x</div>
<span class='text-sm'>y</span>
const o = { class: "rounded-lg" }`
    expect(extractClassStrings(src)).toEqual(['flex items-center', 'text-sm', 'rounded-lg'])
  })

  it('ignores empty strings', () => {
    expect(extractClassStrings(`tw("")`)).toEqual([])
  })
})

describe('generateTable()', () => {
  it('resolves each unique class string to a record', () => {
    const table = generateTable(['flex flex-col', 'flex flex-col', 'bg-red-500'])
    expect(Object.keys(table)).toEqual(['flex flex-col', 'bg-red-500'])
    expect(table['flex flex-col']).toEqual({ display: 'flex', flexDirection: 'column' })
    expect(table['bg-red-500']).toEqual({ backgroundColor: '#ef4444' })
  })

  it('drops strings that resolve to an empty record', () => {
    const table = generateTable(['...', 'not-a-real-class', 'flex'])
    expect(Object.keys(table)).toEqual(['flex'])
  })
})

describe('emitGeneratedFile()', () => {
  it('emits a valid module with TABLE and tw', () => {
    const table = generateTable(['flex flex-col', 'bg-[#505050]'])
    const out = emitGeneratedFile(table, ['src/app.ts'])
    expect(out).toContain("import { createTw, type TwStyle } from '@rasenjs/tw'")
    expect(out).toContain('"flex flex-col": { display: "flex", flexDirection: "column" }')
    expect(out).toContain('"bg-[#505050]": { backgroundColor: "#505050" }')
    expect(out).toContain('export const tw = createTw(TABLE)')
  })
})

describe('scanClassStrings()', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
    dirs.length = 0
  })

  it('walks directories and collects class strings from matching files', () => {
    const root = mkdtempSync(join(tmpdir(), 'tw-scan-'))
    dirs.push(root)
    mkdirSync(join(root, 'nested'))
    writeFileSync(join(root, 'a.ts'), `const x = tw('flex flex-col')`)
    writeFileSync(join(root, 'nested', 'b.tsx'), `<div className="gap-2" />`)
    writeFileSync(join(root, 'ignore.txt'), `tw('p-4')`)
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'node_modules', 'c.ts'), `tw('m-8')`)

    const results = scanClassStrings([root])
    const all = results.flatMap((r) => r.classes).sort()
    expect(all).toEqual(['flex flex-col', 'gap-2'])
  })

  it('uses default extensions when passed an empty array', () => {
    const root = mkdtempSync(join(tmpdir(), 'tw-scan-'))
    dirs.push(root)
    writeFileSync(join(root, 'a.ts'), `tw('flex')`)
    expect(scanClassStrings([root], []).flatMap((r) => r.classes)).toEqual(['flex'])
  })
})