// Stub for @rasenjs/rn-dom/elements
// Provides ensure() and tag registry for benchmarks

const ENSURE_MAP = {
  View: 'RCTView',
  Text: 'RCTText',
  Image: 'RCTImageView',
  ScrollView: 'RCTScrollView',
  TextInput: 'RCTSinglelineTextInputView',
  Switch: 'RCTSwitch',
}

module.exports = {
  RN_BUILT_IN_TAGS: Object.keys(ENSURE_MAP),
  isRNBuiltIn: (tag) => tag in ENSURE_MAP,
  getAllTags: () => [...Object.keys(ENSURE_MAP)],
  ensure: (tagName) => ENSURE_MAP[tagName],
}
