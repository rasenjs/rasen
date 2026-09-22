#!/usr/bin/env node
/* eslint-disable */

/**
 * Fetches the spine assets the benchmark pages load.
 *
 * The atlas PNGs are gitignored repo-wide (`*.png`, with a negation only for
 * `examples/.../public/**`), so a fresh clone has the `.skel`/`.atlas` metadata
 * but none of the images and every page renders an empty canvas. That looks
 * exactly like a rendering failure and costs a while to diagnose, so the assets
 * are fetched by command instead.
 *
 * Source: the NIKKE model dump the viewer uses
 * (`Nikke-db/Nikke-db.github.io`, `l2d/<char>/<char>_00.{skel,atlas,png}`).
 *
 * Usage:
 *   node fetch-assets.mjs              # c405 (the rig these tests use)
 *   node fetch-assets.mjs c310 c233    # any of the known characters
 *   node fetch-assets.mjs --list       # print the known set and exit
 *
 * Files land in `public/<char>/`, which is the layout the pages request once
 * `?skel=<char>/<char>_00` is set (see pickAsset in src/bench-api.ts).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(__dirname, 'public')

const REPO = 'https://raw.githubusercontent.com/Nikke-db/Nikke-db.github.io/main/l2d'

/**
 * Characters the harness knows about, and where each one's files go.
 *
 * `flat: true` means the files sit in `public/` directly (the pre-subdirectory
 * layout the spec defaults to); otherwise they go in `public/<char>/`.
 */
const KNOWN = {
  c310: { files: ['c310_00.skel', 'c310_00.atlas', 'c310_00.png'], flat: true },
  c233: { files: ['c233_00.skel', 'c233_00.atlas', 'c233_00.png', 'c233_00_2.png'], flat: false },
  c405: { files: ['c405_00.skel', 'c405_00.atlas', 'c405_00.png'], flat: false }
}

function target(char, file) {
  return KNOWN[char].flat
    ? path.join(PUBLIC, file)
    : path.join(PUBLIC, char, file)
}

async function fetchOne(char, file) {
  const dest = target(char, file)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const url = `${REPO}/${char}/${file}`
  const res = await fetch(url)
  if (!res.ok) {
    console.log(`  ${file}: HTTP ${res.status} — skipping`)
    return false
  }
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  console.log(`  ${file}: ${(buf.length / 1048576).toFixed(2)} MB → ${path.relative(process.cwd(), dest)}`)
  return true
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--list')) {
    for (const [c, v] of Object.entries(KNOWN)) {
      console.log(`${c}: ${v.files.join(', ')}${v.flat ? '  (into public/)' : `  (into public/${c}/)`}`)
    }
    return
  }
  const chars = args.filter((a) => !a.startsWith('--'))
  const wanted = chars.length ? chars : ['c405']

  for (const char of wanted) {
    if (!KNOWN[char]) {
      console.log(`\n${char}: unknown character (see --list for the known set) — skipping`)
      continue
    }
    console.log(`\n${char}`)
    for (const f of KNOWN[char].files) await fetchOne(char, f)
  }
  console.log(
    `\nDone. Pages address these as ?skel=<char>/<char>_00 (or the spec default).` +
      `\nThe .png files stay untracked by design — rerun this after a fresh clone.`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
