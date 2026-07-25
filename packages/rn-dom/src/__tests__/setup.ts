/**
 * @rasenjs/rn-dom — Vitest setup
 *
 * Mocks react-native modules so rn-dom can be tested in Node.
 * Follows facebook/react's pattern: all native modules are mocked,
 * nativeFabricUIManager is set on globalThis.
 */

import { vi } from 'vitest'

// ── Mock react-native ─────────────────────────────────────────────────

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (s: Record<string, unknown>) => s.ios ?? s.default },
  default: { Platform: { OS: 'ios', select: (s: Record<string, unknown>) => s.ios ?? s.default } },
}))

// ── Mock react-native/Libraries/ReactPrivate/ReactNativePrivateInterface ──

const _viewConfigRegistry = (() => {
  const configs = new Map<string, { validAttributes: Record<string, unknown> }>()
  return {
    register: (name: string, cfg: { validAttributes: Record<string, unknown> }) => { configs.set(name, cfg) },
    get: (name: string) => { const c = configs.get(name); if (!c) throw new Error(`ViewConfig not found: ${name}`); return c },
  }
})()

vi.mock('react-native/Libraries/ReactPrivate/ReactNativePrivateInterface', () => ({
  default: {
    ReactNativeViewConfigRegistry: _viewConfigRegistry,
    createAttributePayload: vi.fn((props: Record<string, unknown>) =>
      Object.keys(props).length > 0 ? { ...props } : null),
    diffAttributePayloads: vi.fn((prev: Record<string, unknown>, next: Record<string, unknown>) => {
      const diff: Record<string, unknown> = {}
      let hasDiff = false
      for (const k of Object.keys(next)) { if (next[k] !== prev[k]) { diff[k] = next[k]; hasDiff = true } }
      for (const k of Object.keys(prev)) { if (!(k in next)) { diff[k] = null; hasDiff = true } }
      return hasDiff ? diff : null
    }),
  },
}))

// ── Mock @rasenjs/rn-dom/elements ─────────────────────────────────────

vi.mock('@rasenjs/rn-dom/elements', () => {
  const TAGS = ['View','SafeAreaView','Text','Image','TextInput','AndroidTextInput',
    'ScrollView','AndroidHorizontalScrollView','ActivityIndicator',
    'ProgressBarAndroid','Switch','AndroidSwitch','RefreshControl',
    'AndroidSwipeRefreshLayout','Modal','DrawerLayoutAndroid','DebuggingOverlay']
  const ENSURE_MAP: Record<string, string> = {
    View: 'RCTView', Text: 'RCTText', Image: 'RCTImageView',
    ScrollView: 'RCTScrollView', Switch: 'RCTSwitch',
    SafeAreaView: 'RCTSafeAreaView', ActivityIndicator: 'RCTActivityIndicatorView',
    TextInput: 'RCTSinglelineTextInputView',
  }
  return {
    RN_BUILT_IN_TAGS: TAGS,
    isRNBuiltIn: (tag: string) => TAGS.includes(tag),
    getAllTags: () => [...TAGS],
    ensure: (tagName: string) => ENSURE_MAP[tagName],
  }
})

// ── Fabric UIManager Mock ─────────────────────────────────────────────

const roots = new Map<number, unknown[]>()

function dumpNode(node: any, indent: number): string {
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
      for (const c of cs as any[]) r += dumpNode(c, 1) + '\n'
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
  setNativeProps: vi.fn(),
  registerEventHandler: vi.fn(),
  findShadowNodeByTag_DEPRECATED: vi.fn(() => null),
}

;(globalThis as any).nativeFabricUIManager = uim

// ── Pre-register common view configs ──────────────────────────────────

const vc = (name: string, attrs: Record<string, unknown>) =>
  _viewConfigRegistry.register(name, { validAttributes: attrs })

vc('RCTView', { style: true, onTouchEnd: true })
vc('RCTText', { style: true, onTouchEnd: true })
vc('RCTImageView', { style: true, src: true, resizeMode: true })
vc('RCTScrollView', { style: true })
vc('RCTSwitch', { style: true })
vc('RCTSafeAreaView', { style: true })
vc('RCTSinglelineTextInputView', { style: true, text: true })
vc('RCTActivityIndicatorView', { style: true, animating: true })
vc('RCTRawText', { text: true })

// ── Exports ───────────────────────────────────────────────────────────

export function resetFabricMocks(): void {
  // Use mockClear() not mockReset() to preserve implementations.
  // mockReset() clears the return values (e.g. vi.fn(() => []) becomes
  // vi.fn() returning undefined), breaking subsequent test code.
  for (const v of Object.values(uim)) {
    if (vi.isMockFunction(v)) (v as ReturnType<typeof vi.fn>).mockClear()
  }
  roots.clear()
  // Reset event handler registration flag so _rnInitEventSystem
  // fires on next document creation
  delete (globalThis as any).__RASEN_EVENT_HANDLER_REGISTERED__
}

export const nativeFabricUIManager = uim
export const viewConfigRegistry = _viewConfigRegistry
