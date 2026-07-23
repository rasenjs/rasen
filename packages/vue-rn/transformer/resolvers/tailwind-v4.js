/**
 * Tailwind CSS v4 Resolver
 *
 * Detects and compiles Tailwind v4 class names to React Native style objects.
 *
 * Detection: checks for @tailwindcss/postcss in the project's node_modules.
 *
 * Pipeline:
 *   1. Discovers the project's global CSS or generates a minimal one
 *   2. Runs PostCSS + @tailwindcss/postcss to expand all utility classes
 *   3. Parses output CSS into className → RN style Record map
 */
const { createRequire } = require('module')
const postcss = require('postcss')
const fs = require('fs')
const path = require('path')
const { parseCSS } = require('./css-parser')

const NAME = 'tailwind-v4'

function detect(opts = {}) {
  const root = opts.projectRoot || process.cwd()

  // Walk up directories looking for node_modules with our package
  // (handles monorepo hoisting)
  function findPackage(pkgName) {
    let dir = root
    while (dir !== path.dirname(dir)) {
      const p = path.join(dir, 'node_modules', ...pkgName.split('/'), 'package.json')
      if (fs.existsSync(p)) return p
      dir = path.dirname(dir)
    }
    return null
  }

  try {
    const p = findPackage('@tailwindcss/postcss')
    if (p) return true
  } catch (_) {}

  try {
    const p = findPackage('tailwindcss')
    if (p) {
      const { version } = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (parseInt(version.split('.')[0], 10) >= 4) return true
    }
  } catch (_) {}

  return false
}

/**
 * Find the project's global CSS entry file that imports Tailwind.
 * Searches common locations: src/global.css, app/global.css, global.css, etc.
 */
function findEntryCSS(projectRoot) {
  const candidates = [
    'src/global.css',
    'app/global.css',
    'global.css',
    'src/index.css',
    'app/index.css',
    'src/main.css',
    'app.css',
    'src/App.css',
  ]

  for (const rel of candidates) {
    const full = path.join(projectRoot, rel)
    if (fs.existsSync(full)) {
      const content = fs.readFileSync(full, 'utf8')
      if (content.includes('tailwindcss') || content.includes('tailwind')) {
        return { filePath: full, content }
      }
    }
  }

  // If no entry CSS found, generate a minimal one
  return null
}

async function init(options = {}) {
  const projectRoot = options.projectRoot || process.cwd()

  const entry = findEntryCSS(projectRoot)
  const classes = scanClasses(projectRoot)
  let css

  if (entry) {
    css = entry.content
  } else {
    css = `@import "tailwindcss";`
  }

  // Tell Tailwind which classes to generate via @source inline
  for (const cls of classes) {
    css += `\n@source inline("${cls}");`
  }

  if (options.extraCSS) {
    css += '\n' + options.extraCSS
  }

  let tailwindPlugin
  try {
    const projectRequire = createRequire(path.join(projectRoot, 'package.json'))
    tailwindPlugin = projectRequire('@tailwindcss/postcss')
  } catch (_) {
    const projectRequire = createRequire(path.join(projectRoot, 'package.json'))
    tailwindPlugin = projectRequire('tailwindcss')
  }

  let expandedCSS = ''
  try {
    const result = await postcss([tailwindPlugin()]).process(css, {
      from: entry?.filePath || path.join(projectRoot, 'virtual-tailwind.css'),
    })
    expandedCSS = result.css
  } catch (e) {
    console.warn(`[vue-rn] Tailwind v4 init: ${e.message}`)
  }

  const styleMap = parseCSS(expandedCSS)

  return { styleMap, dynamicInjection: expandedCSS }
}

/**
 * Scan project .vue files for className="..." patterns.
 * This tells Tailwind v4 which classes to generate.
 */
function scanClasses(projectRoot) {
  const classes = new Set()

  function walk(dir) {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
    catch (_) { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(full)
        }
      } else if (entry.name.endsWith('.vue') || entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx')) {
        try {
          const content = fs.readFileSync(full, 'utf8')
          const matches = content.matchAll(/className="([^"]+)"/g)
          for (const m of matches) {
            for (const cls of m[1].trim().split(/\s+/)) {
              if (cls) classes.add(cls)
            }
          }
        } catch (_) { /* skip unreadable */ }
      }
    }
  }

  walk(projectRoot)
  return [...classes]
}

module.exports = { name: NAME, detect, init }
