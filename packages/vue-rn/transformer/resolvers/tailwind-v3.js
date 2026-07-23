/**
 * Tailwind CSS v3 Resolver
 *
 * Uses Tailwind v3's own PostCSS plugin + JIT engine to expand class names.
 * Tailwind v3's official JS API IS the PostCSS plugin — this resolver
 * delegates to it and only handles CSS→RN style conversion.
 *
 * Detection: tailwindcss < 4 installed in project +/or tailwind.config.*.
 *
 * Pipeline:
 *   1. Scans .vue files for class="..." to seed JIT mode
 *   2. Runs PostCSS + tailwindcss plugin with JIT
 *   3. Parses output CSS → className → RN style map
 */
const { createRequire } = require('module')
const postcss = require('postcss')
const fs = require('fs')
const path = require('path')
const { parseCSS } = require('./css-parser')

const NAME = 'tailwind-v3'

// Walk up directories looking for a package.json (handles monorepo hoisting)
function findPackage(root, pkgName) {
  let dir = root
  while (dir !== path.dirname(dir)) {
    const p = path.join(dir, 'node_modules', ...pkgName.split('/'), 'package.json')
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
    dir = path.dirname(dir)
  }
  return null
}

function detect(opts = {}) {
  const root = opts.projectRoot || process.cwd()

  // Check for tailwind.config.* in project — strongest signal for v3
  for (const name of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs']) {
    if (fs.existsSync(path.join(root, name))) return true
  }

  const pkg = findPackage(root, 'tailwindcss')
  if (pkg && parseInt(pkg.version.split('.')[0], 10) < 4) return true

  return false
}

async function init(options = {}) {
  const projectRoot = options.projectRoot || process.cwd()

  // Confirm tailwind v3 is installed (handles monorepo hoisting)
  const v3Pkg = findPackage(projectRoot, 'tailwindcss')
  if (!v3Pkg || parseInt(v3Pkg.version.split('.')[0], 10) >= 4) {
    return { styleMap: new Map(), dynamicInjection: '' }
  }

  // Find tailwind config for custom theme
  let tailwindConfig
  const configPath = findConfig(projectRoot)
  if (configPath) {
    try {
      delete require.cache[configPath]
      // Use createRequire to load project's config from proper context
      const cfgRequire = createRequire(path.join(projectRoot, 'package.json'))
      tailwindConfig = cfgRequire(configPath)
    } catch (_) {}
  }

  // Scan .vue files for classes to seed JIT
  const classes = scanClasses(projectRoot)

  // Generate purge/safelist config for JIT
  // Tell JIT which classes to generate via content paths OR safelist
  const jitConfig = Object.assign({}, tailwindConfig || {})
  jitConfig.content = jitConfig.content || []
  jitConfig.safelist = (jitConfig.safelist || []).concat(classes)

  const css = `@tailwind base;\n@tailwind components;\n@tailwind utilities;`

  // Require tailwindcss from the project's node_modules
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'))
  let tailwindPlugin
  try { tailwindPlugin = projectRequire('tailwindcss') }
  catch (_) { tailwindPlugin = require('tailwindcss') }

  let expandedCSS = ''
  try {
    const result = await postcss([tailwindPlugin(jitConfig)]).process(css, {
      from: path.join(projectRoot, 'tailwind.scss'),
    })
    expandedCSS = result.css
  } catch (e) {
    console.warn(`[vue-rn] Tailwind v3 init: ${e.message}`)
  }

  const styleMap = parseCSS(expandedCSS)
  return { styleMap, dynamicInjection: expandedCSS }
}

function scanClasses(projectRoot) {
  const classes = new Set()
  function walk(dir) {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (_) { return }
    for (const e of entries) {
      const f = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist') walk(f)
      } else if (e.name.endsWith('.vue') || e.name.endsWith('.tsx') || e.name.endsWith('.jsx')) {
        try {
          for (const m of fs.readFileSync(f, 'utf8').matchAll(/class="([^"]+)"/g)) {
            for (const cls of m[1].trim().split(/\s+/)) if (cls) classes.add(cls)
          }
        } catch (_) {}
      }
    }
  }
  walk(projectRoot)
  return [...classes]
}

function findConfig(root) {
  for (const name of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs']) {
    const full = path.join(root, name)
    if (fs.existsSync(full)) return full
  }
  return null
}

module.exports = { name: NAME, detect, init }
