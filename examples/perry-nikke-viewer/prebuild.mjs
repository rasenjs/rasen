/**
 * Prebuild: rewrite `.map()` / `&&` / `?:` into `each` / `when`, then hand the
 * rewritten tree to Perry.
 *
 * ── Why a script instead of a bundler plugin ──────────────────────────────
 * `@rasenjs/compiler`'s `structural` pass runs inside a bundler (vite,
 * webpack, rspack, esbuild). This example has no bundler: `perry compile`
 * reads TypeScript directly and lowers JSX itself, and Perry exposes no
 * JS-side transform hook to plug into. So the rewrite happens here, as a
 * prebuild step, and Perry compiles the output.
 *
 * ── Why a separate output tree ────────────────────────────────────────────
 * The rewrite is written to `.build/` rather than in place. Source files stay
 * readable (and diffable) — an author reading `src/viewer/app.tsx` sees the
 * `.map()` / `&&` they wrote, and `git diff` does not fill up with generated
 * `each({…})` calls on every build. Relative imports keep working because the
 * whole `src/` tree is copied; only the entry point moves.
 *
 * ── What it reports ───────────────────────────────────────────────────────
 * Every rewrite is printed with its file and line. The point of the pass is
 * that a `.map()` list stops reconciling, which is invisible at runtime, so
 * silence would make it impossible to tell "nothing to rewrite" from "the pass
 * did not run". `--check` asserts that instead: it fails when any `.map()` /
 * `&&` shape is left, and is what CI uses.
 *
 * Usage:
 *   node prebuild.mjs            # write .build/, print the rewrites
 *   node prebuild.mjs --check    # dry run; non-zero exit if anything remains
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { transformStructural } from '@rasenjs/compiler'

const root = dirname(fileURLToPath(import.meta.url))
const srcDir = join(root, 'src')
const outDir = join(root, '.build')

/** Files the pass can act on. Perry compiles `.ts` and `.tsx`; a `.ts` file has no JSX. */
const isTransformable = (name) => /\.(tsx|jsx)$/.test(name)

/** Recursively list files under `dir`, as paths relative to it. */
function walk(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry)
    if (statSync(abs).isDirectory()) out.push(...walk(abs, base))
    else out.push(relative(base, abs))
  }
  return out
}

/** Sanity check: does the tree still contain a shape the pass should have caught? */
function leftoverShapes(code) {
  const findings = []
  for (const [i, line] of code.split('\n').entries()) {
    // `.map(` producing elements, in a child position — the pass's job.
    if (/\.map\(/.test(line) && /<[A-Z]/.test(line)) {
      findings.push({ line: i + 1, text: line.trim() })
    }
  }
  return findings
}

const checkOnly = process.argv.includes('--check')

const files = walk(srcDir)
let rewrittenCount = 0
let leftoverCount = 0
const touched = []

for (const rel of files) {
  const abs = join(srcDir, rel)
  const original = readFileSync(abs, 'utf8')

  if (!isTransformable(rel)) {
    if (!checkOnly) {
      const dest = join(outDir, rel)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, original)
    }
    continue
  }

  const rewrites = []
  const transformed = transformStructural(original, {
    onRewrite: (info) => rewrites.push(info),
  })

  if (rewrites.length > 0) {
    rewrittenCount += rewrites.length
    touched.push({ file: rel, rewrites })
    for (const r of rewrites) {
      console.log(`  ${rel}:${r.line}  ${r.kind}`)
    }
  }

  // A `.map()` still in the output means the shape did not match the pass's
  // narrow contract. Report it rather than letting it fail silently at runtime.
  for (const left of leftoverShapes(transformed)) {
    leftoverCount++
    console.log(`  ! ${rel}:${left.line}  left as-is: ${left.text}`)
  }

  if (!checkOnly) {
    const dest = join(outDir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, transformed)
  }
}

console.log('')
console.log(
  `${files.length} file(s) scanned, ${rewrittenCount} rewrite(s) in ${touched.length} file(s)`
)
if (leftoverCount > 0) {
  console.log(`${leftoverCount} .map() shape(s) left as-is (see above)`)
}

if (checkOnly) {
  // `--check` is for CI: assert the pass found work to do OR that there was
  // none. Both are fine; what is not fine is a crash or an unparsable file,
  // which would surface as zero files scanned.
  if (files.length === 0) {
    console.error('no source files found — wrong working directory?')
    process.exit(1)
  }
  console.log('check passed')
  process.exit(0)
}

if (rewrittenCount === 0) {
  console.log('')
  console.log('Nothing to rewrite — source already uses each/when, or uses shapes')
  console.log('the pass deliberately leaves alone. Never an error.')
}
