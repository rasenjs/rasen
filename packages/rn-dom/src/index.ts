/**
 * React Native DOM-like Node Implementation
 *
 * Provides a DOM-like API for React Native Fabric rendering
 */

// Re-export shared utilities so framework adapters (Vue, etc.)
// can consume them from a single package.
export { parseCSS, normalizeEventName, isEvent, applyStylePatch } from './utils'

// Element types and runtime values are available from @rasenjs/rn-dom/elements.
// Re-exported here so framework adapters can import everything from one package.
import {
  RN_BUILT_IN_TAGS,
  isRNBuiltIn,
  getAllTags,
  isPlatformAmbiguous,
  type RNEvent,
  type RNStyle,
  type RNElementPropMap,
  type ElementProps,
  type RNElementPropName,
} from '@rasenjs/rn-dom/elements'

export { RN_BUILT_IN_TAGS, isRNBuiltIn, getAllTags, isPlatformAmbiguous }
export type { RNEvent, RNStyle, RNElementPropMap, ElementProps, RNElementPropName }

// ============================================================================
// Fabric Interop
// ============================================================================

export type Container = number
// Props 类型随 RNNode 一起定义在 node.ts,这里 re-export 保持公共 API。
export type { Props } from './node'

import ReactNativePrivateInterface from 'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface'
import { Platform } from 'react-native'
import type { FabricNode } from './fabric-global'
import { createDispatcher, resetPressState, resetModalBridge, type EventNode } from './event-system'

// 节点家族(RNNode / RNTextNode / RNCommentNode / RNDocumentFragment)与
// 通用基础设施(symbols、instance map、焦点管理、getFabricUIManager)在
// node.ts。RNDocument / RNBody(Fabric 提交)在本文件,RNBody extends RNNode。
import {
  RNNode,
  RNTextNode,
  RNCommentNode,
  RNDocumentFragment,
  FABRIC_NODE,
  FABRIC_NODE_ID,
  getFabricUIManager,
  getInstanceMap,
  registerInInstanceMap,
  unregisterFromInstanceMap,
  allocateTag,
  resetTagCounter as resetTagCounterBase,
  _focusNode,
  _blurFocusedNode,
  getFocusedNode,
  type InstanceHandle,
  type RNDomInternalNode,
} from './node'

export { RNNode, RNTextNode, RNCommentNode, RNDocumentFragment, FABRIC_NODE, FABRIC_NODE_ID }

// ────────────────────────────────────────────────────────────────────────────
// Lazy Fabric View Config Registration
//
// Import the ensure() function from elements.cjs. This module-level import
// compiles to `require("@rasenjs/rn-dom/elements")` which Metro statically
// traces, bundling elements.cjs and all its literal require() calls.
//
// The require() calls inside elements.cjs are wrapped in a switch function
// and only execute when ensure() is called — i.e. on first use of each
// component tag. This gives us lazy registration with eager bundling.
// ────────────────────────────────────────────────────────────────────────────
import { ensure } from '@rasenjs/rn-dom/elements'

/**
 * Shape of a partial view config — matches React Native's PartialViewConfig
 * (see react-native/Libraries/Renderer/shims/ReactNativeTypes.js).
 * rn-dom does not ship built-in configs for any native component. The host
 * (e.g. an example app) imports `__INTERNAL_VIEW_CONFIG` from RN's
 * NativeComponent modules and passes it to `registerComponent`.
 */
export type PartialViewConfig = {
  uiViewClassName: string
  validAttributes?: Record<string, unknown>
  bubblingEventTypes?: Record<string, unknown>
  directEventTypes?: Record<string, unknown>
  Commands?: Record<string, unknown>
}

/**
 * Register a native component with Fabric's view config registry.
 *
 * This is the standard RN mechanism: it merges the partial config with
 * PlatformBaseViewConfig (which provides `style: ReactNativeStyleAttributes`
 * and the platform's event tables), then registers the result under `name`
 * so that Fabric can resolve it during `createAttributePayload` /
 * `cloneNodeWithNewProps`.
 *
 * Typical usage in an example entry file:
 *
 *   const ViewCfg = require('react-native/Libraries/Components/View/ViewNativeComponent').__INTERNAL_VIEW_CONFIG
 *   const TextCfg = require('react-native/Libraries/Text/TextNativeComponent')
 *   registerComponent('RCTView', ViewCfg)
 *   registerComponent('RCTText', TextCfg.__INTERNAL_VIEW_CONFIG) // if exported
 *
 * If the host does not call this for a component, `doc.createElement('X')`
 * will throw at render time when Fabric cannot resolve the view config.
 */
// Reserved for a future release where the host can supply per-component
// event tables / extra validAttributes. Today bringing up a native
// component is a single call to `requireNativeComponent(name)` from
// 'react-native' (for components whose modules aren't reachable via
// the public `react-native` getters) or a touch of the public getter
// (e.g. `require('react-native').Image` for Image). See the example
// entry file for the actual recipe.
export function registerComponent(
  _name: string,
  _partial: PartialViewConfig,
): void {
  // No-op for now. The two valid bring-up paths in the example do not
  // route through here; this signature is preserved so future versions
  // can accept custom partial configs without an API break.
}

// ============================================================================
// Tag Counter
// ============================================================================

// nextReactTag / allocateTag 已移至 node.ts(节点类也需 allocateTag)。
// 这里 re-export 并叠加 event-system 状态重置。

export function resetTagCounter(): void {
  resetTagCounterBase()
  resetPressState()
  resetModalBridge()
}

// ============================================================================
// RNDocument (simulates document)
// ============================================================================

export class RNDocument {
  // DOM-like public API
  readonly body: RNBody
  /** Collection of registered CSSStyleSheet entries. */
  readonly styleSheets: StyleSheetList = new StyleSheetList()
  
  /**
   * Get React Native Private Interface
   * Direct access to ReactNativePrivateInterface for advanced use cases
   */
  get reactNativePrivateInterface(): unknown {
    return ReactNativePrivateInterface
  }
  
  // Internal RN-specific fields
  private readonly _rnRootTag: Container
  
  // Get root tag for internal use
  get rootTag(): Container {
    return this._rnRootTag
  }
  
  // Singleton instance
  private static _instance: RNDocument | null = null
  
  /**
   * Private constructor - use getOrCreate() instead
   */
  private constructor(rootTag: Container) {
    this._rnRootTag = rootTag
    
    // Initialize event system internally
    this._rnInitEventSystem()
    
    // Create body as the root container (RNBody class)
    this.body = new RNBody(rootTag, this)
  }
  
  /**
   * Get or create singleton RNDocument instance
   * 
   * @param rootTag - Root container tag (required on first call)
   * @returns Singleton RNDocument instance
   */
  static getOrCreate(rootTag?: Container): RNDocument {
    if (!RNDocument._instance) {
      if (rootTag === undefined) {
        throw new Error('[RNDOM] RNDocument.getOrCreate() requires rootTag on first call')
      }
      RNDocument._instance = new RNDocument(rootTag)
    }
    return RNDocument._instance
  }
  
  /**
   * Reset singleton instance (for development/hot reload)
   */
  static reset(): void {
    RNDocument._instance = null
  }

  // Cache: tagName → nativeName registry lookup result.
  // Third-party components register with their own name (e.g. 'RNCSafeAreaView'),
  // RN built-ins are resolved by ensure() which knows the exact Fabric name.
  private static __RN_nativeNameCache = new Map<string, { name: string, config: unknown }>()

  private ___RN_resolveNativeName(tagName: string): { name: string, config: unknown } {
    const cached = RNDocument.__RN_nativeNameCache.get(tagName)
    if (cached) return cached

    const registry = ReactNativePrivateInterface.ReactNativeViewConfigRegistry
    const result = (() => {
      // 1. As-is: third-party components (RNCSafeAreaView, AIRMap…) and tags
      //    whose JSX name already matches their Fabric name. Platform-ambiguous
      //    built-ins are skipped so they go through ensure() below.
      if (!isPlatformAmbiguous(tagName)) {
        try { const c = registry.get(tagName); return { name: tagName, config: c } } catch { /* not found */ }
      }

      // 2. Lazy auto-registration: ensure() knows the exact Fabric name for
      //    every built-in RN component. No guessing with RCT prefixes needed.
      const nativeName = ensure(tagName, Platform.OS === 'android')
      if (nativeName) {
        try { const c = registry.get(nativeName); return { name: nativeName, config: c } } catch { /* registered but not yet resolvable */ }
      }

      throw new Error(
        `[RNDOM] ViewConfig not registered for "${tagName}". ` +
        `For third-party components, import the JS module in your entry file.`,
      )
    })()

    RNDocument.__RN_nativeNameCache.set(tagName, result)
    return result
  }

  /**
   * Create a Fabric element. Mirrors DOM's document.createElement(tagName).
   *
   * Props are set via setAttribute() / style.setProperty() after creation.
   * On first mount, __RN_getFabricNode builds the complete Fabric payload
   * from the accumulated __RN_currentProps.
   *
   * For known RN tags, the return type provides prop autocomplete:
   *   const v = doc.createElement('View')  // → RNNode with RNViewProps awareness
   *   const t = doc.createElement('Text')  // → RNNode with RNTextProps awareness
   *   const x = doc.createElement('Custom') // → RNNode (untyped fallback)
   *
   * Known tags resolve to their tag-specific subclass (see ./elements/*)
   * via the element registry; unknown tags fall back to the base RNNode.
   */
  createElement<K extends keyof RNElementPropMap>(tagName: K): RNNode
  createElement(tagName: string): RNNode
  createElement(tagName: string): RNNode {
    const tag = allocateTag()
    const { name: nativeName, config: viewConfig } = this.___RN_resolveNativeName(tagName)
    const validAttrs = (viewConfig as Record<string, unknown>)?.validAttributes as Record<string, unknown> ?? {}
    const node = createElementNode(tagName, tag, nativeName, validAttrs, this)
    getInstanceMap().set(tag, node)
    return node
  }
  
  createTextNode(text: string): RNTextNode {
    const tag = allocateTag()

    // Note: React Native's renderer hardcodes the 'RCTRawText' view name and
    // calls Fabric's createNode directly with `{ text }` — it does NOT look
    // up a view config. We follow the same approach and skip the registry
    // lookup entirely for text nodes, so the host doesn't need to register
    // RCTRawText just to render text.
    const instanceHandle: InstanceHandle = { tag, stateNode: null }
    
    // Call createNode to register the node with Fabric
    const fabricNode = getFabricUIManager().createNode(
      tag,
      'RCTRawText',
      this._rnRootTag,
      { text },
      instanceHandle
    )

    const textNode = new RNTextNode(fabricNode, text, this)
    instanceHandle.stateNode = textNode

    return textNode
  }
  
  createComment(data: string = ''): RNCommentNode {
    // Comment nodes are VIRTUAL markers, not real Fabric nodes.
    // They only exist in our JS DOM abstraction for use by each/when/match.
    // Uses __RN_children (same as RNNode) for consistency with sibling traversal
    // and recursive helpers like registerInInstanceMap.
    const children: (RNNode | RNTextNode | RNCommentNode)[] = []

    const comment = {
      nodeType: 8 as const,
      nodeName: '#comment' as const,
      // 非 plain object 标记(同 RNNode,防 Vue 代理)。
      [Symbol.toStringTag]: 'RNComment',
      nodeValue: data,
      data: data,
      textContent: data,
      ownerDocument: this,
      parentNode: null as RNNode | null,
      __RN_children: children,
      [FABRIC_NODE]: null as FabricNode,
      [FABRIC_NODE_ID]: -1,

      get childNodes(): (RNNode | RNTextNode | RNCommentNode)[] {
        return this.__RN_children
      },

      get nextSibling(): RNNode | RNTextNode | RNCommentNode | null {
        if (!this.parentNode) return null
        const siblings = (this.parentNode as unknown as RNDomInternalNode).__RN_children
        const idx = siblings.indexOf(this as unknown as RNCommentNode)
        if (idx === -1 || idx >= siblings.length - 1) return null
        return siblings[idx + 1]
      },

      get previousSibling(): RNNode | RNTextNode | RNCommentNode | null {
        if (!this.parentNode) return null
        const siblings = (this.parentNode as unknown as RNDomInternalNode).__RN_children
        const idx = siblings.indexOf(this as unknown as RNCommentNode)
        if (idx <= 0) return null
        return siblings[idx - 1]
      },

      appendChild(child: RNNode | RNTextNode | RNCommentNode) {
        child.parentNode = this as unknown as RNNode
        this.__RN_children.push(child)
        return child
      },
      removeChild(child: RNNode | RNTextNode | RNCommentNode) {
        const idx = this.__RN_children.indexOf(child)
        if (idx >= 0) this.__RN_children.splice(idx, 1)
        unregisterFromInstanceMap(child)
        return child
      },
      insertBefore(newChild: RNNode | RNTextNode | RNCommentNode, refChild: RNNode | RNTextNode | RNCommentNode) {
        const idx = refChild ? this.__RN_children.indexOf(refChild) : -1
        if (idx >= 0) {
          this.__RN_children.splice(idx, 0, newChild)
        } else {
          this.__RN_children.push(newChild)
        }
        return newChild
      },
      cloneNode() { return this.ownerDocument.createComment(this.data) },

      remove() { this.parentNode?.removeChild(this as unknown as RNCommentNode) },
      after(...nodes: (RNNode | RNTextNode | RNCommentNode)[]) {
        const parent = this.parentNode
        if (!parent) return
        const ref = this.nextSibling
        for (const node of nodes) parent.insertBefore(node, ref)
      },
      before(...nodes: (RNNode | RNTextNode | RNCommentNode)[]) {
        const parent = this.parentNode
        if (!parent) return
        for (const node of nodes) parent.insertBefore(node, this as unknown as RNCommentNode)
      },
      replaceWith(...nodes: (RNNode | RNTextNode | RNCommentNode)[]) {
        const parent = this.parentNode
        if (!parent) return
        for (const node of nodes) parent.insertBefore(node, this as unknown as RNCommentNode)
        parent.removeChild(this as unknown as RNCommentNode)
      },
    }

    return comment as RNCommentNode
  }

  /**
   * Create a DocumentFragment-like container for batch insertion.
   *
   * Children appended to the fragment are registered in the instance map
   * (unlike comment markers), and `flush` moves them to the target parent.
   *
   * Usage:
   *   const frag = doc.createDocumentFragment()
   *   frag.appendChild(child1)
   *   frag.flush(parent, beforeNode) // moves children to parent
   */
  createDocumentFragment(): RNDocumentFragment {
    const frag = new RNDocumentFragment(this)
    return frag
  }

  private _rnInitEventSystem(): void {
    // 每次 RNDocument 都注册:registerEventHandler 是幂等的(C++ 覆盖旧 handler)。
    // 不能靠全局标记跳过 —— Fast Refresh / 二次挂载时全局残留会导致新 JS
    // 上下文事件到不了(旧 dispatch 绑定旧 instance map)。iOS 尤其明显。
    const uim = getFabricUIManager()
    if (uim.registerEventHandler) {
      const dispatch = createDispatcher({
        getNodeByTag: (tag) => (getInstanceMap().get(tag) ?? null) as EventNode | null,
        focusNode: (node) => _focusNode(node as unknown as RNNode),
        blurFocusedNode: () => _blurFocusedNode(),
        getFocusedNode: () => getFocusedNode() as EventNode | null,
        measure: (node, cb) => measure(node as unknown as RNNode, cb),
        getViewConfig: (node) => {
          try {
            return ReactNativePrivateInterface.ReactNativeViewConfigRegistry.get(node.__RN_nativeName) as Record<string, unknown>
          } catch { return undefined }
        },
        getFabricUIManager,
      })
      uim.registerEventHandler(dispatch as (instanceHandle: object, type: string, payload: Record<string, unknown>) => void)
    }
  }
}

// ============================================================================
// Element registry — tag → subclass instantiation
//
// Per-tag JS-layer behavior (props transforms now, events/children later)
// lives in ./elements/*. createElementNode() resolves the subclass for a tag
// and constructs it with the resolved native name + valid attrs.
// ============================================================================

import { getElementClass } from './elements/registry'

function createElementNode(
  tagName: string,
  tag: number,
  nativeName: string,
  validAttrs: Record<string, unknown>,
  ownerDocument: RNDocument,
): RNNode {
  const Klass = getElementClass(tagName)
  const node = new Klass(
    null as unknown as FabricNode,  // placeholder; replaced in __RN_getFabricNode
    tag,
    tagName,
    {},
    ownerDocument,
  )
  // 内部字段(protected)经内部接口访问。
  const n = node as unknown as RNDomInternalNode
  n.__RN_nativeName = nativeName
  n.__RN_lastValidAttrs = validAttrs
  n.__RN_instanceHandle = { tag, stateNode: node }
  // 节点保持可扩展:Vue 自定义渲染器需要把运行时字段(如 __vnode)挂到宿主
  // 元素上,preventExtensions 会挡掉 Object.defineProperty 新增属性。
  return node
}

// ============================================================================
// RNBody (body 是 root 的概念，继承 RNBody)
// ============================================================================

// ScrollView 的 content container 包装已收进 RNScrollViewElement.__RN_buildChildren
// (src/elements/ScrollViewElement.ts),这里不再需要 isScrollContainer。
// mount-time 原生名覆盖(TextInput multiline / Text selectable/嵌套)已收进
// 各节点类的 __RN_resolveNativeName() hook(见 RNTextElement / RNTextInputElement)。

/**
 * RNBody represents the document.body which is the root container
 * It manages batched updates using dirty flag propagation
 */
export class RNBody extends RNNode {
  // Flag to prevent multiple RAF scheduling
  // (internal.scheduleFlush 经 RNDomInternalNode 接口读写)
  protected __RN_flushScheduled = false

  constructor(rootTag: Container, ownerDocument: RNDocument) {
    super(
      null as FabricNode,
      rootTag,
      'Body',
      {},
      ownerDocument
    )
    // Body is the root container — always "mounted" so children additions
    // trigger __RN_scheduleFlush() → __RN_submitToRoot() → Fabric completeRoot.
    this.__RN_mounted = true
  }

  // Use inherited __RN_markChildrenDirty / removeChild from RNNode.
  // __RN_markDirty 经 internal.markDirty → internal.scheduleFlush 调度。

  protected __RN_flushGeneration = 0

}

// ============================================================================
// Public Native Commands (standalone helpers for RN-specific APIs)
// ============================================================================

/**
 * Dispatch a command to a native component (e.g. 'scrollTo', 'measure').
 * For DOM-standard focus/blur, use node.focus() / node.blur() instead.
 *
 * @example
 *   dispatchCommand(scrollViewNode, 'scrollTo', [{ x: 0, y: 100, animated: true }])
 */
export function dispatchCommand(
  node: RNNode,
  commandName: string,
  args: unknown[],
): void {
  try {
    const uim = getFabricUIManager()
    const n = node as unknown as RNDomInternalNode
    // 优先用挂载节点的 shadowNode（FABRIC_NODE）。对 DebuggingOverlay 等
    // findShadowNodeByTag_DEPRECATED 拿不到的节点（返回 null）也有效。
    const shadowNode =
      n[FABRIC_NODE] ?? uim.findShadowNodeByTag_DEPRECATED?.(n[FABRIC_NODE_ID])
    if (shadowNode && uim.dispatchCommand) {
      uim.dispatchCommand(shadowNode, commandName, args)
    }
  } catch (_) { /* dispatchCommand unavailable */ }
}

/**
 * Send an accessibility event to a native component.
 *
 * @example
 *   sendAccessibilityEvent(viewNode, 'layoutChanged')
 */
export function sendAccessibilityEvent(
  node: RNNode,
  eventType: string,
): void {
  try {
    const uim = getFabricUIManager()
    const n = node as unknown as RNDomInternalNode
    const tag = n[FABRIC_NODE_ID]
    const shadowNode = uim.findShadowNodeByTag_DEPRECATED?.(tag)
    if (shadowNode && uim.sendAccessibilityEvent) {
      uim.sendAccessibilityEvent(shadowNode, eventType)
    }
  } catch (_) { /* sendAccessibilityEvent unavailable */ }
}

/**
 * Get the Fabric node tag (number) for a node.
 * Mirrors React Native's findNodeHandle().
 *
 * @example
 *   const tag = findNodeHandle(myView)
 */
export function findNodeHandle(node: unknown): number | null {
  if (!node) return null
  if (typeof node === 'object' && node !== null && Symbol.for('fabricNodeId') in (node as Record<symbol, unknown>)) {
    return (node as Record<symbol, number>)[Symbol.for('fabricNodeId')]
  }
  return null
}

// ============================================================================
// RN 组件命令(非 DOM 标准 → 不挂实例,对外导出为独立函数)
//
// 符合 DOM 标准的命令(focus / blur / scrollTo)保留在节点实例上;
// 以下 RN 特有命令(RN 组件 ref 方法)以独立函数公开:
//   measure(node, cb)             — 布局测量
//   clear(node) / setSelection    — TextInput
//   setSwitchValue(node, v)       — Switch
//   scrollToEnd / flashScrollIndicators — ScrollView
// ============================================================================

/**
 * Measure the native element's layout (RN-specific; DOM uses
 * getBoundingClientRect). Callback: (left, top, width, height, pageX, pageY).
 * Falls back to zeros when Fabric measurement is unavailable — press still
 * works, only press-rect exit checks degrade.
 */
export function measure(
  node: RNNode,
  callback: (left: number, top: number, width: number, height: number, pageX: number, pageY: number) => void,
): void {
  try {
    const uim = getFabricUIManager()
    const n = node as unknown as RNDomInternalNode
    if (typeof uim.measure === 'function' && typeof uim.findShadowNodeByTag_DEPRECATED === 'function') {
      const shadowNode = uim.findShadowNodeByTag_DEPRECATED(n[FABRIC_NODE_ID])
      if (shadowNode) {
        uim.measure(shadowNode, callback)
        return
      }
    }
  } catch (_) { /* fall through to zero callback */ }
  callback(0, 0, 0, 0, 0, 0)
}

/** Clear the TextInput's text (RN TextInput.clear). */
export function clear(node: RNNode): void {
  const n = node as unknown as { __RN_textInputState: { eventCount: number } | null }
  dispatchCommand(node, 'setTextAndSelection', [n.__RN_textInputState?.eventCount ?? 0, '', 0, 0])
}

/** Move the TextInput's selection (start/end indices) — RN setSelection. */
export function setSelection(node: RNNode, start: number, end: number): void {
  const n = node as unknown as { __RN_textInputState: { eventCount: number } | null }
  dispatchCommand(node, 'setTextAndSelection', [n.__RN_textInputState?.eventCount ?? 0, null, start, end])
}

/** Force the native Switch to the given on/off (Android setNativeValue / iOS setValue). */
export function setSwitchValue(node: RNNode, value: boolean): void {
  dispatchCommand(node, Platform.OS === 'android' ? 'setNativeValue' : 'setValue', [value])
}

/** Scroll to the end (bottom/right), animated by default (RN scrollToEnd). */
export function scrollToEnd(node: RNNode, animated = true): void {
  dispatchCommand(node, 'scrollToEnd', [animated])
}

/** @platform ios - momentarily display the scroll indicators (RN flashScrollIndicators). */
export function flashScrollIndicators(node: RNNode): void {
  dispatchCommand(node, 'flashScrollIndicators', [])
}

/**
 * @platform ios - zoom the ScrollView to a rect (RN ScrollViewCommands.zoomToRect).
 * rect 形如 { x, y, width, height }(坐标相对内容区);animated 默认 true。
 */
export function zoomToRect(node: RNNode, rect: object, animated = true): void {
  dispatchCommand(node, 'zoomToRect', [rect, animated !== false])
}

/** @platform android - 打开 DrawerLayoutAndroid 抽屉(RN DrawerLayoutAndroid.openDrawer)。 */
export function openDrawer(node: RNNode): void {
  dispatchCommand(node, 'openDrawer', [])
}

/** @platform android - 关闭 DrawerLayoutAndroid 抽屉(RN DrawerLayoutAndroid.closeDrawer)。 */
export function closeDrawer(node: RNNode): void {
  dispatchCommand(node, 'closeDrawer', [])
}

// ============================================================================
// CSSStyleSheet — lightweight style rule container
// ============================================================================

export class CSSStyleSheet {
  /** The CSS selector this rule targets (e.g. '.card', '#header'). */
  selectorText: string
  /** The resolved RN style object (frozen). */
  style: Record<string, unknown>
  /** Empty array — matches DOM CSSRuleList shape but we don't parse CSS text. */
  cssRules: never[] = []

  constructor(selectorText: string, style: Record<string, unknown>) {
    this.selectorText = selectorText
    this.style = Object.freeze({ ...style })
  }
}

// ============================================================================
// StyleSheetList — collection of CSSStyleSheet entries on document
// ============================================================================

export class StyleSheetList {
  _sheets: CSSStyleSheet[] = []

  get length(): number { return this._sheets.length }

  item(index: number): CSSStyleSheet | undefined { return this._sheets[index] }

  [index: number]: CSSStyleSheet | undefined

  /** Internal: look up a class name across all registered sheets.
   *  Prepends '.' to match CSS selector format (.card). */
  _getStyle(className: string): Record<string, unknown> | undefined {
    const selector = '.' + className
    for (const sheet of this._sheets) {
      if (sheet.selectorText === selector) return sheet.style
    }
    return undefined
  }

  [Symbol.iterator](): IterableIterator<CSSStyleSheet> {
    return this._sheets[Symbol.iterator]()
  }
}

// ============================================================================
// StyleSheet — static API matching RN's StyleSheet.create()
// ============================================================================

export const StyleSheet = {
  /**
   * Register style rules and return the class names for use with classList.
   *
   * Each key becomes a CSSStyleSheet entry auto-registered on
   * `document.styleSheets`. Keys should be CSS selectors (e.g. '.card'),
   * though bare names are auto-converted for convenience.
   * The returned object maps keys to class name strings (without dot)
   * that can be used with `el.classList.add(...)`.
   *
   * @example
   *   const s = StyleSheet.create({ '.card': { flex: 1 } })
   *   el.classList.add(s['.card']) // 'card'
   */
  create<T extends Record<string, Record<string, unknown>>>(
    styles: T,
    doc?: RNDocument,
  ): { [K in keyof T]: string } {
    const result = {} as { [K in keyof T]: string }
    const styleSheets = doc?.styleSheets
    for (const [key, rules] of Object.entries(styles)) {
      const selector = key.startsWith('.') || key.startsWith('#') ? key : '.' + key
      const sheet = new CSSStyleSheet(selector, rules)
      ;(result as Record<string, string>)[key] = selector.startsWith('.') ? selector.slice(1) : selector
      styleSheets?._sheets.push(sheet)
    }
    return result
  },

  /**
   * The hairline width (1 device pixel) — always 1 for Fabric.
   * In web this is `1 / devicePixelRatio`.
   */
  hairlineWidth: 1,
}

// ============================================================================
// Class Style Resolution (called during flush)
// ============================================================================

// classList 样式解析已收进 RNNode.__RN_resolveClassStyles()(src/node.ts),
// RNBody.__RN_getFabricNode 经内部接口调用。

export function mountToContainer(
  rootTag: Container,
  ...nodes: (RNNode | RNTextNode | RNCommentNode)[]
): void {
  const childSet = getFabricUIManager().createChildSet()
  for (const node of nodes) {
    const n = node as unknown as RNDomInternalNode
    getFabricUIManager().appendChildToSet(childSet, n[FABRIC_NODE])
    registerInInstanceMap(node)
  }
  getFabricUIManager().completeRoot(rootTag, childSet)
}

// Export Host type alias
export type Host = RNNode

// re-export imperative setNativeProps (RN legacy, internal.ts module function)
export { setNativeProps } from './internal'
