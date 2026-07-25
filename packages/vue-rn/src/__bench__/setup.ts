/**
 * Benchmark setup — runs before ALL bench files.
 * Sets up the shared nativeFabricUIManager mock + devtools hook.
 */
;(globalThis as any).__DEV__ = true
;(globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  registerInternalModuleStart: () => {},
  registerInternalModuleStop: () => {},
}

const roots = new Map()
const uim: Record<string, any> = {}

const FNS: Record<string, (...args: any[]) => any> = {
  createNode: (rt, vn, root, props, ih) => ({ reactTag: rt, viewName: vn, rootTag: root, props: { ...props }, children: [], instanceHandle: ih }),
  cloneNode: (n) => ({ ...n, props: { ...n.props }, children: [...n.children] }),
  cloneNodeWithNewProps: (n, d) => ({ ...n, props: { ...n.props, ...d }, children: [...n.children] }),
  cloneNodeWithNewChildren: (n, c) => ({ ...n, children: c ?? [] }),
  cloneNodeWithNewChildrenAndProps: (n, cs, p) => ({ ...n, props: { ...n.props, ...p }, children: Array.isArray(cs) ? [...cs] : [] }),
  appendChild: (p, c) => { p.children.push(c) },
  createChildSet: () => [],
  appendChildToSet: (s, c) => { s.push(c) },
  completeRoot: (rt, cs) => { roots.set(rt, cs) },
  dispatchCommand: () => {},
  sendAccessibilityEvent: () => {},
  setNativeProps: () => {},
  registerEventHandler: () => {},
  findShadowNodeByTag_DEPRECATED: () => null,
}

for (const [k, fn] of Object.entries(FNS)) {
  let count = 0
  uim[k] = (...args: any[]) => { count++; return fn(...args) }
  Object.defineProperty(uim[k], 'mock', { get: () => ({ calls: { length: count } }) })
}

;(globalThis as any).nativeFabricUIManager = uim
