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
  normalizeProps,
  isPlatformAmbiguous,
  type RNEvent,
  type RNStyle,
  type RNElementPropMap,
  type ElementProps,
  type RNElementPropName,
} from '@rasenjs/rn-dom/elements'

export { RN_BUILT_IN_TAGS, isRNBuiltIn, getAllTags, normalizeProps, isPlatformAmbiguous }
export type { RNEvent, RNStyle, RNElementPropMap, ElementProps, RNElementPropName }

// ============================================================================
// Fabric Interop
// ============================================================================

export type Container = number
export type Props = Record<string, unknown>

import ReactNativePrivateInterface from 'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface'
import { Platform } from 'react-native'
import type { FabricNode, FabricUIManager } from './fabric-global'
import { createDispatcher, resetPressState, resetModalBridge, registerModalNode, unregisterModalNode, type EventNode } from './event-system'

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

/**
 * Pass-through props. `createAttributePayload` (RN) does the real work:
 * for each key it looks up the attribute config and applies `process` /
 * `diff` / recursion. We just clone the top-level object to keep mutations
 * local.
 */
function prepareFabricProps(
  tagName: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  // Delegate per-component prop transforms (RN JS-layer semantics such as
  // Image source → [{ uri }] and Android ActivityIndicator styleAttr defaults)
  // to the elements module — the single home for component-native adaptation.
  // Always shallow-clone so mutations stay local to this payload build.
  return normalizeProps(tagName, { ...props }, Platform.OS === 'android')!
}

/**
 * Build a FULL Fabric payload from component props (first-time init).
 * Delegates to RN's `createAttributePayload` which flattens `style` into
 * individual top-level keys and runs `processCallbacks` (e.g. `processColor`).
 *
 * Event handlers (onXxx) are stored in currentProps as functions but sent to
 * Fabric as boolean `true` markers. `createAttributePayload` handles this
 * for known attributes, but we also inject any missing onXxx markers to
 * ensure Fabric dispatches events back to JS.
 */
function buildFabricPayload(
  props: Record<string, unknown>,
  validAttrs: Record<string, unknown>,
): Record<string, unknown> | null {
  const result = ReactNativePrivateInterface.createAttributePayload(props, validAttrs)
  const payload = result ?? {}
  const added = injectEventMarkers(props, payload)
  return (result !== null || added) ? payload : null
}

/** Ensure all onXxx props appear as boolean `true` markers in the payload.
 *  Returns true if any marker was added. */
function injectEventMarkers(
  props: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  let added = false
  for (const key in props) {
    if (key.length > 2 && key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
      if (!(key in payload)) {
        payload[key] = true
        added = true
      }
    }
  }
  return added
}

/**
 * Build an INCREMENTAL Fabric payload by diffing prevProps vs currentProps.
 * Only properties that actually changed are included, matching React's own
 * commit path. Callers MUST update `_propsSnapshot` after applying.
 */
function diffFabricPayload(
  prevProps: Record<string, unknown>,
  nextProps: Record<string, unknown>,
  validAttrs: Record<string, unknown>,
): Record<string, unknown> | null {
  const result = ReactNativePrivateInterface.diffAttributePayloads(prevProps, nextProps, validAttrs)
  const payload = result ?? {}
  const added = injectEventMarkers(nextProps, payload)
  return (result !== null || added) ? payload : null
}

function getFabricUIManager(): FabricUIManager {
  if (!nativeFabricUIManager) {
    throw new Error('[RNDOM] nativeFabricUIManager not available')
  }
  return nativeFabricUIManager!
}

// Instance handle for Fabric nodes
interface InstanceHandle {
  tag: number
  stateNode: unknown
}

// ============================================================================
// Tag Counter
// ============================================================================

let nextReactTag = 2

function allocateTag(): number {
  const tag = nextReactTag
  nextReactTag += 2
  return tag
}

export function resetTagCounter(): void {
  nextReactTag = 2
  resetPressState()
  resetModalBridge()
}

// ============================================================================
// Symbol Keys (Internal Implementation)
// ============================================================================

const FABRIC_NODE = Symbol.for('fabricNode')
const FABRIC_NODE_ID = Symbol.for('fabricNodeId')

/**
 * Lightweight DOMTokenList implementation backed by a Set.
 * Used by RNNode.classList.
 */
class RASENTokenList {
  _tokens: Set<string>
  _onChange: () => void

  constructor(tokens: Set<string>, onChange: () => void) {
    this._tokens = tokens
    this._onChange = onChange
  }

  get length(): number { return this._tokens.size }

  get value(): string { return [...this._tokens].join(' ') }

  contains(token: string): boolean { return this._tokens.has(token) }

  add(...values: string[]): void {
    let changed = false
    for (const v of values) {
      if (!this._tokens.has(v)) { this._tokens.add(v); changed = true }
    }
    if (changed) this._onChange()
  }

  remove(...values: string[]): void {
    let changed = false
    for (const v of values) { if (this._tokens.delete(v)) changed = true }
    if (changed) this._onChange()
  }

  toggle(token: string, force?: boolean): boolean {
    if (force !== undefined) {
      if (force) { this._tokens.add(token); this._onChange(); return true }
      this._tokens.delete(token); this._onChange(); return false
    }
    if (this._tokens.has(token)) { this._tokens.delete(token); this._onChange(); return false }
    this._tokens.add(token); this._onChange(); return true
  }

  replace(oldToken: string, newToken: string): boolean {
    if (!this._tokens.has(oldToken)) return false
    this._tokens.delete(oldToken); this._tokens.add(newToken); this._onChange(); return true
  }

  item(index: number): string | null {
    let i = 0
    for (const t of this._tokens) { if (i++ === index) return t }
    return null
  }

  entries(): IterableIterator<[number, string]> {
    const arr = [...this._tokens]
    return arr.entries() as IterableIterator<[number, string]>
  }

  keys(): IterableIterator<number> {
    const arr = [...this._tokens]
    return arr.keys() as IterableIterator<number>
  }

  values(): IterableIterator<string> {
    return this._tokens[Symbol.iterator]()
  }

  forEach(fn: (value: string, key: number, parent: RASENTokenList) => void): void {
    let i = 0
    for (const t of this._tokens) fn(t, i++, this)
  }

  [Symbol.iterator](): IterableIterator<string> {
    return this._tokens[Symbol.iterator]()
  }
}

/**
 * Create a style object with setProperty and removeProperty methods.
 * This provides a DOM-like style interface.
 *
 * IMPORTANT: setProperty/removeProperty must produce a NEW style object
 * reference each time, because _propsSnapshot stores a shallow copy of
 * currentProps. If we mutate in-place, _propsSnapshot.style and
 * currentProps.style point to the same object, and RN's
 * diffAttributePayloads sees no change — skipping the Fabric update.
 */
function createStyleObject(element: RNNode) {
  return {
    setProperty(property: string, value: unknown): void {
      const oldStyle = element.currentProps.style as Record<string, unknown> | undefined
      element.currentProps = {
        ...element.currentProps,
        style: { ...(oldStyle ?? {}), [property]: value },
      }
      element._requestUpdate()
    },

    removeProperty(property: string): void {
      const currentStyle = element.currentProps.style as Record<string, unknown> | undefined
      if (currentStyle && property in currentStyle) {
        const rest = { ...currentStyle }
      delete rest[property]
        // Manual empty-check avoids Object.keys().length array allocation
        let empty = true
        for (const _ in rest) { empty = false; break }
        element.currentProps = {
          ...element.currentProps,
          style: empty ? {} : rest,
        }
        element._requestUpdate()
      }
    },

    getPropertyValue(property: string): unknown {
      const currentStyle = (element.currentProps.style || {}) as Record<string, unknown>
      return currentStyle[property]
    }
  }
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
  private static _nativeNameCache = new Map<string, { name: string, config: unknown }>()

  private _resolveNativeName(tagName: string): { name: string, config: unknown } {
    const cached = RNDocument._nativeNameCache.get(tagName)
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

    RNDocument._nativeNameCache.set(tagName, result)
    return result
  }

  /**
   * Create a Fabric element. Mirrors DOM's document.createElement(tagName).
   *
   * Props are set via setAttribute() / style.setProperty() after creation.
   * On first mount, _getFabricNode builds the complete Fabric payload
   * from the accumulated currentProps.
   *
   * For known RN tags, the return type provides prop autocomplete:
   *   const v = doc.createElement('View')  // → RNNode with RNViewProps awareness
   *   const t = doc.createElement('Text')  // → RNNode with RNTextProps awareness
   *   const x = doc.createElement('Custom') // → RNNode (untyped fallback)
   */
  createElement<K extends keyof RNElementPropMap>(tagName: K): RNNode
  createElement(tagName: string): RNNode
  createElement(tagName: string): RNNode {
    const tag = allocateTag()
    const { name: nativeName, config: viewConfig } = this._resolveNativeName(tagName)
    const validAttrs = (viewConfig as Record<string, unknown>)?.validAttributes as Record<string, unknown> ?? {}
    const node = new RNNode(
      null as unknown as FabricNode,  // placeholder; replaced in _getFabricNode
      tag,
      tagName,
      {},
      this
    )
    node._nativeName = nativeName
    node._lastValidAttrs = validAttrs
    node._instanceHandle = { tag, stateNode: node }
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
    // Uses _children (same as RNNode) for consistency with sibling traversal
    // and recursive helpers like registerInInstanceMap.
    const children: (RNNode | RNTextNode | RNCommentNode)[] = []

    const comment = {
      nodeType: 8 as const,
      nodeName: '#comment' as const,
      nodeValue: data,
      data: data,
      textContent: data,
      ownerDocument: this,
      parentNode: null as RNNode | null,
      _children: children,
      [FABRIC_NODE]: null as FabricNode,
      [FABRIC_NODE_ID]: -1,

      get childNodes(): (RNNode | RNTextNode | RNCommentNode)[] {
        return this._children
      },

      get nextSibling(): RNNode | RNTextNode | RNCommentNode | null {
        if (!this.parentNode) return null
        const siblings = this.parentNode._children
        const idx = siblings.indexOf(this as unknown as RNCommentNode)
        if (idx === -1 || idx >= siblings.length - 1) return null
        return siblings[idx + 1]
      },

      get previousSibling(): RNNode | RNTextNode | RNCommentNode | null {
        if (!this.parentNode) return null
        const siblings = this.parentNode._children
        const idx = siblings.indexOf(this as unknown as RNCommentNode)
        if (idx <= 0) return null
        return siblings[idx - 1]
      },

      appendChild(child: RNNode | RNTextNode | RNCommentNode) {
        child.parentNode = this as unknown as RNNode
        this._children.push(child)
        return child
      },
      removeChild(child: RNNode | RNTextNode | RNCommentNode) {
        const idx = this._children.indexOf(child)
        if (idx >= 0) this._children.splice(idx, 1)
        unregisterFromInstanceMap(child)
        return child
      },
      insertBefore(newChild: RNNode | RNTextNode | RNCommentNode, refChild: RNNode | RNTextNode | RNCommentNode) {
        const idx = refChild ? this._children.indexOf(refChild) : -1
        if (idx >= 0) {
          this._children.splice(idx, 0, newChild)
        } else {
          this._children.push(newChild)
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
    return new RNDocumentFragment(this)
  }

  private _rnInitEventSystem(): void {
    const g = globalThis as Record<string, unknown>
    const HANDLER_KEY = '__RASEN_EVENT_HANDLER_REGISTERED__'

    if (g[HANDLER_KEY] === true) return

    const uim = getFabricUIManager()
    if (uim.registerEventHandler) {
      const dispatch = createDispatcher({
        getNodeByTag: (tag) => (getInstanceMap().get(tag) ?? null) as EventNode | null,
        focusNode: (node) => _focusNode(node as RNNode),
        blurFocusedNode: () => _blurFocusedNode(),
        getFocusedNode: () => _focusedNode as EventNode | null,
        measure: (node, cb) => (node as RNNode).measure(cb),
        getViewConfig: (node) => {
          try {
            return ReactNativePrivateInterface.ReactNativeViewConfigRegistry.get(node._nativeName) as Record<string, unknown>
          } catch { return undefined }
        },
        getFabricUIManager,
      })
      uim.registerEventHandler(dispatch as (instanceHandle: object, type: string, payload: Record<string, unknown>) => void)
      g[HANDLER_KEY] = true
    }
  }
}

// ============================================================================
// RNNode (模拟 Element)
// ============================================================================

/**
 * RNNode - DOM-like node for React Native Fabric
 *
 * Internal implementation details are encapsulated:
 * - Fabric node management via Symbols
 * - Dirty flag tracking for batched updates
 * - Children tracking for efficient updates
 *
 * Public API mimics DOM Element interface.
 */
export class RNNode {
  // =========================================================================
  // Internal Fabric fields (hidden via Symbols - not enumerable)
  // =========================================================================
  [FABRIC_NODE]: FabricNode
  [FABRIC_NODE_ID]: number

  // =========================================================================
  // Public DOM-like properties
  // =========================================================================
  readonly nodeName = 'Element' as const
  readonly tagName: string
  readonly nodeType = 1 as const  // Element node
  readonly ownerDocument: RNDocument
  readonly style: ReturnType<typeof createStyleObject>

  currentProps: Props
  parentNode: RNNode | null = null

  // =========================================================================
  // DOM Class List API
  // =========================================================================

  /**
   * Get the class list as a DOMTokenList-like object.
   * Lazily allocates the underlying Set on first access.
   */
  get classList(): RASENTokenList {
    if (!this._classList) this._classList = new Set()
    return new RASENTokenList(this._classList, () => {
      if (this._mounted) this._markDirty('props', 'class')
    })
  }

  /**
   * Get/set the className string (DOM-compatible alias for classList).
   */
  get className(): string {
    return this._classList ? [...this._classList].join(' ') : ''
  }

  set className(value: string) {
    const names = value.trim().split(/\s+/).filter(Boolean)
    if (!this._classList) this._classList = new Set()
    this._classList.clear()
    for (const n of names) this._classList.add(n)
    if (this._mounted) this._markDirty('props', 'class')
  }

  // =========================================================================
  // Internal state (accessible by component.ts internals)
  // =========================================================================
  /** Flag: true once node has been committed to Fabric via createNode. */
  _mounted = false
  /** Native component name used for Fabric createNode (e.g. 'RCTView'). */
  _nativeName: string = ''
  /** Instance handle for Fabric createNode. Set in createElement. */
  _instanceHandle: InstanceHandle | null = null
  _propsDirty = false
  _childrenDirty = false
  _propsSnapshot: Props = {}
  _dirtyPropsCount = 0
  _children: (RNNode | RNTextNode | RNCommentNode)[] = []
  // Lazily allocated on first addEventListener call (most nodes never use it).
  _listeners: Map<string, Set<EventListenerOrEventListenerObject>> | null = null
  /** CSS class list (DOM-style, resolved at flush time via StyleSheetList). */
  _classList: Set<string> | null = null

  /** Last validAttributes (needed for children-only updates on mounted nodes). */
  _lastValidAttrs: Record<string, unknown> | null = null

  /**
   * ScrollView content container (Fabric). RCTScrollView hosts exactly one
   * child — the content view. We keep a stable container (collapsable:false so
   * RN 0.86's C++ ViewShadowNode does not view-flatten it) and rebuild its
   * children on content updates, so the ScrollView's own child never changes.
   * Without this, content updates re-clone the ScrollView and RN 0.86's Fabric
   * appends → android.widget.ScrollView's single-child addView crash.
   */
  _scrollContentFabric: FabricNode | null = null
  _scrollContentFabricId: number | null = null
  /** Last content-container children (ShadowNode refs) — for skip-if-unchanged. */
  _scrollContentChildren: unknown[] | null = null

  // =========================================================================
  // Constructor
  // NOTE: Use RNDocument.createElement() to create nodes.
  // Direct construction is for internal use only.
  // =========================================================================
  constructor(
    fabricNode: FabricNode,
    fabricNodeId: number,
    tagName: string,
    currentProps: Props,
    ownerDocument: RNDocument
  ) {
    this[FABRIC_NODE] = fabricNode
    this[FABRIC_NODE_ID] = fabricNodeId
    this.tagName = tagName
    this.currentProps = currentProps
    this._propsSnapshot = { ...currentProps }
    this.ownerDocument = ownerDocument
    this.style = createStyleObject(this)
  }

  // =========================================================================
  // Internal helpers (RN internal implementation - not part of DOM API)
  // =========================================================================

  /** @internal - Get the root RNBody */
  private _getRoot(): RNBody {
    return this.ownerDocument.body
  }

  /** @internal - Get Fabric children for submission */
  _getFabricChildren(): FabricNode[] {
    const children: FabricNode[] = []
    for (const child of this._children) {
      children.push(child.nodeType === 3 ? child.node : child[FABRIC_NODE])
    }
    return children
  }

  /** @internal - Mark node as dirty and propagate up */
  private _markDirty(type: 'props' | 'children', key?: string): void {
    if (type === 'props') {
      if (key) this._dirtyPropsCount++
      if (this._propsDirty) return
      this._propsDirty = true
    } else {
      if (this._childrenDirty) return
      this._childrenDirty = true
    }
    this._getRoot()._scheduleFlush()
    this.parentNode?._markChildrenDirty()
  }

  /** @internal - Mark children as changed */
  public _markChildrenDirty(): void {
    this._markDirty('children')
  }

  /** @internal - Check if props actually changed (O(1)) */
  public _hasPropsChanged(): boolean {
    return this._dirtyPropsCount > 0
  }

  /** @internal - Request update (used by style object) */
  _requestUpdate(): void {
    if (this._mounted) {
      this._markDirty('props', 'style')
    }
  }

  // =========================================================================
  // Public DOM-like Properties
  // =========================================================================

  /**
   * DOM-compatible childNodes getter
   * Returns a live NodeList of all child nodes
   */
  get childNodes(): (RNNode | RNTextNode | RNCommentNode)[] {
    return this._children
  }

  /**
   * DOM-compatible children getter
   * Returns only Element children (filters out text/comment nodes)
   */
  get children(): RNNode[] {
    return this._children.filter(c => c.nodeType === 1) as RNNode[]
  }

  get childElementCount(): number {
    let count = 0
    for (const c of this._children) {
      if (c.nodeType === 1) count++
    }
    return count
  }

  // =========================================================================
  // Public DOM-like API
  // =========================================================================

  setAttribute(name: string, value: unknown): void {
    this.currentProps = { ...this.currentProps, [name]: value }
    // Only mark dirty if the node is already mounted in the Fabric tree.
    // Pre-mount nodes accumulate props via currentProps and get a full
    // init on first _getFabricNode call, avoiding incremental cloneNode
    // issues with partial payloads.
    if (this._mounted) {
      this._markDirty('props', name)
    }
  }

  appendChild(child: RNNode | RNTextNode | RNCommentNode): void {
    child.parentNode = this
    this._children.push(child)
    registerInInstanceMap(child)
    this._markSubtreeDirty(child)
    if (this._mounted) {
      this._markChildrenDirty()
    }
  }

  removeChild(child: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode {
    child.parentNode = null
    const idx = this._children.indexOf(child)
    if (idx !== -1) this._children.splice(idx, 1)
    unregisterFromInstanceMap(child)
    if (this._mounted) {
      this._markChildrenDirty()
    }
    return child
  }

  insertBefore(child: RNNode | RNTextNode | RNCommentNode, ref: RNNode | RNTextNode | RNCommentNode | null): RNNode | RNTextNode | RNCommentNode {
    child.parentNode = this
    // Remove from old position first (DOM move semantics)
    const existingIdx = this._children.indexOf(child)
    if (existingIdx !== -1) {
      this._children.splice(existingIdx, 1)
    }
    if (!ref) {
      this._children.push(child)
    } else {
      const refIndex = this._children.indexOf(ref)
      if (refIndex === -1) {
        this._children.push(child)
      } else {
        this._children.splice(refIndex, 0, child)
      }
    }
    registerInInstanceMap(child)
    // Only mark subtree dirty for fresh (unmounted) nodes.
    // Already-mounted nodes keep their props; only the parent's child order changes.
    if (child.nodeType === 1 && !(child as RNNode)._mounted) {
      this._markSubtreeDirty(child as RNNode)
    }
    if (this._mounted) {
      this._markChildrenDirty()
    }
    return child
  }

  /** @internal - Recursively mark a subtree as needing a full Fabric
   *  reprocess (props + children). Used when a subtree is re-inserted
   *  after removal (e.g. tab switching). When the subtree comes back,
   *  its old Fabric handles may be stale, so we force a complete
   *  re-process from the root on the next flush.
   *
   *  Unlike `_mounted` (which is only for first-time createNode deferral),
   *  this does NOT set `_mounted = false` — re-inserted nodes keep their
   *  existing Fabric handle and get updated via cloneNode* in the mounted
   *  incremental path, which avoids leaking Fabric nodes.
   */
  private _markSubtreeDirty(node: RNNode | RNTextNode | RNCommentNode): void {
    if (node.nodeType === 8) return
    if (node.nodeType === 3) return
    const n = node as RNNode
    n._propsDirty = true
    n._childrenDirty = true
    // Clear snapshot so next flush sends ALL current props (full payload).
    // The snapshot is what diffFabricPayload diffs against — an empty
    // object means every current prop is treated as "added". No need to
    // seed individual dirty keys.
    n._propsSnapshot = {}
    for (const child of n._children) {
      this._markSubtreeDirty(child)
    }
  }

  getAttribute(name: string): unknown {
    return this.currentProps[name]
  }

  hasAttribute(name: string): boolean {
    return name in this.currentProps
  }

  removeAttribute(name: string): void {
    const next = { ...this.currentProps }
    delete next[name]
    this.currentProps = next
    if (this._mounted) {
      this._markDirty('props', name)
    }
  }

  replaceChild(newChild: RNNode | RNTextNode | RNCommentNode, oldChild: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode {
    const idx = this._children.indexOf(oldChild)
    if (idx === -1) return oldChild
    oldChild.parentNode = null
    unregisterFromInstanceMap(oldChild)
    newChild.parentNode = this
    this._children[idx] = newChild
    this._markSubtreeDirty(newChild)
    if (this._mounted) {
      this._markChildrenDirty()
    }
    return oldChild
  }

  contains(node: RNNode | RNTextNode | RNCommentNode): boolean {
    let n: RNNode | RNTextNode | RNCommentNode | null = node
    while (n) {
      if (n === this) return true
      n = n.parentNode
    }
    return false
  }

  hasChildNodes(): boolean {
    return this._children.length > 0
  }

  get isConnected(): boolean {
    let current: RNNode | null = this.parentNode
    while (current) {
      if (current === this.ownerDocument.body) return true
      current = current.parentNode
    }
    return false
  }

  addEventListener(
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!this._listeners) this._listeners = new Map()
    const capture = typeof options === 'boolean' ? options : !!options?.capture
    const key = capture ? `__capture_${type}` : type
    if (!this._listeners!.has(key)) {
      this._listeners!.set(key, new Set())
    }
    this._listeners!.get(key)!.add(handler)
  }

  removeEventListener(
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void {
    if (!this._listeners) return
    const capture = typeof options === 'boolean' ? options : !!options?.capture
    const key = capture ? `__capture_${type}` : type
    this._listeners.get(key)?.delete(handler)
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this._listeners?.get(event.type)
    if (!handlers) return true
    for (const handler of handlers) {
      if (typeof handler === 'function') {
        handler(event)
      } else {
        handler.handleEvent(event)
      }
    }
    return !event.defaultPrevented
  }

  // =========================================================================
  // Tree traversal
  // =========================================================================

  get firstChild(): RNNode | RNTextNode | RNCommentNode | null {
    return this._children[0] ?? null
  }

  get lastChild(): RNNode | RNTextNode | RNCommentNode | null {
    return this._children[this._children.length - 1] ?? null
  }

  get nextSibling(): RNNode | RNTextNode | RNCommentNode | null {
    if (!this.parentNode) return null
    const idx = this.parentNode._children.indexOf(this)
    if (idx === -1 || idx >= this.parentNode._children.length - 1) return null
    return this.parentNode._children[idx + 1]
  }

  get previousSibling(): RNNode | RNTextNode | RNCommentNode | null {
    if (!this.parentNode) return null
    const idx = this.parentNode._children.indexOf(this)
    if (idx <= 0) return null
    return this.parentNode._children[idx - 1]
  }

  get textContent(): string {
    return this._children.map(c => c.textContent || '').join('')
  }

  set textContent(value: string) {
    // Fast path: single text child + non-empty → update in-place (no Fabric node churn)
    if (value && this._children.length === 1 && this._children[0].nodeType === 3) {
      ;(this._children[0] as RNTextNode).textContent = value
      return
    }
    // Full replace: detach all existing children, add a new text node
    const oldChildren = this._children.splice(0)
    for (const child of oldChildren) {
      child.parentNode = null
      unregisterFromInstanceMap(child)
    }
    if (value) {
      this.appendChild(this.ownerDocument.createTextNode(value))
    }
  }

  // =========================================================================
  // DOM ChildNode API
  // =========================================================================

  /**
   * Remove this node from its parent.
   * Standard DOM: ChildNode.remove()
   */
  remove(): void {
    this.parentNode?.removeChild(this)
  }

  /**
   * Insert nodes after this node.
   * Standard DOM: ChildNode.after(...nodes)
   */
  after(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void {
    const parent = this.parentNode
    if (!parent) return
    const ref = this.nextSibling
    for (const node of nodes) {
      parent.insertBefore(node, ref)
    }
  }

  /**
   * Insert nodes before this node.
   * Standard DOM: ChildNode.before(...nodes)
   */
  before(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void {
    const parent = this.parentNode
    if (!parent) return
    for (const node of nodes) {
      parent.insertBefore(node, this)
    }
  }

  /**
   * Replace this node with the given nodes.
   * Standard DOM: ChildNode.replaceWith(...nodes)
   */
  replaceWith(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void {
    const parent = this.parentNode
    if (!parent) return
    for (const node of nodes) {
      parent.insertBefore(node, this)
    }
    parent.removeChild(this)
  }

  // =========================================================================
  // DOM ParentNode API
  // =========================================================================

  /**
   * Append multiple nodes at the end.
   * Standard DOM: ParentNode.append(...nodes)
   */
  append(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void {
    for (const node of nodes) {
      this.appendChild(node)
    }
  }

  /**
   * Prepend multiple nodes at the beginning.
   * Standard DOM: ParentNode.prepend(...nodes)
   */
  prepend(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void {
    const ref = this.firstChild
    for (const node of nodes) {
      this.insertBefore(node, ref)
    }
  }

  /**
   * Merge adjacent text nodes into single text nodes.
   * Standard DOM: Node.normalize()
   */
  normalize(): void {
    let i = 0
    while (i < this._children.length) {
      const child = this._children[i]
      if (child.nodeType === 3) {
        // Merge with next sibling if also text
        while (i + 1 < this._children.length && this._children[i + 1].nodeType === 3) {
          const next = this._children[i + 1] as RNTextNode
          const text = (child as RNTextNode).textContent + next.textContent
          ;(child as RNTextNode).textContent = text
          this.removeChild(next)
        }
      } else if ((child as RNNode).nodeType === 1) {
        // Recursively normalize child elements
        ;(child as RNNode).normalize()
      }
      i++
    }
  }

  cloneNode(deep: boolean = false): RNNode {
    const clone = this.ownerDocument.createElement(this.tagName)
    clone.currentProps = { ...this.currentProps }
    if (deep) {
      for (const child of this._children) {
        if ('cloneNode' in child && typeof (child as any).cloneNode === 'function') {
          clone.appendChild((child as any).cloneNode(true))
        } else {
          // TextNode or POJO comment — can't deep-clone, skip
        }
      }
    }
    return clone
  }

  // =========================================================================
  // DOM-like Native Commands
  // =========================================================================

  /**
   * Focus the native element (maps to Fabric dispatchCommand 'focus').
   */
  focus(): void {
    try {
      const uim = getFabricUIManager()
      if (typeof uim.dispatchCommand === 'function' && typeof uim.findShadowNodeByTag_DEPRECATED === 'function') {
        const tag = this[FABRIC_NODE_ID]
        const shadowNode = uim.findShadowNodeByTag_DEPRECATED(tag)
        if (shadowNode) uim.dispatchCommand(shadowNode, 'focus', [])
      }
    } catch (_) { /* dispatchCommand may not be available */ }
  }

  /**
   * Blur (unfocus) the native element (maps to Fabric dispatchCommand 'blur').
   */
  blur(): void {
    try {
      const uim = getFabricUIManager()
      if (typeof uim.dispatchCommand === 'function' && typeof uim.findShadowNodeByTag_DEPRECATED === 'function') {
        const tag = this[FABRIC_NODE_ID]
        const shadowNode = uim.findShadowNodeByTag_DEPRECATED(tag)
        if (shadowNode) uim.dispatchCommand(shadowNode, 'blur', [])
      }
    } catch (_) { /* dispatchCommand may not be available */ }
  }

  /**
   * Measure the native element's layout (DOM-standard; used by press-rect
   * checks). Callback: (left, top, width, height, pageX, pageY).
   * Falls back to zeros when Fabric measurement is unavailable — press still
   * works, only press-rect exit checks degrade.
   */
  measure(callback: (left: number, top: number, width: number, height: number, pageX: number, pageY: number) => void): void {
    try {
      const uim = getFabricUIManager()
      if (typeof uim.measure === 'function' && typeof uim.findShadowNodeByTag_DEPRECATED === 'function') {
        const shadowNode = uim.findShadowNodeByTag_DEPRECATED(this[FABRIC_NODE_ID])
        if (shadowNode) {
          uim.measure(shadowNode, callback)
          return
        }
      }
    } catch (_) { /* fall through to zero callback */ }
    callback(0, 0, 0, 0, 0, 0)
  }
}

// ============================================================================
// RNBody (body 是 root 的概念，继承 RNBody)
// ============================================================================

/** @internal - Is this node a ScrollView-like container (single-child host)? */
function isScrollContainer(node: { tagName: string }): boolean {
  return node.tagName === 'ScrollView' || node.tagName === 'AndroidHorizontalScrollView'
}

/**
 * RNBody represents the document.body which is the root container
 * It manages batched updates using dirty flag propagation
 */
export class RNBody extends RNNode {
  // Flag to prevent multiple RAF scheduling
  private _flushScheduled = false

  constructor(rootTag: Container, ownerDocument: RNDocument) {
    super(
      null as FabricNode,
      rootTag,
      'Body',
      {},
      ownerDocument
    )
    // Body is the root container — always "mounted" so children additions
    // trigger _scheduleFlush() → _submitToRoot() → Fabric completeRoot.
    this._mounted = true
  }

  // Use inherited _markChildrenDirty / removeChild from RNNode.
  // _markDirty calls _getRoot()._scheduleFlush() which is body._scheduleFlush().

  private _flushGeneration = 0

  /**
   * Schedule flush on next animation frame.
   * rAF batches all updates within a frame into a single completeRoot — this is
   * how React commits in RN (once per frame), avoiding a separate JNI round-trip
   * per state change. Falls back to queueMicrotask when rAF is unavailable.
   */
  _scheduleFlush(): void {
    if (this._flushScheduled) return
    this._flushScheduled = true
    const gen = ++this._flushGeneration

    const flush = () => {
      if (this._flushGeneration !== gen) return // superseded by newer flush
      this._flushScheduled = false
      this._submitToRoot()
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(flush)
    } else {
      queueMicrotask(flush)
    }
  }

  /**
   * Submit current children to Fabric root
   */
  /**
   * Submit current children to Fabric root
   */
  _submitToRoot(): void {
    const fabricUIManager = getFabricUIManager()
    const childSet = fabricUIManager.createChildSet()

    for (let i = 0; i < this._children.length; i++) {
      const child = this._children[i]
      const fabricNode = this._getFabricNode(child)
      if (fabricNode) {
        fabricUIManager.appendChildToSet(childSet, fabricNode)
      }
    }

    fabricUIManager.completeRoot(this[FABRIC_NODE_ID], childSet)
  }

  /**
   * Build (or rebuild) a ScrollView's single content container Fabric node.
   * The container is a stable RCTView; its children are the scroll view's
   * element children. Returning the same container instance keeps the
   * ScrollView's own child constant across content updates — RN 0.86's Fabric
   * appends on cloneNodeWithNewChildren for single-child ScrollViews
   * (android.widget.ScrollView allows only one direct child), so the ScrollView
   * child must never change.
   */
  _buildScrollContent(
    node: RNNode,
    fabricUIManager: FabricUIManager,
    rootTag: number,
  ): FabricNode | null {
    let cc = node._scrollContentFabric
    if (!cc) {
      const ccId = node._scrollContentFabricId ?? (node._scrollContentFabricId = allocateTag())
      const handle = { tag: ccId, stateNode: node }
      // collapsable:false — without it the container has no formsView trait in
      // RN 0.86's C++ ViewShadowNode (no bg/border/stacking context) and gets
      // view-flattened, promoting the scroll content up to the ScrollView and
      // tripping its single-child addView crash.
      cc = (fabricUIManager as any).createNode(ccId, 'RCTView', rootTag, { collapsable: false }, handle)
      node._scrollContentFabric = cc
      node._scrollContentChildren = null
    }
    // Resolve each child's Fabric node (cheap for stable children — returns the
    // cached ShadowNode; only dirty ones clone).
    const curr: unknown[] = []
    for (const subChild of node._children) {
      const subFabricNode = this._getFabricNode(subChild)
      if (subFabricNode) curr.push(subFabricNode)
    }
    // Skip the clone when every child's ShadowNode reference is unchanged —
    // the container's child list didn't actually change. This avoids
    // appendChildToSet + cloneNodeWithNewChildren JNI churn on unrelated
    // subtree updates that merely propagate dirty flags to the ScrollView.
    const prev = node._scrollContentChildren
    if (prev !== null) {
      let same = prev.length === curr.length
      if (same) {
        for (let i = 0; i < prev.length; i++) {
          if (prev[i] !== curr[i]) { same = false; break }
        }
      }
      if (same) return cc
    }
    const ccChildren = fabricUIManager.createChildSet()
    for (const n of curr) {
      fabricUIManager.appendChildToSet(ccChildren, n)
    }
    cc = (fabricUIManager as any).cloneNodeWithNewChildren(cc, ccChildren)
    node._scrollContentFabric = cc
    node._scrollContentChildren = curr
    return cc
  }

  /**
   * Get Fabric node for a child, handling both props and children updates.
   * Props changes use cloneNodeWithNewProps; children changes use cloneNodeWithNewChildren.
   */
  _getFabricNode(child: RNNode | RNTextNode | RNCommentNode): unknown {
    if (child.nodeType === 3) {
      return (child as RNTextNode).node
    }

    if (child.nodeType === 8) {
      return null
    }

    let fabricNode = child[FABRIC_NODE]
    const fabricUIManager = getFabricUIManager()
    let childSet: unknown = null

    // ── UNMOUNTED NODE: fresh createNode with full currentProps ─────
    // Nodes that have never been committed to Fabric (or were re-inserted
    // after removal) get a fresh createNode with the COMPLETE payload
    // from currentProps. This avoids cloneNode* issues where incremental
    // updates lose or misapply style props.
    if (!child._mounted) {
      const nativeName = child._nativeName
      const rootTag = this[FABRIC_NODE_ID]
      const validAttrs = child._lastValidAttrs ?? {}
      // Merge class-based styles with inline style (class is baseline, inline overrides).
      const classStyle = _resolveClassStyles(child)
      const mergedProps = classStyle && Object.keys(classStyle).length > 0
        ? { ...child.currentProps, style: { ...classStyle, ...((child.currentProps.style || {}) as Record<string, unknown>) } }
        : child.currentProps
      const fabricProps = prepareFabricProps(child.tagName, mergedProps)
      // Modal: assign a native `identifier` so native `modalDismissed`
      // events can be routed back to this node's onDismiss. Matches both
      // the 'Modal' tag (direct createElement) and the native host name
      // used by the Vue Modal wrapper ('RCTModalHostView').
      if (child.tagName === 'Modal' || (nativeName ?? '').includes('ModalHostView')) {
        const id = registerModalNode(child as unknown as EventNode, fabricProps)
        fabricProps.identifier = id
      }
      const fullPayload = buildFabricPayload(fabricProps, validAttrs)
      const instanceHandle = child._instanceHandle ?? { tag: child[FABRIC_NODE_ID], stateNode: child }


      // Create a fresh Fabric node with all current props applied.
      fabricNode = (fabricUIManager as any).createNode(
        child[FABRIC_NODE_ID],
        nativeName,
        rootTag,
        fullPayload ?? {},
        instanceHandle,
      )
      child[FABRIC_NODE] = fabricNode

      child._propsSnapshot = { ...fabricProps }
      child._dirtyPropsCount = 0
      child._propsDirty = false

      if (child._children.length > 0) {
        childSet = fabricUIManager.createChildSet()
        if (isScrollContainer(child)) {
          // ScrollView: wrap children in a single content container (RN
          // semantics — RCTScrollView hosts exactly one child, the content
          // view). The container node is stable, so content updates only
          // re-clone the container and the ScrollView's own child never
          // changes. This avoids RN 0.86's Fabric append-on-update crash
          // (android.widget.ScrollView allows only one direct child).
          const cc = this._buildScrollContent(child, fabricUIManager, rootTag)
          if (cc) fabricUIManager.appendChildToSet(childSet, cc)
        } else {
          for (const subChild of child._children) {
            const subFabricNode = this._getFabricNode(subChild)
            if (subFabricNode) {
              fabricUIManager.appendChildToSet(childSet, subFabricNode)
            }
          }
        }
        child._childrenDirty = false

        // Apply children via cloneNodeWithNewChildren on the fresh node.
        fabricNode = (fabricUIManager as any).cloneNodeWithNewChildren(fabricNode, childSet)
        child[FABRIC_NODE] = fabricNode
      } else {
        child._childrenDirty = false
      }

      child._mounted = true
      child._lastValidAttrs = validAttrs
      return fabricNode
    }

    // ── MOUNTED NODE: incremental dirty-flag-based update ────────────
    let updatePayload: Record<string, unknown> | null = null
    childSet = null

    // Prepare props once — reused by both props and children-only paths.
    // Merge class-based styles with inline style (class is baseline, inline overrides).
    const classStyle = _resolveClassStyles(child)
    const mergedProps = classStyle && Object.keys(classStyle).length > 0
      ? { ...child.currentProps, style: { ...classStyle, ...((child.currentProps.style || {}) as Record<string, unknown>) } }
      : child.currentProps
    const fabricProps = prepareFabricProps(child.tagName, mergedProps)

    if (child._propsDirty && child._hasPropsChanged()) {
      // Use _nativeName resolved by ensure() during createElement, not a
      // guessed RCT prefix — the real Fabric name may differ (e.g.
      // 'Image' → 'RCTImageView', 'TextInput' → 'RCTSinglelineTextInputView').
      const nativeName = child._nativeName
      let viewConfig
      try {
        viewConfig = ReactNativePrivateInterface.ReactNativeViewConfigRegistry.get(nativeName)
} catch {
        viewConfig = undefined
      }

      const validAttrs = viewConfig?.validAttributes || {}
      const prevProps = child._propsSnapshot
      // Diff-based: only send changed props, like React does.
      updatePayload = diffFabricPayload(prevProps, fabricProps, validAttrs)
      child._lastValidAttrs = validAttrs
      child._propsSnapshot = { ...fabricProps }
      child._dirtyPropsCount = 0
      child._propsDirty = false
    }

    if (child._childrenDirty && child._children.length > 0) {
      childSet = fabricUIManager.createChildSet()
      if (isScrollContainer(child)) {
        // Rebuild the content container's children only; the ScrollView's own
        // child (the container) stays stable → no Fabric append-on-update.
        const cc = this._buildScrollContent(child, fabricUIManager, this[FABRIC_NODE_ID])
        if (cc) fabricUIManager.appendChildToSet(childSet, cc)
      } else {
        for (const subChild of child._children) {
          const subFabricNode = this._getFabricNode(subChild)
          if (subFabricNode) {
            fabricUIManager.appendChildToSet(childSet, subFabricNode)
          }
        }
      }
    }
    // Always clear the dirty flag (even when there were no children) so
    // the next appendChild/removeChild correctly propagates up the tree.
    child._childrenDirty = false

    const hasChildren = childSet !== null
    const hasProps = updatePayload !== null

    if (hasProps && hasChildren) {
      fabricNode = (fabricUIManager as any).cloneNodeWithNewChildrenAndProps(fabricNode, childSet, updatePayload)
    } else if (hasProps) {
      fabricNode = (fabricUIManager as any).cloneNodeWithNewProps(fabricNode, updatePayload)
    } else if (hasChildren) {
      // Children-only update: cloneNodeWithNewChildren drops rawProps, so
      // we re-build the full payload from current props (i.e. all style,
      // layout, event markers) and use the combined call instead.
      const va = child._lastValidAttrs ?? {}
      const fullPayload = buildFabricPayload(fabricProps, va)
      if (fullPayload) {
        fabricNode = (fabricUIManager as any).cloneNodeWithNewChildrenAndProps(fabricNode, childSet, fullPayload)
      } else {
        fabricNode = (fabricUIManager as any).cloneNodeWithNewChildren(fabricNode, childSet)
      }
    }

    if (hasChildren || hasProps) {
      child[FABRIC_NODE] = fabricNode
    }

    return fabricNode
  }

}

// ============================================================================
// RNTextNode (模拟 Text)
// ============================================================================

export class RNTextNode {
  // Internal Fabric field (hidden via Symbol)
  [FABRIC_NODE]: FabricNode
  
  // Public node field for compatibility (like old TextInstance)
  readonly node: FabricNode
  
  // DOM-like public API
  readonly nodeType = 3 as const  // Text node
  readonly nodeName = '#text' as const
  readonly ownerDocument: RNDocument
  parentNode: RNNode | null = null
  
  private _textContent: string
  
  constructor(fabricNode: FabricNode, text: string, ownerDocument: RNDocument) {
    this[FABRIC_NODE] = fabricNode
    this.node = fabricNode  // Public field for easy access
    this._textContent = text
    this.ownerDocument = ownerDocument
  }
  
  get textContent(): string {
    return this._textContent
  }
  
  set textContent(value: string) {
    if (this._textContent === value) return
    
    this._textContent = value
    
    const fabricUIManager = getFabricUIManager()
    
    // 使用 setNativeProps 更新文本
    if (fabricUIManager.setNativeProps) {
      try {
        fabricUIManager.setNativeProps(this[FABRIC_NODE], { text: value })
      } catch (err) {
        console.error('[RNDOM] setNativeProps error:', err)
      }
    }
  }

  get nodeValue(): string {
    return this._textContent
  }

  set nodeValue(value: string) {
    this.textContent = value
  }

  get nextSibling(): RNNode | RNTextNode | RNCommentNode | null {
    if (!this.parentNode) return null
    const idx = this.parentNode._children.indexOf(this)
    if (idx === -1 || idx >= this.parentNode._children.length - 1) return null
    return this.parentNode._children[idx + 1]
  }

  get previousSibling(): RNNode | RNTextNode | RNCommentNode | null {
    if (!this.parentNode) return null
    const idx = this.parentNode._children.indexOf(this)
    if (idx <= 0) return null
    return this.parentNode._children[idx - 1]
  }

  cloneNode(_deep: boolean = false): RNTextNode {
    return this.ownerDocument.createTextNode(this._textContent)
  }

  // ── ChildNode API (shared with RNNode) ────────────────────────

  remove(): void {
    this.parentNode?.removeChild(this)
  }

  after(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void {
    const parent = this.parentNode
    if (!parent) return
    const ref = this.nextSibling
    for (const node of nodes) {
      parent.insertBefore(node, ref)
    }
  }

  before(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void {
    const parent = this.parentNode
    if (!parent) return
    for (const node of nodes) {
      parent.insertBefore(node, this)
    }
  }

  replaceWith(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void {
    const parent = this.parentNode
    if (!parent) return
    for (const node of nodes) {
      parent.insertBefore(node, this)
    }
    parent.removeChild(this)
  }
}

// ============================================================================
// RNCommentNode — 纯类型定义，实际对象由 createComment() 创建
// Comment 是虚拟标记节点，无 Fabric 节点，仅存在于 JS 层
// ============================================================================

export interface RNCommentNode {
  readonly nodeType: 8
  readonly nodeName: '#comment'
  nodeValue: string
  data: string
  textContent: string
  ownerDocument: RNDocument
  parentNode: RNNode | null
  readonly childNodes: (RNNode | RNTextNode | RNCommentNode)[]
  _children: (RNNode | RNTextNode | RNCommentNode)[]
  readonly nextSibling: RNNode | RNTextNode | RNCommentNode | null
  readonly previousSibling: RNNode | RNTextNode | RNCommentNode | null
  [FABRIC_NODE]: FabricNode
  [FABRIC_NODE_ID]: number
  appendChild(child: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode
  removeChild(child: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode
  insertBefore(newChild: RNNode | RNTextNode | RNCommentNode, refChild: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode
  cloneNode(): RNCommentNode
  remove(): void
  after(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void
  before(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void
  replaceWith(...nodes: (RNNode | RNTextNode | RNCommentNode)[]): void
}

// ============================================================================
// RNDocumentFragment — lightweight virtual container for batch insertion
//
// Mirrors DOM's DocumentFragment: children can be appended/inserted/removed,
// then flushed atomically into a real parent node. Unlike RNCommentNode,
// children ARE registered in the instance map so event dispatch works.
//
// Used by eachImpl's fast path via host-hooks createFragment.
// ============================================================================

export class RNDocumentFragment {
  readonly nodeType = 11 as const
  readonly nodeName = '#document-fragment' as const
  readonly nodeValue = null
  readonly data = ''
  textContent = ''
  readonly ownerDocument: RNDocument
  parentNode: RNNode | null = null
  _children: (RNNode | RNTextNode | RNCommentNode)[] = []

  constructor(ownerDocument: RNDocument) {
    this.ownerDocument = ownerDocument
  }

  get childNodes(): (RNNode | RNTextNode | RNCommentNode)[] {
    return this._children
  }

  appendChild(child: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode {
    child.parentNode = this as unknown as RNNode
    this._children.push(child)
    if (child.nodeType === 1) {
      registerInInstanceMap(child as RNNode)
    }
    return child
  }

  removeChild(child: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode {
    const idx = this._children.indexOf(child)
    if (idx >= 0) this._children.splice(idx, 1)
    child.parentNode = null
    if (child.nodeType === 1) {
      unregisterFromInstanceMap(child as RNNode)
    }
    return child
  }

  insertBefore(
    newChild: RNNode | RNTextNode | RNCommentNode,
    refChild: RNNode | RNTextNode | RNCommentNode | null,
  ): RNNode | RNTextNode | RNCommentNode {
    newChild.parentNode = this as unknown as RNNode
    if (!refChild) {
      this._children.push(newChild)
    } else {
      const idx = this._children.indexOf(refChild)
      if (idx >= 0) this._children.splice(idx, 0, newChild)
      else this._children.push(newChild)
    }
    if (newChild.nodeType === 1) {
      registerInInstanceMap(newChild as RNNode)
    }
    return newChild
  }

  /**
   * Atomically move all children into the target host at the given position.
   * The parent is marked dirty once after all children are transferred.
   *
   * @param targetHost - real parent node to receive the children
   * @param before     - optional reference node; children inserted before it
   */
  flush(targetHost: RNNode, before: RNNode | RNTextNode | RNCommentNode | null): void {
    const items = this._children.splice(0)
    for (const child of items) {
      child.parentNode = null
    }
    const refIndex = before ? targetHost._children.indexOf(before) : -1
    for (const child of items) {
      child.parentNode = targetHost
    }
    if (refIndex >= 0) {
      targetHost._children.splice(refIndex, 0, ...items)
    } else {
      targetHost._children.push(...items)
    }
    if (targetHost._mounted) {
      targetHost._markChildrenDirty()
    }
  }

  cloneNode(): RNDocumentFragment {
    return this.ownerDocument.createDocumentFragment()
  }
}

// ============================================================================
// Event System
// ============================================================================

const INSTANCE_MAP_KEY = '__RASEN_INSTANCE_MAP__'

function getInstanceMap(): Map<number, RNNode> {
  const g = globalThis as Record<string, unknown>
  if (!g[INSTANCE_MAP_KEY]) {
    g[INSTANCE_MAP_KEY] = new Map<number, RNNode>()
  }
  return g[INSTANCE_MAP_KEY] as Map<number, RNNode>
}

/** Track the currently focused node for blur-on-tap-outside behavior. */
let _focusedNode: RNNode | null = null

/** Helper: blur the currently focused node (if any) via Fabric dispatchCommand. */
function _blurFocusedNode(): void {
  if (!_focusedNode) return
  try {
    const uim = getFabricUIManager()
    if (typeof uim.dispatchCommand === 'function' && typeof uim.findShadowNodeByTag_DEPRECATED === 'function') {
      const tag = _focusedNode[FABRIC_NODE_ID]
      const shadowNode = uim.findShadowNodeByTag_DEPRECATED(tag)
      if (shadowNode) {
        uim.dispatchCommand(shadowNode, 'blur', [])
      }
    }
  } catch (_) { /* dispatchCommand may not be available */ }
  _focusedNode = null
}

/** Helper: focus a node via Fabric dispatchCommand. */
function _focusNode(node: RNNode): void {
  try {
    const uim = getFabricUIManager()
    if (typeof uim.dispatchCommand === 'function' && typeof uim.findShadowNodeByTag_DEPRECATED === 'function') {
      const tag = node[FABRIC_NODE_ID]
      const shadowNode = uim.findShadowNodeByTag_DEPRECATED(tag)
      if (shadowNode) {
        uim.dispatchCommand(shadowNode, 'focus', [])
      }
    }
  } catch (_) { /* dispatchCommand may not be available */ }
  _focusedNode = node
}

// Event dispatch lives in src/event-system.ts (DOM-standard two-phase
// pipeline + RN viewConfig behavior + press synthesis). See that file.

// ============================================================================
// Mount Helpers
// ============================================================================

/**
 * Recursively register a node and its descendants in the instance map
 * so event handlers on them can be found by dispatchEventWithBubble.
 */
function registerInInstanceMap(node: RNNode | RNTextNode | RNCommentNode): void {
  if (node.nodeType === 8) return // Skip comment nodes (no tag)
  const map = getInstanceMap()
  if ('tagName' in node) {
    if (!map.has(node[FABRIC_NODE_ID])) {
      map.set(node[FABRIC_NODE_ID], node)
    }
  }
  // Recurse into children
  if ('_children' in node) {
    for (const child of (node as RNNode)._children) {
      registerInInstanceMap(child)
    }
  }
}

function unregisterFromInstanceMap(node: RNNode | RNTextNode | RNCommentNode): void {
  if (node.nodeType === 8) return // Skip comment nodes (no tag)
  const map = getInstanceMap()
  if ('tagName' in node) {
    map.delete(node[FABRIC_NODE_ID])
    // Clean up Modal identifier mapping on unmount.
    if (node.tagName === 'Modal' || (node._nativeName ?? '').includes('ModalHostView')) {
      unregisterModalNode(node as unknown as EventNode)
    }
  }
  // Recurse into children
  if ('_children' in node) {
    for (const child of (node as RNNode)._children) {
      unregisterFromInstanceMap(child)
    }
  }
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
    const tag = node[FABRIC_NODE_ID]
    const shadowNode = uim.findShadowNodeByTag_DEPRECATED?.(tag)
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
    const tag = node[FABRIC_NODE_ID]
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
      ;(result as any)[key] = selector.startsWith('.') ? selector.slice(1) : selector
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

/** Merge class-based styles from document.styleSheets into a single object. */
export function _resolveClassStyles(node: RNNode): Record<string, unknown> {
  if (!node._classList || node._classList.size === 0) return {}
  const styleSheets = node.ownerDocument.styleSheets
  if (!styleSheets || styleSheets._sheets.length === 0) return {}

  const result: Record<string, unknown> = {}
  for (const cls of node._classList) {
    const style = styleSheets._getStyle(cls)
    if (style) Object.assign(result, style)
  }
  return result
}

export function mountToContainer(
  rootTag: Container,
  ...nodes: (RNNode | RNTextNode | RNCommentNode)[]
): void {
  const childSet = getFabricUIManager().createChildSet()
  for (const node of nodes) {
    getFabricUIManager().appendChildToSet(childSet, node[FABRIC_NODE])
    registerInInstanceMap(node)
  }
  getFabricUIManager().completeRoot(rootTag, childSet)
}

// Export Host type alias and FABRIC_NODE symbol
export type Host = RNNode
export { FABRIC_NODE, FABRIC_NODE_ID }
