/**
 * @rasenjs/rn-dom — Generate tags.cjs from tags.ts
 *
 * Run after updating src/tags.ts:
 *   node scripts/generate-tags.cjs
 *
 * Or during build: yarn build (hooks this automatically, see package.json)
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src', 'tags.ts')
const OUT = path.join(ROOT, 'tags.cjs')

const src = fs.readFileSync(SRC, 'utf-8')

// Extract tag names from the RN_COMPONENT_TAGS array in tags.ts
const tagMatch = src.match(/tag:\s*'([^']+)'/g)
if (!tagMatch) {
  console.error('Could not find tag entries in src/tags.ts')
  process.exit(1)
}

const tags = tagMatch.map(m => m.match(/'([^']+)'/)[1])
const uniqueTags = [...new Set(tags)]

let output = `/**
 * @rasenjs/rn-dom — React Native Built-in Component Tags (CJS)
 *
 * AUTO-GENERATED from src/tags.ts. Do not edit manually.
 * Run \`yarn build\` or \`node scripts/generate-tags.cjs\` to regenerate.
 *
 * @generated ${new Date().toISOString().slice(0, 10)}
 */

/** @type {string[]} */
const RN_BUILT_IN_TAGS = ${JSON.stringify(uniqueTags, null, 2)}

/**
 * Set of known React Native built-in component tag names.
 * Used by Metro transformers to distinguish RN primitives from custom elements.
 */
const TAG_SET = new Set(RN_BUILT_IN_TAGS)

/** @returns {string[]} */
function getAllTags() {
  return RN_BUILT_IN_TAGS
}

/** @param {string} tag @returns {boolean} */
function isRNBuiltIn(tag) {
  return TAG_SET.has(tag)
}

module.exports = { RN_BUILT_IN_TAGS, getAllTags, isRNBuiltIn }
`

fs.writeFileSync(OUT, output, 'utf-8')
console.log(`✅ Generated ${OUT} (${uniqueTags.length} tags)`)
