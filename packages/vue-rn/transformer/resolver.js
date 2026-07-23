/**
 * CSS Resolver Registry for @rasenjs/vue-rn
 *
 * Auto-detects which CSS framework is installed in the project (Tailwind v3,
 * Tailwind v4, UnoCSS) and provides a unified className → RN style conversion
 * pipeline.
 *
 * Each resolver implements:
 *   name      - human-readable name
 *   detect()  - returns true if this framework is available
 *   init()    - runs PostCSS once, returns className → style Map
 */

const fs = require('fs')
const path = require('path')

const RESOLVERS = [
  require('./resolvers/tailwind-v4'),
  require('./resolvers/tailwind-v3'),
  require('./resolvers/unocss'),
]

/**
 * Auto-detect and initialize the appropriate CSS resolver.
 * Tries each resolver in priority order; returns the first one that
 * detects its framework.
 *
 * @param {object} [options]  - Optional override: { resolver: 'tailwind-v4' }
 * @returns {Promise<{ name: string, styleMap: Map<string,object>, dynamicInjection: string }>}
 */
async function resolve(options = {}) {
  let resolver

  if (options.resolver) {
    resolver = RESOLVERS.find(r => r.name === options.resolver)
    if (!resolver) {
      throw new Error(
        `[vue-rn] Unknown CSS resolver "${options.resolver}". ` +
        `Available: ${RESOLVERS.map(r => r.name).join(', ')}`
      )
    }
    if (!resolver.detect(options)) {
      console.warn(`[vue-rn] Resolver "${resolver.name}" selected but no matching config found.`)
    }
  } else {
    // Auto-detect — pass projectRoot so detect() can check the right node_modules
    for (const r of RESOLVERS) {
      if (r.detect(options)) {
        resolver = r
        break
      }
    }
  }

  if (!resolver) {
    return { name: 'none', styleMap: new Map(), dynamicInjection: '' }
  }

  console.log(`[vue-rn] CSS resolver: ${resolver.name}`)
  const { styleMap, dynamicInjection } = await resolver.init(options)
  return { name: resolver.name, styleMap, dynamicInjection }
}

module.exports = { resolve, RESOLVERS }
