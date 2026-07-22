/**
 * React Native DOM-like Node Implementation
 *
 * Provides a DOM-like API for React Native Fabric rendering
 */

// ============================================================================
// Fabric Interop
// ============================================================================

export type Container = number
export type Props = Record<string, unknown>

import ReactNativePrivateInterface from 'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface'
// Touch react-native's public `View` export so its getter runs and registers
// RCTView with Fabric's view config registry. This is the only standard,
// non-private path RN exposes for a built-in native component; everything
// else (Text, ScrollView, Image, …) needs its own module top-level loaded
// by the host. See README for the per-component bring-up recipe.
import {View as _RNView} from 'react-native'
export const __ensureViewRegistered = _RNView
import type { FabricNode, FabricUIManager } from './fabric-global'

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
  props: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key in props) {
    result[key] = props[key]
  }
  return result
}

/**
 * Build a Fabric payload from current props. Unlike React Native's
 * `createAttributePayload`, we DO NOT call `process` callbacks for color
 * fields — Fabric's PropsParser will run them itself. Calling them twice
 * would re-rotate color bytes and ship a transparent / wrong color to the
 * native view.
 *
 * Behavior for non-color fields mirrors RN's `addProperties`:
 *   - top-level keys: forwarded as-is (functions → true)
 *   - nested `style`: each style key is forwarded (color strings stay
 *     as strings, primitives stay as primitives)
 *
 * Fabric's PropsParser still does the real per-prop processing (running
 * `processColor` once on strings, diffs for layout, etc.). We deliberately
 * skip the JS-side round-trip that `createAttributePayload` performs.
 */
function buildFabricPayload(
  props: Record<string, unknown>,
  validAttrs: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const key in props) {
    const value = props[key]
    const attrCfg = validAttrs[key]

    if (typeof value === 'function') {
      // Mirror RN behavior: event handlers → true.
      if (attrCfg !== undefined) payload[key] = true
      continue
    }

    if (attrCfg === undefined) {
      // Unknown top-level key — let Fabric decide (mostly it'll be dropped).
      continue
    }

    if (key === 'style' && value && typeof value === 'object' && !Array.isArray(value)) {
      // Flatten style and forward each key as a separate prop.
      // If the style key's attribute config has a `process` function
      // (e.g. backgroundColor → processColor), call it on string values
      // to avoid double-processing — RN's createAttributePayload would
      // process once and Fabric's PropsParser would process again,
      // giving a wrong color.
      const styleObj = value as Record<string, unknown>
      for (const sk in styleObj) {
        const sa = attrCfg as Record<string, unknown>
        const styleAttrCfg = sa[sk]
        if (styleAttrCfg === undefined) continue
        
        if (
          typeof styleObj[sk] === 'string' &&
          styleAttrCfg &&
          typeof styleAttrCfg === 'object' &&
          typeof (styleAttrCfg as { process?: unknown }).process === 'function'
        ) {
          const processFn = (styleAttrCfg as { process: (v: string) => unknown }).process
          payload[sk] = processFn(styleObj[sk] as string)
        } else {
          payload[sk] = styleObj[sk]
        }
      }
      continue
    }

    payload[key] = value
  }

  return payload
}

function getFabricUIManager(): FabricUIManager {
  if (!nativeFabricUIManager) {
    throw new Error('[Rasen] nativeFabricUIManager not available')
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
}

// ============================================================================
// Symbol Keys (Internal Implementation)
// ============================================================================

const FABRIC_NODE = Symbol.for('fabricNode')
const FABRIC_NODE_ID = Symbol.for('fabricNodeId')

/**
 * Create a style object with setProperty and removeProperty methods
 * This provides a DOM-like style interface
 */
function createStyleObject(element: RNNode) {
  return {
    setProperty(property: string, value: unknown): void {
      if (!element.currentProps.style) {
        element.currentProps.style = {}
      }
      ;(element.currentProps.style as Record<string, unknown>)[property] = value
      element._requestUpdate()
    },

    removeProperty(property: string): void {
      const currentStyle = element.currentProps.style as Record<string, unknown> | undefined
      if (currentStyle && property in currentStyle) {
        delete currentStyle[property]
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
        throw new Error('[Rasen] RNDocument.getOrCreate() requires rootTag on first call')
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
  
  private _resolveProps(props: Props): Props {
    const resolved: Props = {}
    for (const key in props) {
      const value = props[key]
      if (value && typeof value === 'object' && 'value' in value) {
        resolved[key] = (value as { value: unknown }).value
      } else if (key === 'style' && value && typeof value === 'object') {
        resolved.style = this._resolveStyle(value as Record<string, unknown>)
      } else {
        resolved[key] = value
      }
    }
    return resolved
  }

  private _resolveStyle(style: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {}
    for (const key in style) {
      const value = style[key]
      if (value && typeof value === 'object' && 'value' in value) {
        resolved[key] = (value as { value: unknown }).value
      } else {
        resolved[key] = value
      }
    }
    return resolved
  }
  
  createElement(tagName: string, props: Props = {}): RNNode {
    const tag = allocateTag()
    // Auto-prepend 'RCT' prefix unless already has platform prefix (e.g., 'AndroidTextInput')
    const nativeName = tagName.startsWith('RCT') || tagName.startsWith('Android')
      ? tagName
      : `RCT${tagName}`
    
    const resolvedProps = this._resolveProps(props)
    
    // Resolve view config from registry. Host (example) must call
    // `registerComponent(name, partialViewConfig)` before mounting, otherwise
    // Fabric will fail to find this native component.
    let viewConfig
    try {
      const registry = ReactNativePrivateInterface.ReactNativeViewConfigRegistry
      viewConfig = registry.get(nativeName)
    } catch (e) {
      throw new Error(
        `[Rasen] ViewConfig not registered for "${nativeName}". ` +
        `Call registerComponent('${nativeName}', partialViewConfig) in your entry file.`,
      )
    }
    
    const validAttrs = viewConfig?.validAttributes || {}
    const fabricProps = prepareFabricProps(resolvedProps)
    const updatePayload = buildFabricPayload(fabricProps, validAttrs)

    const instanceHandle: InstanceHandle = { tag, stateNode: null }

    const fabricNode = getFabricUIManager().createNode(
      tag,
      nativeName,
      this._rnRootTag,
      updatePayload,
      instanceHandle
    )

    const node = new RNNode(
      fabricNode,
      tag,
      tagName,
      resolvedProps,
      this
    )
    instanceHandle.stateNode = node
    
    // Register for event system
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
    }

    return comment as RNCommentNode
  }
  
  private _rnInitEventSystem(): void {
    const g = globalThis as Record<string, unknown>
    const HANDLER_KEY = '__RASEN_EVENT_HANDLER_REGISTERED__'

    if (g[HANDLER_KEY] === true) return

    const uim = getFabricUIManager()
    if (uim.registerEventHandler) {
      uim.registerEventHandler(dispatchEventWithBubble as unknown as (instanceHandle: object, type: string, payload: Record<string, unknown>) => void)
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
  // Internal state (accessible by component.ts internals)
  // =========================================================================
  _propsDirty = false
  _childrenDirty = false
  _propsSnapshot: Props = {}
  _dirtyPropsKeys: Set<string> = new Set()
  _children: (RNNode | RNTextNode | RNCommentNode)[] = []
  _listeners: Map<string, Set<EventListenerOrEventListenerObject>> = new Map()

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
  public _getFabricChildren(): FabricNode[] {
    const children: FabricNode[] = []
    for (const child of this._children) {
      children.push('node' in child ? child.node : child[FABRIC_NODE])
    }
    return children
  }

  /** @internal - Mark node as dirty and propagate up */
  private _markDirty(type: 'props' | 'children', key?: string): void {
    if (type === 'props') {
      if (key) this._dirtyPropsKeys.add(key)
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
    return this._dirtyPropsKeys.size > 0
  }

  /** @internal - Request update (used by style object) */
  _requestUpdate(): void {
    this._markDirty('props', 'style')
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
    this._markDirty('props', name)
  }

  appendChild(child: RNNode | RNTextNode | RNCommentNode): void {
    child.parentNode = this
    this._children.push(child)
    // Re-register the subtree in the event system — removeChild calls
    // unregisterFromInstanceMap, so re-adding needs to restore it.
    registerInInstanceMap(child)
    // Mark the subtree as needing a full Fabric re-process so both props
    // (styles, event handlers) and children are applied afresh. Without
    // this, a node removed and re-added (e.g. during tab switching)
    // keeps stale dirty flags and Fabric skips the re-mount.
    this._markSubtreeDirty(child)
    this._markChildrenDirty()
  }

  removeChild(child: RNNode | RNTextNode | RNCommentNode): void {
    child.parentNode = null
    const idx = this._children.indexOf(child)
    if (idx !== -1) this._children.splice(idx, 1)
    unregisterFromInstanceMap(child)
    this._markChildrenDirty()
  }

  insertBefore(child: RNNode | RNTextNode | RNCommentNode, ref?: RNNode | RNTextNode | RNCommentNode): void {
    child.parentNode = this
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
    this._markSubtreeDirty(child)
    this._markChildrenDirty()
  }

  /** @internal - Mark a node and all its descendants as needing a full
   *  Fabric reprocess (props + children). Used when a subtree is
   *  re-inserted after removal (e.g. tab switching). When the subtree
   *  comes back, its old Fabric handles may be stale, so we force a
   *  complete re-process from the root on the next flush. */
  private _markSubtreeDirty(node: RNNode | RNTextNode | RNCommentNode): void {
    if (node.nodeType === 8) return
    if (node.nodeType === 3) return
    const n = node as RNNode
    n._propsDirty = true
    n._childrenDirty = true
    // We reach into internal state; these are always present on RNNode.
    // _dirtyPropsKeys is initialized in the constructor as a Set.
    if (n._dirtyPropsKeys) {
      n._dirtyPropsKeys.add('style')
      n._dirtyPropsKeys.add('onTouchEnd')
    }
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
    this._markDirty('props', name)
  }

  replaceChild(newChild: RNNode | RNTextNode | RNCommentNode, oldChild: RNNode | RNTextNode | RNCommentNode): void {
    const idx = this._children.indexOf(oldChild)
    if (idx === -1) return
    oldChild.parentNode = null
    unregisterFromInstanceMap(oldChild)
    newChild.parentNode = this
    this._children[idx] = newChild
    this._markChildrenDirty()
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
    _options?: boolean | AddEventListenerOptions
  ): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set())
    }
    this._listeners.get(type)!.add(handler)
  }

  removeEventListener(
    type: string,
    handler: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions
  ): void {
    this._listeners.get(type)?.delete(handler)
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this._listeners.get(event.type)
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

  get firstChild(): RNNode | null {
    for (const c of this._children) {
      if (c.nodeType === 1) return c as RNNode
    }
    return null
  }

  get lastChild(): RNNode | null {
    for (let i = this._children.length - 1; i >= 0; i--) {
      if (this._children[i].nodeType === 1) return this._children[i] as RNNode
    }
    return null
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
    // Remove all existing children
    for (const child of [...this._children]) {
      this.removeChild(child)
    }
    // Append a single text node if value is non-empty
    if (value) {
      this.appendChild(this.ownerDocument.createTextNode(value))
    }
  }

  cloneNode(deep: boolean = false): RNNode {
    const clone = this.ownerDocument.createElement(this.tagName, { ...this.currentProps })
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
}

// ============================================================================
// RNBody (body 是 root 的概念，继承 RNBody)
// ============================================================================

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
  }

  // Use inherited _markChildrenDirty / removeChild from RNNode.
  // _markDirty calls _getRoot()._scheduleFlush() which is body._scheduleFlush().

  private _flushGeneration = 0

  /**
   * Schedule flush on next tick
   */
  _scheduleFlush(): void {
    if (this._flushScheduled) return
    this._flushScheduled = true
    const gen = ++this._flushGeneration

    setTimeout(() => {
      if (this._flushGeneration !== gen) return // cancelled by completeFabric
      this._flushScheduled = false
      this._submitToRoot()
    }, 0)
  }

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
   * Get Fabric node for a child, handling both props and children updates.
   * Props changes use cloneNodeWithNewProps; children changes use cloneNodeWithNewChildren.
   */
  _getFabricNode(child: RNNode | RNTextNode | RNCommentNode): unknown {
    if ('node' in child) {
      return child.node
    }

    if (child.nodeType === 8) {
      return null
    }

    let fabricNode = child[FABRIC_NODE]
    const fabricUIManager = getFabricUIManager()

    // Handle props changes first — cloneNodeWithNewChildren inherits updated props
    if (child._propsDirty && child._hasPropsChanged()) {
      const nativeName = child.tagName.startsWith('RCT') || child.tagName.startsWith('Android')
        ? child.tagName
        : `RCT${child.tagName}`
      let viewConfig
      try {
        viewConfig = ReactNativePrivateInterface.ReactNativeViewConfigRegistry.get(nativeName)
      } catch (e) {
        viewConfig = undefined
      }

      const validAttrs = viewConfig?.validAttributes || {}
      const fabricProps = prepareFabricProps(child.currentProps)
      let updatePayload
      try {
        // We deliberately skip React Native's createAttributePayload for
        // color-bearing styles. That helper auto-runs the processColor
        // function for `backgroundColor` / `color` / etc., and Fabric's
        // PropsParser then runs it again — the byte-rotation in
        // processColor shifts the channels and the color lands as the
        // wrong int (often transparent) on the native side. Our
        // buildFabricPayload forwards the original color string and lets
        // Fabric process it exactly once.
        updatePayload = buildFabricPayload(fabricProps, validAttrs)
      } catch (e: any) {
        throw e
      }
      fabricNode = fabricUIManager.cloneNodeWithNewProps(fabricNode, updatePayload)
      child[FABRIC_NODE] = fabricNode
      child._propsSnapshot = { ...fabricProps }
      child._dirtyPropsKeys.clear()
      child._propsDirty = false
    }

    // Handle children changes — only when actually dirty
    if (child._childrenDirty && child._children.length > 0) {
      const childSet = fabricUIManager.createChildSet()

      for (const subChild of child._children) {
        const subFabricNode = this._getFabricNode(subChild)
        if (subFabricNode) {
          fabricUIManager.appendChildToSet(childSet, subFabricNode)
        }
      }

      fabricNode = fabricUIManager.cloneNodeWithNewChildren(fabricNode, childSet)
      child[FABRIC_NODE] = fabricNode
      child._childrenDirty = false
    }

    return fabricNode
  }

  /**
   * Synchronously commit the current tree to Fabric.
   * Cancels any pending async flush.
   */
  completeFabric(): void {
    this._flushGeneration++ // cancel pending async flush
    this._flushScheduled = false
    this._submitToRoot()
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
        console.error('[Rasen] setNativeProps error:', err)
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

// Mapping from Fabric event types to DOM event types
const FABRIC_TO_DOM_EVENT: Record<string, string> = {
  topTouchEnd: 'touchend',
  topTouchStart: 'touchstart',
  topTouchMove: 'touchmove',
  topTouchCancel: 'touchcancel',
  topClick: 'click',
}

function dispatchEventWithBubble(
  instanceHandle: object,
  type: string,
  nativeEvent: Record<string, unknown>
): void {
  // In RN 0.76.9 Fabric, the target tag is passed via nativeEvent.target.
  // The instanceHandle is a JSI HostObject whose properties may not be
  // directly accessible via enum keys or dot notation.
  const targetTag = (nativeEvent as any)?.target
  if (targetTag == null || typeof targetTag !== 'number') return

  const instanceMap = getInstanceMap()
  let current: RNNode | null = instanceMap.get(targetTag) || null
  // Fallback: use stateNode from instanceHandle if available
  const stateNode = (instanceHandle as any)?.stateNode
  if (!current && stateNode) {
    current = stateNode
  }

  const basePropName = 'on' + type.replace(/^top/, '')
  const domEventType = FABRIC_TO_DOM_EVENT[type] || type

  // Bubble up the parent chain
  while (current) {
    // 1. Check props-based handler (onTouchEnd, onPress, etc.)
    const props = current.currentProps
    let handler = props[basePropName]
    if (!handler && type === 'topTouchEnd') {
      handler = props.onPress
    }

    if (typeof handler === 'function') {
      const eventObj = { ...nativeEvent, type: domEventType, target: current, nativeEvent }
      ;(handler as (event: Record<string, unknown>) => void)(eventObj)
      return
    }

    // 2. Check addEventListener-based handlers
    const listeners = current._listeners?.get(domEventType)
    if (listeners && listeners.size > 0) {
      let prevented = false
      const event: Event = {
        type: domEventType,
        target: current as unknown as EventTarget,
        nativeEvent,
        get defaultPrevented() { return prevented },
        preventDefault() { prevented = true },
      } as unknown as Event
      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener(event)
        } else {
          listener.handleEvent(event)
        }
        if (prevented) break
      }
      return
    }

    current = current.parentNode
  }
}

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
  }
  // Recurse into children
  if ('_children' in node) {
    for (const child of (node as RNNode)._children) {
      unregisterFromInstanceMap(child)
    }
  }
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
