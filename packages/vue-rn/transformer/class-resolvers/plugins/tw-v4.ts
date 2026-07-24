import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { createRequire } from 'module'
import { cssToMap } from '../parse'
import type { ClassResolver } from '../index'

const NAME = 'tailwind-v4'

function findPackage(root: string, pkgName: string): string | null {
  let dir = root
  while (dir !== dirname(dir)) {
    const p = join(dir, 'node_modules', ...pkgName.split('/'), 'package.json')
    if (existsSync(p)) return p
    dir = dirname(dir)
  }
  return null
}

function detect(): boolean {
  const root = process.cwd()
  try { if (findPackage(root, '@tailwindcss/postcss')) return true } catch { /* not found */ }
  try {
    const p = findPackage(root, 'tailwindcss')
    if (p) {
      const { version } = JSON.parse(readFileSync(p, 'utf8'))
      if (parseInt(version.split('.')[0], 10) >= 4) return true
    }
  } catch { /* version check failed */ }
  return false
}

async function resolve(): Promise<{ styleMap: Map<string, Record<string, unknown>>; cssOutput: string }> {
  const root = process.cwd()
  const entry = findEntryCSS(root)
  const classes = scanClasses(root)
  let css: string
  if (entry) css = entry.content
  else css = `@import "tailwindcss";`
  for (const cls of classes) css += `\n@source inline("${cls}");`

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const postcss = require('postcss')
  const tw = (() => {
    try { return createRequire(join(root, 'package.json'))('@tailwindcss/postcss') }
    catch { return require('tailwindcss') }
  })() as (...args: unknown[]) => unknown

  let out = ''
  try {
    const r = await postcss([tw()]).process(css, { from: entry?.filePath || join(root, 'virtual.css') })
    out = r.css
  } catch { console.warn('[tw-v4] CSS generation failed') }

  return { styleMap: cssToMap(out), cssOutput: out }
}

function findEntryCSS(root: string): { filePath: string; content: string } | null {
  for (const rel of ['src/global.css', 'app/global.css', 'global.css', 'src/index.css', 'app/index.css', 'src/main.css', 'app.css']) {
    const f = join(root, rel)
    if (existsSync(f)) {
      const c = readFileSync(f, 'utf8')
      if (c.includes('tailwind')) return { filePath: f, content: c }
    }
  }
  return null
}

function scanClasses(root: string): string[] {
  const s = new Set<string>()
  function walk(dir: string) {
    let e: import('fs').Dirent[]
    try { e = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const x of e) {
      const p = join(dir, x.name)
      if (x.isDirectory()) { if (!x.name.startsWith('.') && x.name !== 'node_modules') walk(p) }
      else if (x.name.endsWith('.vue') || x.name.endsWith('.tsx') || x.name.endsWith('.jsx')) {
        try { for (const m of readFileSync(p, 'utf8').matchAll(/class="([^"]+)"/g)) { for (const c of m[1].trim().split(/\s+/)) if (c) s.add(c) } } catch { /* skip unreadable */ }
      }
    }
  }
  walk(root)
  return [...s]
}

const resolver: ClassResolver = { name: NAME, detect, resolve }
export default resolver
