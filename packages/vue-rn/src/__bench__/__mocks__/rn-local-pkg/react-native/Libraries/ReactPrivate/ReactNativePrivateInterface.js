// RNPI — self-contained copy (no circular deps with index.js loading Fabric)
const configs = new Map()

function register(n, c) {
  const vc = c()
  configs.set(n, vc)
  const factory = (props) => props
  factory.viewConfig = vc
  factory.displayName = n
  configs.set(factory, vc)
  return factory
}

function get(n) {
  const c = configs.get(n)
  if (!c) throw new Error('vc not found: ' + n)
  return c
}

const reg = { register, get, customBubblingEventTypes: {}, customDirectEventTypes: {} }

// Register defaults so rn-dom _resolveNativeName() works
const views = {
  RCTView: { style: true },
  RCTText: { style: true },
  RCTImageView: { style: true, src: true },
  RCTScrollView: { style: true },
  RCTSinglelineTextInputView: { style: true, text: true },
  RCTRawText: { text: true },
}
for (const [name, attrs] of Object.entries(views)) {
  register(name, () => ({ validAttributes: attrs, uiViewClassName: name }))
}

const diff = (prev, next) => {
  const d = {}; let h = false
  for (const k of Object.keys(next || {})) { if (next[k] !== prev?.[k]) { d[k] = next[k]; h = true } }
  for (const k of Object.keys(prev || {})) { if (!(k in next)) { d[k] = null; h = true } }
  return h ? d : null
}

module.exports = {
  ReactNativeViewConfigRegistry: reg,
  createAttributePayload: (p) => (p && Object.keys(p).length > 0 ? { ...p } : null),
  diffAttributePayloads: diff,
  deepDiffer: (a, b) => a !== b,
  deepFreezeAndThrowOnMutationInDev: () => {},
  flattenStyle: (s) => s,
  createPublicInstance: (t, n, h) => ({ tag: t, node: n, handle: h }),
  createPublicTextInstance: (h) => ({ handle: h }),
  getNativeTagFromPublicInstance: (i) => i?.tag ?? null,
  getNodeFromPublicInstance: (i) => i?.node ?? null,
  getInternalInstanceHandleFromPublicInstance: (i) => i?.handle ?? null,
  legacySendAccessibilityEvent: () => {},
  RawEventEmitter: { emit: () => {} },
  ReactFiberErrorDialog: { showErrorDialog: () => true },
  UIManager: {
    dispatchViewManagerCommand: () => {},
    measure: (n, cb) => cb && cb(0, 0, 100, 100, 0, 0),
    findSubviewIn: (n, x, y, cb) => cb && cb(0, 0, 100, 100, 0, 0),
  },
}
