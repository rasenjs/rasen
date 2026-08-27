/**
 * @rasenjs/rn-dom — Jest setup(原 Vitest,迁移到 @react-native/jest-preset)
 *
 * Mocks react-native modules so rn-dom can be tested in Node.
 * @react-native/jest-preset 已提供 nativeFabricUIManager 空对象 + 各 RN 组件
 * mock;这里补充 rn-dom 需要的手动 mock(fabric 方法集、viewConfigRegistry、
 * elements、keyboard、Platform)。
 */

import { vi } from 'vitest'

/** Keyboard mock(ScrollView keyboardDismissMode 测试用)。 */
const { mockKeyboard } = vi.hoisted(() => ({ mockKeyboard: { dismiss: vi.fn() } }))
export { mockKeyboard }

/** 类型化 globalThis 访问(替代 as any)。 */
export const gGlobal = globalThis as unknown as {
  __RASEN_INSTANCE_MAP__?: Map<number, unknown>
  __RASEN_EVENT_HANDLER_REGISTERED__?: boolean
  nativeFabricUIManager?: unknown
}

// RN 运行时 __DEV__ 是打包器注入的全局;Node 测试环境补上(RN Modal.js 等用)。
;(globalThis as { __DEV__?: boolean }).__DEV__ = true

// jsdom 的 rAF 在下一帧触发,导致 scheduleFlush 的提交时序不稳定
// (setTimeout(0) 等不到)。让 rAF 走微任务,flush 在微任务队列中同步完成。
;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
  cb: FrameRequestCallback
) => {
  queueMicrotask(() => cb(0))
  return 0
}

/** Fabric mock 节点结构(替代 as any)。 */
export interface MockFabricNode {
  reactTag: number
  viewName: string
  rootTag: number
  props: Record<string, unknown>
  children: MockFabricNode[]
  instanceHandle: object
}

// ── Mock react-native ─────────────────────────────────────────────────

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (s: Record<string, unknown>) => s.ios ?? s.default },
  I18nManager: { getConstants: () => ({ isRTL: false }) },
  Keyboard: mockKeyboard,
  default: {
    Platform: { OS: 'ios', select: (s: Record<string, unknown>) => s.ios ?? s.default },
    I18nManager: { getConstants: () => ({ isRTL: false }) },
    Keyboard: mockKeyboard,
  },
}))

// ── Mock react-native/Libraries/ReactPrivate/ReactNativePrivateInterface ──

/** View config shape as read by the event system (bubbling/direct tables). */
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
    get: (name: string) => { const c = configs.get(name); if (!c) throw new Error(`ViewConfig not found: ${name}`); return c },
    // ReactFabric 渲染器读取 registry.customBubblingEventTypes / customDirectEventTypes
    // (EventPluginRegistry 注入)。ReactFabric 生成对照数据(fixture)时需要存在。
    customBubblingEventTypes: {} as Record<string, unknown>,
    customDirectEventTypes: {} as Record<string, unknown>,
  }
})()

// jest 需要 __esModule:true 才能让 ESM default import 拿到 factory.default;
// 同时 ReactFabric bundle 用 require('...') 拿模块对象(属性直接可用)。
// 返回 { ...mock, default: mock }:rn-dom default import → mock;ReactFabric
// require → 对象本身(ReactNativeViewConfigRegistry 直接可用)。
vi.mock('react-native/Libraries/ReactPrivate/ReactNativePrivateInterface', () => {
  const mock = {
    ReactNativeViewConfigRegistry: mockViewConfigRegistry,
    createAttributePayload: vi.fn((props: Record<string, unknown>) =>
      Object.keys(props).length > 0 ? { ...props } : null),
    diffAttributePayloads: vi.fn((prev: Record<string, unknown>, next: Record<string, unknown>) => {
      const diff: Record<string, unknown> = {}
      let hasDiff = false
      for (const k of Object.keys(next)) { if (next[k] !== prev[k]) { diff[k] = next[k]; hasDiff = true } }
      for (const k of Object.keys(prev)) { if (!(k in next)) { diff[k] = null; hasDiff = true } }
      return hasDiff ? diff : null
    }),
  }
  return { __esModule: true, ...mock, default: mock }
})

// ── Mock RCTDeviceEventEmitter (native-module events: modalDismissed etc.) ──
// Injected on globalThis: rn-dom's event-system reads globalThis first, since
// dynamic deep requires aren't intercepted by vi.mock in fork workers.

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

// ── Mock @rasenjs/rn-dom/elements ─────────────────────────────────────

vi.mock('@rasenjs/rn-dom/elements', () => {
  // 只 mock ensure()(其 require('react-native/...') 无法在 vitest 运行)。
  // tag 表从真实 elements.cjs 读取(普通 require 绕过 mock 避免递归);
  // __RN_normalizeProps 已迁移到主模块的节点类(src/elements/*),不再经过 elements mock。
  const real = require('../../elements.cjs') as {
    RN_BUILT_IN_TAGS: string[]
  }
  const TAGS = [...real.RN_BUILT_IN_TAGS]
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
    RN_BUILT_IN_TAGS: TAGS,
    isRNBuiltIn: (tag: string) => TAGS.includes(tag),
    getAllTags: () => [...TAGS],
    isPlatformAmbiguous: (tag: string) => ['Switch', 'TextInput', 'ActivityIndicator'].includes(tag),
    ensure: (tagName: string) => ENSURE_MAP[tagName],
  }
})

// ── Fabric UIManager Mock ─────────────────────────────────────────────

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
  cloneNode: vi.fn((node: any) => ({ ...node, props: { ...node.props }, children: [...node.children] })),
  cloneNodeWithNewProps: vi.fn((node: any, diff: Record<string, unknown>) =>
    ({ ...node, props: { ...node.props, ...diff }, children: [...node.children] })),
  cloneNodeWithNewChildren: vi.fn((node: any, children: any[]) =>
    ({ ...node, children: children ?? [] })),
  cloneNodeWithNewChildrenAndProps: vi.fn((node: any, cs: any[], p?: Record<string, unknown>) =>
    ({ ...node, props: { ...node.props, ...p }, children: cs ? [...cs] : [] })),
  appendChild: vi.fn((parent: any, child: any) => { parent.children.push(child) }),
  createChildSet: vi.fn(() => []),
  appendChildToSet: vi.fn((set: any[], child: any) => { set.push(child) }),
  completeRoot: vi.fn((rootTag: number, childSet: any[]) => { roots.set(rootTag, childSet) }),
  dispatchCommand: vi.fn(),
  sendAccessibilityEvent: vi.fn(),
  setNativeProps: vi.fn(),
  registerEventHandler: vi.fn(),
  findShadowNodeByTag_DEPRECATED: vi.fn(() => ({ _mock: true })), // truthy return
}

;(gGlobal).nativeFabricUIManager = uim

// ── Pre-register common view configs ──────────────────────────────────

/**
 * Register a view config. Extends with RN-style event tables so the event
 * system's viewConfig-driven behavior resolution is exercised for real:
 *   bubblingEventTypes  → { topXxx: { phasedRegistrationNames: { bubbled: 'onXxx' } } }
 *   directEventTypes    → { topXxx: { registrationName: 'onXxx' } }
 */
const RN_BUBBLING = (names: string[]) =>
  Object.fromEntries(
    names.map(n => [n, { phasedRegistrationNames: { bubbled: 'on' + n.slice(3) } }]),
  )

const vc = (name: string, attrs: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  mockViewConfigRegistry.register(name, {
    validAttributes: attrs,
    bubblingEventTypes: {
      ...RN_BUBBLING(['topTouchStart', 'topTouchMove', 'topTouchEnd', 'topTouchCancel', 'topPress', 'topChange', 'topFocus', 'topBlur', 'topSubmitEditing', 'topEndEditing', 'topKeyPress']),
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
vc('RCTImageView', { style: true, src: true, source: true, resizeMode: true })
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
  // mockReset() clears the return values (e.g. vi.fn(() => []) becomes
  // vi.fn() returning undefined), breaking subsequent test code.
  for (const v of Object.values(uim)) {
    if (vi.isMockFunction(v)) (v as ReturnType<typeof vi.fn>).mockClear()
  }
  roots.clear()
  deviceEmitterListeners.clear()
  // Reset event handler registration flag so _rnInitEventSystem
  // fires on next document creation
  delete gGlobal.__RASEN_EVENT_HANDLER_REGISTERED__
}

export const nativeFabricUIManager = uim
export const viewConfigRegistry = mockViewConfigRegistry
