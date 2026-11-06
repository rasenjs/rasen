/**
 * copy-gr2-samples — stage GR2 sample files for the 3D model lab page.
 *
 * The lab (`src/gr2-lab.tsx`) fetches original game data at runtime from
 * `public/original/models/<in-package path>`, the same layout
 * `tools/extract-original.ts models` writes for real users. The checked-out
 * samples in `.scratch/gr2` are a flat research dump instead, so this script
 * mirrors them into that layout:
 *
 * - Each `*.model` is written under the character package directory derived
 *   from the texture paths its own GR2 texture records name (the mode of
 *   `data/…/<character>/textures`), preserving the sample's `models/`
 *   subdirectory when it has one.
 * - Each referenced `*.texture` is written at the EXACT in-package path the
 *   model records (`FromFileName`), matched to a dump file by
 *   case-insensitive basename. Referenced textures with no dump file are
 *   reported as missing — the lab falls back to flat gray for those and
 *   lists their names on screen.
 *
 * Usage:
 *   ../../node_modules/.bin/tsx tools/copy-gr2-samples.ts [--src dir] [--out dir]
 *
 *   --src  sample dump directory (default <repo>/.scratch/gr2)
 *   --out  staging directory (default examples/arpg/public/original/models)
 *
 * No game data is downloaded; the output directory is git-ignored.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadGr2 } from '@rasenjs/assets'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ARPG_DIR = resolve(SCRIPT_DIR, '..')
const REPO_DIR = resolve(ARPG_DIR, '..', '..')

interface CliOptions {
  src: string
  out: string
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    src: join(REPO_DIR, '.scratch', 'gr2'),
    out: join(ARPG_DIR, 'public', 'original', 'models'),
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--src') options.src = resolve(process.cwd(), argv[++i] ?? '')
    else if (arg === '--out') options.out = resolve(process.cwd(), argv[++i] ?? '')
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        [
          'copy-gr2-samples — stage .scratch/gr2 samples under their in-package paths',
          '',
          '  copy-gr2-samples.ts [--src dir] [--out dir]',
          '',
          '  --src  sample dump directory (default <repo>/.scratch/gr2)',
          '  --out  staging directory (default examples/arpg/public/original/models)',
          '',
        ].join('\n'),
      )
      process.exit(0)
    } else {
      process.stderr.write(`copy-gr2-samples: unknown argument ${arg}\n`)
      process.exit(2)
    }
  }
  return options
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

/** The most common parent directory of the texture package paths. */
function characterDir(texturePaths: string[]): string | null {
  const counts = new Map<string, number>()
  for (const path of texturePaths) {
    const dir = dirname(path)
    counts.set(dir, (counts.get(dir) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [dir, count] of counts) {
    if (count > bestCount) {
      best = dir
      bestCount = count
    }
  }
  // `data/…/<character>/textures` → `data/…/<character>`.
  return best !== null && basename(best) === 'textures' ? dirname(best) : best
}

interface ModelPlan {
  srcPath: string
  destPath: string
  texturePaths: string[]
}

function main(): void {
  const options = parseCli(process.argv.slice(2))
  if (!existsSync(options.src)) {
    process.stderr.write(`copy-gr2-samples: sample directory not found: ${options.src}\n`)
    process.exit(1)
  }

  const files = walk(options.src)
  const modelFiles = files.filter((path) => path.endsWith('.model')).sort()
  const textureFiles = files.filter((path) => path.endsWith('.texture')).sort()
  const textureByBase = new Map<string, string>()
  for (const path of textureFiles) textureByBase.set(basename(path).toLowerCase(), path)

  const plans: ModelPlan[] = []
  const referenced = new Set<string>()
  for (const srcPath of modelFiles) {
    const gr2 = loadGr2(new Uint8Array(readFileSync(srcPath)))
    const texturePaths = gr2.textures.map((texture) => texture.fromFileName).filter((path) => path !== '')
    for (const path of texturePaths) referenced.add(path)

    const charDir = characterDir(texturePaths)
    const sampleRel = relative(options.src, srcPath).split('\\').join('/')
    const tail = sampleRel.includes('models/') ? sampleRel.slice(sampleRel.indexOf('models/')) : basename(sampleRel)
    const destPath = charDir !== null ? `${charDir}/${tail}` : `data/models/${basename(sampleRel)}`
    plans.push({ srcPath, destPath, texturePaths })
  }

  let modelsCopied = 0
  let texturesCopied = 0
  const missing: string[] = []
  const staged = new Set<string>()

  for (const plan of plans) {
    const dest = join(options.out, plan.destPath)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(plan.srcPath, dest)
    modelsCopied += 1
    process.stdout.write(`model    ${plan.destPath}\n`)
  }

  for (const texturePath of [...referenced].sort()) {
    const src = textureByBase.get(basename(texturePath).toLowerCase())
    if (!src) {
      missing.push(texturePath)
      continue
    }
    if (staged.has(texturePath.toLowerCase())) continue
    staged.add(texturePath.toLowerCase())
    const dest = join(options.out, texturePath)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    texturesCopied += 1
    process.stdout.write(`texture  ${texturePath}\n`)
  }

  process.stdout.write(
    `\n${modelsCopied} models and ${texturesCopied} textures staged under ${options.out}\n`,
  )
  if (missing.length > 0) {
    process.stdout.write(`${missing.length} referenced textures not in the dump (gray fallback in the lab):\n`)
    for (const path of missing) process.stdout.write(`  missing ${path}\n`)
  }
  const unused = textureFiles.filter((path) => {
    const base = basename(path).toLowerCase()
    return ![...referenced].some((ref) => basename(ref).toLowerCase() === base)
  })
  for (const path of unused) process.stdout.write(`  unreferenced by any staged model: ${path}\n`)
}

main()
