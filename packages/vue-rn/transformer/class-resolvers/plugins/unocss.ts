import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import { cssToMap } from '../parse'
import type { ClassResolver } from '../index'

const NAME = 'unocss'

function detect(): boolean {
  const root = process.cwd()
  const nm = join(root, 'node_modules')
  try {
    if (existsSync(join(nm, '@unocss', 'core', 'package.json')) && existsSync(join(nm, '@unocss', 'preset-uno', 'package.json'))) return true
  } catch { /* not found */ }
  for (const name of ['uno.config.js', 'uno.config.ts', 'unocss.config.js', 'unocss.config.ts']) {
    if (existsSync(join(root, name))) return true
  }
  return false
}

async function resolve(): Promise<{ styleMap: Map<string, Record<string, unknown>>; cssOutput: string }> {
  const root = process.cwd()
  const sm = new Map<string, Record<string, unknown>>()
  let out = ''
  try {
    const projectRequire = createRequire(join(root, 'package.json'))
    const { createGenerator } = projectRequire('@unocss/core')
    const pre = projectRequire('@unocss/preset-uno').default
    let userConfig: Record<string, unknown> = {}
    for (const name of ['uno.config.js', 'uno.config.ts', 'unocss.config.js', 'unocss.config.ts']) {
      const f = join(root, name)
      if (existsSync(f)) { try { userConfig = projectRequire(f) } catch { /* config not found */ } }
    }
    const config = { ...userConfig, presets: [...((userConfig.presets as unknown[]) || []), pre()] }
    const uno = await createGenerator(config)

    const classes = scanClasses(root).join(' ')
    if (classes) {
      const r = await uno.generate(classes, { preflights: false })
      out = r.css
      for (const [k, v] of cssToMap(out)) sm.set(k, v)
    }

    const safelist = (userConfig.safelist as string[]) || []
    if (safelist.length > 0) {
      const r = await uno.generate(safelist.join(' '), { preflights: false })
      out += '\n' + r.css
      for (const [k, v] of cssToMap(r.css)) sm.set(k, v)
    }
  } catch { console.warn('[unocss] CSS generation failed') }
  return { styleMap: sm, cssOutput: out }
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
        try { for (const m of readFileSync(p, 'utf8').matchAll(/class="([^"]+)"/g)) { for (const c of m[1].trim().split(/\s+/)) if (c) s.add(c) } } catch { /* skip unreadable */ }
      }
    }
  }
  walk(root)
  return [...s]
}

const resolver: ClassResolver = { name: NAME, detect, resolve }
export default resolver
