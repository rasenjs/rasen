/**
 * @rasenjs/rn-dom — React Native Built-in Component Tags (CJS)
 *
 * AUTO-GENERATED from src/tags.ts. Do not edit manually.
 * Run `yarn build` or `node scripts/generate-tags.cjs` to regenerate.
 *
 * @generated 2026-07-24
 */

/** @type {string[]} */
const RN_BUILT_IN_TAGS = [
  "View",
  "SafeAreaView",
  "Text",
  "Image",
  "TextInput",
  "AndroidTextInput",
  "ScrollView",
  "AndroidHorizontalScrollView",
  "ActivityIndicator",
  "ProgressBarAndroid",
  "Switch",
  "AndroidSwitch",
  "RefreshControl",
  "AndroidSwipeRefreshLayout",
  "Modal",
  "DrawerLayoutAndroid",
  "DebuggingOverlay"
]

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
