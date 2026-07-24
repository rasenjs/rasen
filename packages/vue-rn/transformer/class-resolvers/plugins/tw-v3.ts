import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { createRequire } from 'module'
import { cssToMap } from '../parse'
import type { ClassResolver } from '../index'

const NAME = 'tailwind-v3'

function findPackage(root: string, pkgName: string): Record<string, unknown> | null {
  let dir = root
  while (dir !== dirname(dir)) {
    const p = join(dir, 'node_modules', ...pkgName.split('/'), 'package.json')
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
    dir = dirname(dir)
  }
  return null
}

function detect(): boolean {
  const root = process.cwd()
  for (const name of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs']) {
    if (existsSync(join(root, name))) return true
  }
  const pkg = findPackage(root, 'tailwindcss')
  if (pkg && parseInt((pkg.version as string).split('.')[0], 10) < 4) return true
  return false
}

async function resolve(): Promise<{ styleMap: Map<string, Record<string, unknown>>; cssOutput: string }> {
  const root = process.cwd()
  const classes = scanClasses(root)
  const projectRequire = createRequire(join(root, 'package.json'))
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const postcss = require('postcss')

  let config: Record<string, unknown> = {}
  for (const name of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs']) {
    const f = join(root, name)
    if (existsSync(f)) {
      delete require.cache[f]
      try { config = projectRequire(f) } catch { /* config parse error */ }
    }
  }

  const jitConfig = { ...config, content: (config.content as string[]) || [], safelist: ((config.safelist as string[]) || []).concat(classes) }
  const tw = (() => {
    try { return projectRequire('tailwindcss') }
    catch { return require('tailwindcss') }
  })() as (...args: unknown[]) => unknown

  let out = ''
  try {
    const r = await postcss([tw(jitConfig)]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;', { from: join(root, 'tw.scss') })
    out = r.css
  } catch { console.warn('[tw-v3] CSS generation failed') }

  return { styleMap: cssToMap(out), cssOutput: out }
}

function scanClasses(root: string): string[] {
  const s = new Set<string>()
  function walk(dir: string) {
    let e: import('fs').Dirent[]
    try { e = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const x of e) {
      const p = join(dir, x.name)
      if (x.isDirectory()) { if (!x.name.startsWith('.') && x.name !== 'node_modules' && x.name !== 'dist') walk(p) }
      else if (x.name.endsWith('.vue') || x.name.endsWith('.tsx') || x.name.endsWith('.jsx')) {
        try { for (const m of readFileSync(p, 'utf8').matchAll(/class="([^"]+)"/g)) { for (const c of m[1].trim().split(/\s+/)) if (c) s.add(c) } } catch { /* skip unreadable files */ }
      }
    }
  }
  walk(root)
  return [...s]
}

const resolver: ClassResolver = { name: NAME, detect, resolve }
export default resolver
