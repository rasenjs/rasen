/**
 * Type-check the code examples that live in Markdown.
 *
 * Every fenced ```ts / ```tsx block that contains an `import` is extracted into
 * `.doccheck/` and compiled with the repository's own types, so a stale example
 * (a prop that no longer exists, a renamed import) fails here instead of
 * misleading a reader.
 *
 * Blocks are grouped into one TypeScript program per (reactivity adapter ×
 * jsxImportSource): each adapter augments core's `Ref` placeholder with its own
 * ref type, so mixing two adapters in one program produces impossible types —
 * the same rule as an application, which may only use one adapter.
 *
 * Usage:  node scripts/check-doc-examples.mjs [--verbose]
 */
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '.doccheck')
const LANGS = new Set(['ts', 'tsx', 'typescript', 'javascript', 'js', 'jsx'])

/**
 * Names the user-facing docs must not use.
 *
 * Two kinds: APIs that were renamed (`MountFunction`, `RNMountFunction`,
 * `@rasenjs/jsx`), and implementation detail that is exported but not part of
 * the surface an application or host author writes against — binding helpers,
 * template primitives, host hooks, marker constants, compiler internals, native
 * command helpers. Design notes under `docs/` are for contributors and may use
 * them freely; a line can opt out with a `docs-internal` comment.
 */
const DENY = [
  'MountFunction',
  'RNMountFunction',
  '@rasenjs/jsx',
  'bindText',
  'bindClassToggle',
  'bindClass(',
  'bindProp',
  'bindAttr',
  'bindStyle',
  'bindKey',
  'mountSlot',
  'collectHtml',
  'hostHooks',
  'isHydrating',
  'getHydrationContext',
  'configureEventDelegation',
  'watchProp',
  'watchObjectProps',
  'rafSchedule',
  'INTRINSIC_TAGS',
  'MARKERS',
  'REF_MARKER',
  'MARKER_DEBUG_MAP',
  'isMarkerMatch',
  'dispatchCommand',
  'sendAccessibilityEvent',
  'findNodeHandle',
  'resetTagCounter',
  'FABRIC_NODE',
  'compileModule',
  'transformModule',
  'transformStructural',
  'transformProgram',
  'injectHmr',
  'usesCom',
  'hasHmrWrapping',
  'enterHmrModule',
  'exitHmrModule',
  'stringifyStyleInline',
  'getAttrName',
  'camelToKebab',
  'isEventProp',
  'getEventName',
  'domImageAdapter',
  'parseFragment'
]
const verbose = process.argv.includes('--verbose')

function walk(p, out = []) {
  const st = statSync(p)
  if (st.isFile()) {
    if (p.endsWith('.md') && !/node_modules|dist|\.doccheck/.test(p)) out.push(p)
    return out
  }
  for (const e of readdirSync(p)) {
    if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue
    // package pages come from READMEs; skip other package markdown (design notes)
    if (p.endsWith('/packages') && !e.startsWith('README')) continue
    walk(join(p, e), out)
  }
  return out
}

const files = ['www', 'docs', 'packages'].flatMap((d) => walk(join(ROOT, d)))
files.push(join(ROOT, 'README.md'))

/**
 * Which reactivity adapters a block imports, as a sorted set.
 *
 * The set (not "the first one found") is the grouping key: each adapter
 * augments core's `Ref` placeholder with its own ref type, so a block that
 * shows two adapters side by side must not share a program with blocks that use
 * one — the augmentations would merge into an impossible type and every ref in
 * the group would "fail".
 */
function adaptersOf(src) {
  const found = new Set()
  if (/@rasenjs\/reactive-vue|@vue\/reactivity|from 'vue'/.test(src)) found.add('vue')
  if (/@rasenjs\/reactive-signals|signal-polyfill/.test(src)) found.add('signals')
  if (/@rasenjs\/reactive-alien-signals|alien-signals/.test(src)) found.add('alien')
  if (/@rasenjs\/reactive-nanostores|nanostores/.test(src)) found.add('nano')
  if (/@rasenjs\/core/.test(src) && found.size === 0) found.add('core')
  return found.size ? [...found].sort().join('+') : 'none'
}

function jsxSourceOf(src) {
  if (/@rasenjs\/react-native/.test(src)) return '@rasenjs/react-native'
  if (/@rasenjs\/web/.test(src)) return '@rasenjs/web'
  if (/@rasenjs\/html/.test(src) && !/@rasenjs\/dom/.test(src)) return '@rasenjs/html'
  return '@rasenjs/dom'
}

// ---- internal/renamed API in user-facing prose -------------------------------
const userFacing = files.filter((f) => /\/(www|packages)\//.test(f) || f.endsWith('/README.md'))
const leaks = []
for (const file of userFacing) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (line.includes('docs-internal')) return
    for (const name of DENY) {
      if (line.includes(name)) leaks.push(`${relative(ROOT, file)}:${i + 1}  ${name}`)
    }
  })
}

const groups = new Map()
let blocks = 0
let skipped = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const re = /^(````?)([A-Za-z]*)([^\n]*)\n([\s\S]*?)^\1$/gm
  let m
  while ((m = re.exec(src))) {
    const [, , lang, info, body] = m
    if (!LANGS.has(lang)) continue
    if (/\bignore\b/.test(info)) { skipped++; continue }
    // `@planned` marks a sketch of an API that is not shipped yet — it is
    // documentation of a design, not an example users can run.
    if (/@planned/i.test(body)) { skipped++; continue }
    if (!/^\s*import\s/m.test(body)) { skipped++; continue }
    const line = src.slice(0, m.index).split('\n').length + 1
    blocks++
    const adapter = adaptersOf(body)
    const jsx = jsxSourceOf(body)
    const key = `${adapter}__${jsx.replace(/[@/]/g, '-')}`
    if (!groups.has(key)) groups.set(key, { adapter, jsx, items: [] })
    groups.get(key).items.push({
      file: relative(ROOT, file),
      line,
      // A block that closes a JSX tag is JSX regardless of the fence label;
      // a bare `<T>` is a type parameter, not an element.
      ext: lang === 'tsx' || lang === 'jsx' || /<\/|<>|\/>/.test(body) ? '.tsx' : '.ts',
      body
    })
  }
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const index = []
for (const [key, group] of groups) {
  const dir = join(OUT, key)
  mkdirSync(dir, { recursive: true })
  group.items.forEach((item, i) => {
    const name = `${String(i).padStart(3, '0')}${item.ext}`
    writeFileSync(
      join(dir, name),
      `// DOC ${item.file}:${item.line}\n` + item.body.replace(/\s*$/, '\n')
    )
    index.push({ group: key, name, file: item.file, line: item.line })
  })
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: '../../tsconfig.json',
        compilerOptions: {
          noEmit: true,
          jsx: 'react-jsx',
          jsxImportSource: group.jsx,
          types: [],
          skipLibCheck: true,
          noUnusedLocals: false,
          noUnusedParameters: false,
          allowJs: true,
          checkJs: false
        },
        include: ['*.ts', '*.tsx']
      },
      null,
      2
    )
  )
}

if (leaks.length) {
  console.log(`### internal / renamed API in user-facing docs — ${leaks.length}`)
  for (const l of leaks) console.log('  ' + l)
  console.log('  (a deliberate mention can opt out with a `docs-internal` comment on the line)\n')
}

console.log(`extracted ${blocks} example blocks into ${groups.size} programs (${skipped} skipped: fragments/opt-outs)\n`)

let failures = 0
for (const key of groups.keys()) {
  const dir = join(OUT, key)
  let out = ''
  try {
    out = execFileSync(join(ROOT, 'node_modules/.bin/tsc'), ['-p', join(dir, 'tsconfig.json')], {
      cwd: ROOT,
      encoding: 'utf8'
    })
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '')
  }
  if (!out.trim()) continue
  const all = out
    .split('\n')
    .filter((l) => /error TS/.test(l))
    .map((l) => l.trim())
  // Parse errors (TS1xxx) mean the block is not a compilable unit — usually a
  // deliberate fragment. They are reported last, collapsed per file.
  const parseErr = all.filter((l) => /error TS1\d\d\d/.test(l))
  // Fragment-shaped diagnostics: an example that only shows one piece of a
  // program legitimately references names and modules defined elsewhere
  // ("Cannot find name", "Cannot find module", implicit any). Everything else
  // is an API-shape error — a renamed export, a prop that does not exist, an
  // argument of the wrong type — and fails the check.
  const FRAGMENT_CODES = /error TS(2304|2307|7006|7005|6133|6192|6196|18046|2578|7026|2875)/
  // A missing *framework* module is not a fragment: it is a path typo in the
  // docs (`@rasenjs/react-native/utils/style` never existed). Missing
  // illustrative modules (./UserCard, 'three', 'solid-js') stay informational.
  const isFrameworkModuleMiss = (l) => /error TS2307/.test(l) && /'@rasenjs\//.test(l)
  const info = all.filter(
    (l) =>
      (!FRAGMENT_CODES.test(l) || isFrameworkModuleMiss(l) === false) &&
      (/error TS1\d\d\d/.test(l) || FRAGMENT_CODES.test(l))
  ).filter((l) => !isFrameworkModuleMiss(l))
  const errors = all.filter((l) => isFrameworkModuleMiss(l) || (!FRAGMENT_CODES.test(l) && !/error TS1\d\d\d/.test(l)))
  if (errors.length === 0 && info.length === 0) continue
  failures += errors.length
  console.log(`### ${key} — ${errors.length} API error(s), ${info.length} fragment/parse line(s)`)
  for (const e of errors) {
    const m = /^([^(]+)\((\d+),(\d+)\): (error TS\d+: .*)$/.exec(e)
    const meta = m && index.find((i) => i.group === key && i.name === m[1].split('/').pop())
    if (meta && m) {
      const blockLine = Number(m[2]) - 2 // header line is 1, so first body line is 3
      console.log(`  ${meta.file}:${meta.line + blockLine - 1} col ${m[3]}  ${m[4]}`)
    } else {
      console.log(`  ${e}`)
    }
  }
  if (verbose && info.length) {
    const byFile = new Map()
    for (const e of info) {
      const m = /^([^(]+)\(/.exec(e)
      const name = m ? m[1].split('/').pop() : e
      byFile.set(name, (byFile.get(name) || 0) + 1)
    }
    for (const [name, n] of byFile) {
      const meta = index.find((i) => i.group === key && i.name === name)
      console.log(`  [fragment] ${meta ? `${meta.file}:${meta.line}` : name} — ${n} parse error line(s)`)
    }
  }
  console.log()
}

if (failures === 0 && leaks.length === 0) {
  rmSync(OUT, { recursive: true, force: true })
  console.log('all extracted examples type-check')
  process.exit(0)
}
if (failures) console.log(`${failures} error(s) across the extracted examples (see .doccheck for the sources)`)
if (leaks.length) console.log(`${leaks.length} internal-API mention(s) in user-facing docs`)
process.exit(1)
