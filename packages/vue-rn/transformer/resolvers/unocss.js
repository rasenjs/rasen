/**
 * UnoCSS Resolver
 *
 * Uses @unocss/core's own createGenerator + generate() API.
 * This IS UnoCSS's official JS API — it parses class names and
 * outputs CSS declarations, which we then convert to RN styles.
 *
 * Detection: @unocss/core + @unocss/preset-uno installed.
 *
 * Pipeline:
 *   1. Scan .vue files for class="..." to feed to generator
 *   2. UnoCSS createGenerator() + generate(classes) → CSS
 *   3. Parse CSS → className → RN style map
 */
const { createRequire } = require('module')
const fs = require('fs')
const path = require('path')
const { parseCSS } = require('./css-parser')

const NAME = 'unocss'

function detect(opts = {}) {
  const root = opts.projectRoot || process.cwd()
  const nm = path.join(root, 'node_modules')

  try {
    if (fs.existsSync(path.join(nm, '@unocss', 'core', 'package.json')) &&
        fs.existsSync(path.join(nm, '@unocss', 'preset-uno', 'package.json'))) {
      return true
    }
  } catch (_) {}

  // Also check for uno.config.*
  for (const name of ['uno.config.js', 'uno.config.ts', 'unocss.config.js', 'unocss.config.ts']) {
    if (fs.existsSync(path.join(root, name))) return true
  }
  return false
}

async function init(options = {}) {
  const projectRoot = options.projectRoot || process.cwd()
  const styleMap = new Map()
  let cssOutput = ''

  try {
    const projectRequire = createRequire(path.join(projectRoot, 'package.json'))
    const { createGenerator } = projectRequire('@unocss/core')
    const presetUnoDefault = projectRequire('@unocss/preset-uno').default

    // Load user config if exists
    let userConfig = {}
    const configPath = findConfig(projectRoot)
    if (configPath) {
      try {
        delete require.cache[configPath]
        userConfig = require(configPath)
      } catch (_) {}
    }

    // Merge config: user config extends preset-uno
    const config = {
      ...userConfig,
      presets: [...(userConfig.presets || []), presetUnoDefault()],
    }

    // Create UnoCSS generator with config (createGenerator is async)
    const uno = await createGenerator(config)

    // Scan .vue files for classes
    const classes = scanClasses(projectRoot).join(' ')

    // Generate CSS — this IS UnoCSS's core capability
    if (classes) {
      const result = await uno.generate(classes, { preflights: false })
      cssOutput = result.css

      // Parse CSS → RN style map
      const parsed = parseCSS(cssOutput)
      for (const [key, val] of parsed) {
        styleMap.set(key, val)
      }
    }

    // Also process safelist from config
    const safelist = userConfig.safelist || []
    if (safelist.length > 0) {
      const result = await uno.generate(safelist.join(' '), { preflights: false })
      cssOutput += '\n' + result.css
      const parsed = parseCSS(result.css)
      for (const [key, val] of parsed) {
        styleMap.set(key, val)
      }
    }
  } catch (e) {
    console.warn(`[vue-rn] Unocss resolver: ${e.message}`)
  }

  return { styleMap, dynamicInjection: cssOutput }
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
  for (const name of ['uno.config.js', 'uno.config.ts', 'unocss.config.js', 'unocss.config.ts']) {
    const full = path.join(root, name)
    if (fs.existsSync(full)) return full
  }
  return null
}

module.exports = { name: NAME, detect, init }
