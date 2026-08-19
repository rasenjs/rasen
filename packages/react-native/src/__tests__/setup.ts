/**
 * @rasenjs/react-native — component-level test setup.
 *
 * Components import react-native (Platform / Keyboard / AppRegistry / StatusBar)
 * and rn-dom (which itself imports react-native + RNPI at module load). We mock
 * all of those so rasen components can render into rn-dom's Fabric node tree
 * under Vitest (Node), following the same strategy as
 * `rn-dom/src/__tests__/setup.ts` and `vue-rn/src/__tests__/setup.ts`:
 *
 *  - react-native: Platform / I18nManager / Keyboard / AppRegistry / StatusBar
 *  - ReactNativePrivateInterface: viewConfigRegistry + attribute payloads
 *  - RCTDeviceEventEmitter: injected on globalThis (native-module events)
 *  - nativeFabricUIManager: Fabric mock nodes
 *  - @rasenjs/rn-dom/elements: hardcoded tag table + ensure() (the real
 *    elements.cjs does CJS `require('react-native/...')` which can't be
 *    intercepted by vi.mock in fork workers)
 *
 * In addition, `useReactiveRuntime()` is installed so rasen's core API
 * (`element`, `each`, `when`, …) works out of the box in tests.
 */

import { vi } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'

// ── Reactive runtime (rasen core requires one) ───────────────────────
useReactiveRuntime()

/** Keyboard mock (ScrollView keyboardDismissMode / KeyboardAvoidingView). */
const { mockKeyboard } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  return {
    mockKeyboard: {
      dismiss: vi.fn(),
      addListener: (name: string, cb: (e: unknown) => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set())
        listeners.get(name)!.add(cb)
        return { remove: () => listeners.get(name)?.delete(cb) }
      },
      /** Test helper: emit a keyboard event. */
      _emit: (name: string, payload: unknown) => {
        listeners.get(name)?.forEach(cb => cb(payload))
      },
    },
  }
})
export { mockKeyboard }

/** StatusBar static stack API mock. */
const { mockStatusBarStack } = vi.hoisted(() => {
  const entries: unknown[] = []
  return {
    mockStatusBarStack: {
      entries,
      pushStackEntry: vi.fn((props: unknown) => { entries.push(props); return props }),
      replaceStackEntry: vi.fn((entry: unknown, props: unknown) => {
        const i = entries.indexOf(entry); if (i >= 0) entries[i] = props; return props
      }),
      popStackEntry: vi.fn((entry: unknown) => {
        const i = entries.indexOf(entry); if (i >= 0) entries.splice(i, 1)
      }),
    },
  }
})

/** AppRegistry.registerRunnable recorder (registerApp / createApp). */
const { mockAppRegistry } = vi.hoisted(() => ({
  mockAppRegistry: { registerRunnable: vi.fn(), registerComponent: vi.fn() },
}))
export { mockAppRegistry, mockStatusBarStack }

// ── Mock react-native ─────────────────────────────────────────────────
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (s: Record<string, unknown>) => s.ios ?? s.default },
  I18nManager: { getConstants: () => ({ isRTL: false }) },
  Keyboard: mockKeyboard,
  AppRegistry: mockAppRegistry,
  StatusBar: mockStatusBarStack,
  StyleSheet: {
    create: (s: Record<string, unknown>) => s,
    hairlineWidth: 1,
    absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    flatten: (s: unknown) => s,
  },
  Dimensions: {
    get: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  PixelRatio: {
    get: () => 2,
    getFontScale: () => 1,
    roundToNearestPixel: (x: number) => x,
    startDetecting: () => {},
  },
  Easing: {
    linear: (t: number) => t,
    ease: (t: number) => t,
    in: (f: (t: number) => number) => f,
    out: (f: (t: number) => number) => f,
    inOut: (f: (t: number) => number) => f,
  },
  InteractionManager: {
    runAfterInteractions: (cb: () => void) => cb(),
    createInteractionHandle: () => 1,
    clearInteractionHandle: () => {},
  },
  processColor: (c: unknown) => c,
  EventEmitter: class {
    addListener() { return { remove: () => {} } }
  },
  Alert: { alert: vi.fn() },
  ToastAndroid: { show: vi.fn(), showWithGravity: vi.fn(), LONG: 1, SHORT: 0 },
  Vibration: { vibrate: vi.fn(), cancel: vi.fn() },
  Share: { share: vi.fn(), sharedAction: 'sharedAction', dismissedAction: 'dismissedAction' },
  Linking: {
    openURL: vi.fn(), canOpenURL: vi.fn(), getInitialURL: vi.fn(),
    addEventListener: () => ({ remove: () => {} }),
  },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  AccessibilityInfo: {
    isScreenReaderEnabled: vi.fn(),
    addEventListener: () => ({ remove: () => {} }),
  },
  DeviceEventEmitter: { addListener: vi.fn(), removeAllListeners: vi.fn() },
  default: {
    Platform: { OS: 'ios', select: (s: Record<string, unknown>) => s.ios ?? s.default },
    I18nManager: { getConstants: () => ({ isRTL: false }) },
    Keyboard: mockKeyboard,
    AppRegistry: mockAppRegistry,
    StatusBar: mockStatusBarStack,
  },
}))

// ── Mock react-native/Libraries/ReactPrivate/ReactNativePrivateInterface ──

export interface MockViewConfig {
  validAttributes: Record<string, unknown>
  bubblingEventTypes?: Record<string, unknown>
  directEventTypes?: Record<string, unknown>
  [key: string]: unknown
}

const mockViewConfigRegistry = (() => {
  const configs = new Map<string, MockViewConfig>()
  return {
    register: (name: string, cfg: MockViewConfig) => { configs.set(name, cfg) },
    get: (name: string) => {
      const c = configs.get(name)
      if (!c) throw new Error(`ViewConfig not found: ${name}`)
      return c
    },
    customBubblingEventTypes: {} as Record<string, unknown>,
    customDirectEventTypes: {} as Record<string, unknown>,
  }
})()

vi.mock('react-native/Libraries/ReactPrivate/ReactNativePrivateInterface', () => {
  const mock = {
    ReactNativeViewConfigRegistry: mockViewConfigRegistry,
    createAttributePayload: vi.fn((props: Record<string, unknown>) =>
      Object.keys(props).length > 0 ? { ...props } : null),
    diffAttributePayloads: vi.fn(
      (prev: Record<string, unknown>, next: Record<string, unknown>) => {
        const diff: Record<string, unknown> = {}
        let hasDiff = false
        for (const k of Object.keys(next)) {
          if (next[k] !== prev[k]) { diff[k] = next[k]; hasDiff = true }
        }
        for (const k of Object.keys(prev)) {
          if (!(k in next)) { diff[k] = null; hasDiff = true }
        }
        return hasDiff ? diff : null
      },
    ),
  }
  return { __esModule: true, ...mock, default: mock }
})

// ── Mock RCTDeviceEventEmitter (native-module events) ─────────────────
const deviceEmitterListeners = new Map<string, Set<(e: unknown) => void>>()

const deviceEventEmitterMock = {
  addListener: (name: string, cb: (e: unknown) => void) => {
    if (!deviceEmitterListeners.has(name)) deviceEmitterListeners.set(name, new Set())
    deviceEmitterListeners.get(name)!.add(cb)
    return { remove: () => deviceEmitterListeners.get(name)?.delete(cb) }
  },
}

;(globalThis as Record<string, unknown>).__RASEN_DEVICE_EVENT_EMITTER__ = deviceEventEmitterMock

/** Emit a native-module event (test helper). */
export function emitDeviceEvent(name: string, payload: unknown): void {
  deviceEmitterListeners.get(name)?.forEach(cb => cb(payload))
}

// ── Mock @rasenjs/rn-dom/elements ────────────────────────────────────
// rn-dom's elements.cjs calls `require('react-native/...')` inside ensure();
// those real modules are Flow + CJS and can't be intercepted by vi.mock in
// fork workers. Mirror rn-dom's own test setup: hardcode the tag table and
// the ensure() map.

vi.mock('@rasenjs/rn-dom/elements', () => {
  const RN_BUILT_IN_TAGS = [
    'View', 'SafeAreaView',
    'Text',
    'Image',
    'TextInput', 'AndroidTextInput',
    'ScrollView', 'AndroidHorizontalScrollView',
    'ActivityIndicator', 'ProgressBarAndroid',
    'Switch', 'AndroidSwitch',
    'RefreshControl', 'AndroidSwipeRefreshLayout',
    'Modal',
    'DrawerLayoutAndroid',
    'DebuggingOverlay',
    'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
    'TouchableNativeFeedback',
    'InputAccessoryView',
  ]
  const ENSURE_MAP: Record<string, string> = {
    View: 'RCTView', Text: 'RCTText', Image: 'RCTImageView',
    ScrollView: 'RCTScrollView', Switch: 'RCTSwitch',
    SafeAreaView: 'RCTSafeAreaView', ActivityIndicator: 'RCTActivityIndicatorView',
    TextInput: 'RCTSinglelineTextInputView', Modal: 'ModalHostView',
    Pressable: 'RCTView', TouchableOpacity: 'RCTView',
    TouchableHighlight: 'RCTView', TouchableWithoutFeedback: 'RCTView',
    TouchableNativeFeedback: 'RCTView',
    ProgressBarAndroid: 'AndroidProgressBar',
    RefreshControl: 'RCTRefreshControl', AndroidSwipeRefreshLayout: 'AndroidSwipeRefreshLayout',
    DrawerLayoutAndroid: 'AndroidDrawerLayout',
    InputAccessoryView: 'RCTInputAccessoryView',
  }
  return {
    RN_BUILT_IN_TAGS,
    isRNBuiltIn: (tag: string) => RN_BUILT_IN_TAGS.includes(tag),
    getAllTags: () => [...RN_BUILT_IN_TAGS],
    isPlatformAmbiguous: (tag: string) =>
      ['Switch', 'TextInput', 'ActivityIndicator'].includes(tag),
    ensure: (tagName: string) => ENSURE_MAP[tagName],
  }
})

// ── Fabric UIManager Mock ─────────────────────────────────────────────

export interface MockFabricNode {
  reactTag: number
  viewName: string
  rootTag: number
  props: Record<string, unknown>
  children: MockFabricNode[]
  instanceHandle: object
}

const roots = new Map<number, MockFabricNode[]>()

function dumpNode(node: MockFabricNode, indent: number): string {
  const sp = '  '.repeat(indent)
  let r = `${sp}${node.viewName} ${JSON.stringify(node.props)}`
  for (const c of node.children) r += '\n' + dumpNode(c, indent + 1)
  return r
}

const uim = {
  __dumpHierarchyForJestTestsOnly: () => {
    let r = ''
    for (const [rt, cs] of roots) {
      if (r) r += '\n'
      r += `${rt}\n`
      for (const c of cs) r += dumpNode(c, 1) + '\n'
    }
    return r.trim()
  },
  createNode: vi.fn((reactTag: number, viewName: string, rootTag: number, props: Record<string, unknown>, instanceHandle: object) =>
    ({ reactTag, viewName, rootTag, props: { ...props }, children: [], instanceHandle })),
  cloneNode: vi.fn((node: MockFabricNode) => ({ ...node, props: { ...node.props }, children: [...node.children] })),
  cloneNodeWithNewProps: vi.fn((node: MockFabricNode, diff: Record<string, unknown>) =>
    ({ ...node, props: { ...node.props, ...diff }, children: [...node.children] })),
  cloneNodeWithNewChildren: vi.fn((node: MockFabricNode, children: unknown[]) =>
    ({ ...node, children: children ?? [] })),
  cloneNodeWithNewChildrenAndProps: vi.fn((node: MockFabricNode, cs: unknown[], p?: Record<string, unknown>) =>
    ({ ...node, props: { ...node.props, ...p }, children: cs ? [...cs] : [] })),
  appendChild: vi.fn((parent: MockFabricNode, child: MockFabricNode) => { parent.children.push(child) }),
  createChildSet: vi.fn(() => []),
  appendChildToSet: vi.fn((set: unknown[], child: MockFabricNode) => { set.push(child) }),
  completeRoot: vi.fn((rootTag: number, childSet: unknown[]) => { roots.set(rootTag, childSet as MockFabricNode[]) }),
  dispatchCommand: vi.fn(),
  sendAccessibilityEvent: vi.fn(),
  setNativeProps: vi.fn(),
  registerEventHandler: vi.fn(),
  findShadowNodeByTag_DEPRECATED: vi.fn(() => ({ _mock: true })),
}

;(globalThis as Record<string, unknown>).nativeFabricUIManager = uim

// ── Pre-register common view configs ─────────────────────────────────

/**
 * Register a view config. Extends with RN-style event tables so the event
 * system's viewConfig-driven behavior resolution is exercised for real:
 *   bubblingEventTypes → { topXxx: { phasedRegistrationNames: { bubbled: 'onXxx' } } }
 *   directEventTypes   → { topXxx: { registrationName: 'onXxx' } }
 */
const RN_BUBBLING = (names: string[]) =>
  Object.fromEntries(
    names.map(n => [n, { phasedRegistrationNames: { bubbled: 'on' + n.slice(3) } }]),
  )

const vc = (name: string, attrs: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  mockViewConfigRegistry.register(name, {
    validAttributes: attrs,
    bubblingEventTypes: {
      ...RN_BUBBLING([
        'topTouchStart', 'topTouchMove', 'topTouchEnd', 'topTouchCancel',
        'topPress', 'topChange', 'topFocus', 'topBlur',
        'topSubmitEditing', 'topEndEditing', 'topKeyPress',
      ]),
      ...(extra.bubbling ?? {}),
    },
    directEventTypes: {
      topLayout: { registrationName: 'onLayout' },
      ...(extra.direct ?? {}),
    },
    ...extra,
  })

vc('RCTView', { style: true, onTouchEnd: true })
vc('RCTText', { style: true, onTouchEnd: true })
vc('RCTImageView', { style: true, src: true, resizeMode: true })
vc('RCTScrollView', { style: true })
vc('RCTSwitch', { style: true })
vc('RCTSafeAreaView', { style: true })
vc('RCTSinglelineTextInputView', { style: true, text: true })
vc('RCTMultilineTextInputView', { style: true, text: true })
vc('RCTVirtualText', { style: true })
vc('RCTActivityIndicatorView', { style: true, animating: true })
vc('RCTRawText', { text: true })
vc('ModalHostView', { style: true, identifier: true, visible: true })
vc('AndroidProgressBar', { style: true, styleAttr: true, indeterminate: true, animating: true })
vc('RCTRefreshControl', { style: true, refreshing: true, progressViewOffset: true }, {
  direct: { topRefresh: { registrationName: 'onRefresh' } },
})
vc('AndroidSwipeRefreshLayout', { style: true, refreshing: true, enabled: true, size: true, progressViewOffset: true }, {
  direct: { topRefresh: { registrationName: 'onRefresh' } },
})
vc('AndroidDrawerLayout', { style: true, drawerWidth: true, drawerPosition: true, drawerLockMode: true, drawerBackgroundColor: true, keyboardDismissMode: true }, {
  direct: {
    topDrawerSlide: { registrationName: 'onDrawerSlide' },
    topDrawerOpen: { registrationName: 'onDrawerOpen' },
    topDrawerClose: { registrationName: 'onDrawerClose' },
    topDrawerStateChanged: { registrationName: 'onDrawerStateChanged' },
  },
})
vc('RCTInputAccessoryView', { style: true })

// ── Exports ───────────────────────────────────────────────────────────

export function resetFabricMocks(): void {
  // Use mockClear() not mockReset() to preserve implementations.
  for (const v of Object.values(uim)) {
    if (vi.isMockFunction(v)) (v as ReturnType<typeof vi.fn>).mockClear()
  }
  roots.clear()
  deviceEmitterListeners.clear()
  // Reset event handler registration flag so _rnInitEventSystem
  // fires on next document creation
  delete (globalThis as Record<string, unknown>).__RASEN_EVENT_HANDLER_REGISTERED__
}

export const nativeFabricUIManager = uim
export const viewConfigRegistry = mockViewConfigRegistry
