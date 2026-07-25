// Mock react-native for benchmarking (pure CJS, no `import typeof`).
// Provides: Platform, AppRegistry, full RNPI shape.
// Fabric renderer (ReactFabric-dev.js) is a copy from the real package.

const configs = new Map()
const reg = {
  register: (n, c) => {
    const vc = c()
    configs.set(n, vc)
    const factory = (props) => props
    factory.viewConfig = vc
    factory.displayName = n
    configs.set(factory, vc)
    return factory
  },
  get: (n) => { const c = configs.get(n); if (!c) throw new Error('vc not found: ' + n); return c },
  customBubblingEventTypes: {},
  customDirectEventTypes: {},
}

function registerDefaultViewConfigs() {
  const views = {
    RCTView: { style: true },
    RCTText: { style: true },
    RCTImageView: { style: true, src: true },
    RCTScrollView: { style: true },
    RCTSinglelineTextInputView: { style: true, text: true },
    RCTRawText: { text: true },
  }
  for (const [name, attrs] of Object.entries(views)) {
    reg.register(name, () => ({ validAttributes: attrs, uiViewClassName: name }))
  }
}
registerDefaultViewConfigs()

const diff = (prev, next) => {
  const d = {}; let h = false
  for (const k of Object.keys(next || {})) { if (next[k] !== prev?.[k]) { d[k] = next[k]; h = true } }
  for (const k of Object.keys(prev || {})) { if (!(k in next)) { d[k] = null; h = true } }
  return h ? d : null
}

const rnpi = {
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

Object.assign(module.exports, rnpi)
module.exports.Platform = { OS: 'ios', select: (s) => s.ios ?? s.default }
module.exports.AppRegistry = { registerRunnable: () => {}, registerComponent: () => {} }
module.exports.default = rnpi

// Load Fabric renderer (our local copy — Node resolves react-native/* to this package)
const ReactFabric = require('./Libraries/Renderer/implementations/ReactFabric-dev')
module.exports.ReactFabric = ReactFabric
