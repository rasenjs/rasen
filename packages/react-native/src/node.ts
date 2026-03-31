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
import type { FabricNode, FabricUIManager } from './fabric-global'

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
  const styleObj: Record<string, unknown> = {}

  return {
    setProperty(property: string, value: unknown): void {
      const currentStyle = (element.currentProps.style || {}) as Record<string, unknown>
      const newStyle = {
        ...currentStyle,
        [property]: value
      }

      element.currentProps.style = newStyle
      styleObj[property] = value
      element._requestUpdate()
    },

    removeProperty(property: string): void {
      const currentStyle = (element.currentProps.style || {}) as Record<string, unknown>
      const newStyle = { ...currentStyle }
      delete newStyle[property]

      element.currentProps.style = newStyle
      delete styleObj[property]
      element._requestUpdate()
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
    try {
      const tag = allocateTag()
      const nativeName = tagName.startsWith('RCT') ? tagName : `RCT${tagName}`
      
      const resolvedProps = this._resolveProps(props)
      const viewConfig = ReactNativePrivateInterface.ReactNativeViewConfigRegistry.get(nativeName)
      const updatePayload = ReactNativePrivateInterface.createAttributePayload(
        resolvedProps,
        viewConfig.validAttributes
      )
      
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
    } catch (error) {
      console.error('[Rasen] createElement error:', error)
      throw error
    }
  }
  
  createTextNode(text: string): RNTextNode {
    const tag = allocateTag()
    
    const instanceHandle: InstanceHandle = { tag: 6, stateNode: null }
    
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
    // RN doesn't have native comment nodes, use empty RawText as placeholder
    const tag = allocateTag()
    const instanceHandle = { tag: 8, stateNode: null as unknown }
    
    const fabricNode = getFabricUIManager().createNode(
      tag,
      'RCTRawText',
      this._rnRootTag,
      { text: '' },
      instanceHandle
    )
    
    const commentNode = new RNCommentNode(fabricNode, data, this)
    instanceHandle.stateNode = commentNode
    
    return commentNode
  }
  
  /**
   * 创建 DocumentFragment
   */
  createDocumentFragment(): RNFragment {
    const fragment = new RNFragment()
    fragment._ownerDocument = this
    return fragment
  }
  
  private _rnInitEventSystem(): void {
    const g = globalThis as Record<string, unknown>
    const HANDLER_KEY = '__RASEN_EVENT_HANDLER_REGISTERED__'
    
    if (g[HANDLER_KEY] === true) return

    const uim = getFabricUIManager()
    if (uim.registerEventHandler) {
      uim.registerEventHandler(dispatchEventWithBubble)
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
  _children: (RNNode | RNTextNode | RNCommentNode)[] = []

  // =========================================================================
  // Constructor
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
  private _markDirty(type: 'props' | 'children'): void {
    if (type === 'props') {
      if (this._propsDirty) return
      this._propsDirty = true
    } else {
      if (this._childrenDirty) return
      this._childrenDirty = true
    }
    this._getRoot()._collectDirty(this)
    this.parentNode?._markChildrenDirty()
  }

  /** @internal - Mark children as changed */
  protected _markChildrenDirty(): void {
    this._markDirty('children')
  }

  /** @internal - Check if props actually changed */
  public _hasPropsChanged(): boolean {
    const snap = this._propsSnapshot
    const curr = this.currentProps
    for (const key in curr) {
      if (snap[key] !== curr[key]) return true
    }
    for (const key in snap) {
      if (snap[key] !== curr[key]) return true
    }
    return false
  }

  /** @internal - Clear dirty flags */
  protected _clearDirty(): void {
    this._propsDirty = false
    this._childrenDirty = false
  }

  /** @internal - Request update (used by style object) */
  _requestUpdate(): void {
    this._markDirty('props')
  }

  // =========================================================================
  // Public DOM-like API
  // =========================================================================

  setAttribute(name: string, value: unknown): void {
    this.currentProps = { ...this.currentProps, [name]: value }
    this._markDirty('props')
  }

  appendChild(child: RNNode | RNTextNode | RNCommentNode): void {
    child.parentNode = this
    this._children.push(child)
    this._markChildrenDirty()
  }

  removeChild(child: RNNode | RNTextNode | RNCommentNode): void {
    child.parentNode = null
    const idx = this._children.indexOf(child)
    if (idx !== -1) this._children.splice(idx, 1)
    this._markChildrenDirty()
  }

  insertBefore(child: RNNode | RNTextNode | RNCommentNode, ref?: RNNode | RNTextNode | RNCommentNode): void {
    child.parentNode = this
    if (!ref) {
      this.appendChild(child)
    } else {
      this.appendChild(child)
    }
  }
}

// ============================================================================
// RNBody (body 是 root 的概念，继承 RNNode)
// ============================================================================

/**
 * RNBody represents the document.body which is the root container
 * It manages batched updates using dirty flag propagation
 */
export class RNBody extends RNNode {
  // Dirty nodes collected for batched update
  private _dirtyNodes: Set<RNNode> = new Set()

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

  /**
   * Override to not propagate up (root doesn't need to propagate further)
   */
  protected _markChildrenDirty(): void {
    // Root doesn't propagate further up
  }

  /**
   * Override appendChild to track children
   */
  appendChild(child: RNNode | RNTextNode | RNCommentNode): void {
    child.parentNode = this
    this._children.push(child as RNNode | RNTextNode)
  }

  /**
   * Override removeChild to track children
   */
  removeChild(child: RNNode | RNTextNode | RNCommentNode): void {
    child.parentNode = null
    const idx = this._children.indexOf(child)
    if (idx !== -1) this._children.splice(idx, 1)
  }

  /**
   * Collect dirty nodes and schedule flush
   */
  _collectDirty(node: RNNode): void {
    if (this._dirtyNodes.has(node)) return
    this._dirtyNodes.add(node)
    this._scheduleFlush()
  }

  /**
   * Schedule flush on next animation frame
   */
  _scheduleFlush(): void {
    if (this._flushScheduled) return
    this._flushScheduled = true

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this._flushScheduled = false
        this._flushUpdates()
      })
    }
  }

  /**
   * Flush all pending updates to Fabric
   */
  _flushUpdates(): void {
    if (this._dirtyNodes.size === 0) return

    // Collect all dirty nodes and sort by depth (deepest first)
    const nodes = Array.from(this._dirtyNodes)
    nodes.sort((a, b) => {
      let depthA = 0, depthB = 0
      let nodeA: RNNode | null = a
      let nodeB: RNNode | null = b
      while (nodeA) { depthA++; nodeA = nodeA.parentNode }
      while (nodeB) { depthB++; nodeB = nodeB.parentNode }
      return depthB - depthA // Process deeper nodes first
    })

    // Process each dirty node
    for (const node of nodes) {
      this._cloneNodeIfNeeded(node)
    }

    // Clear dirty nodes
    this._dirtyNodes.clear()

    // Complete root submission
    this._completeRoot()
  }

  /**
   * Clone a node if props or children actually changed
   */
  _cloneNodeIfNeeded(node: RNNode): void {
    const fabricUIManager = getFabricUIManager()

    // Check props changes
    const propsChanged = node._hasPropsChanged()
    const childrenChanged = node._childrenDirty

    if (!propsChanged && !childrenChanged) {
      // Nothing actually changed, just clear flags
      node._propsDirty = false
      node._childrenDirty = false
      return
    }

    // Get old fabric node
    const oldFabricNode = node[FABRIC_NODE]

    if (childrenChanged && !propsChanged) {
      // Only children changed - clone with new children
      const childSet = fabricUIManager.createChildSet(node[FABRIC_NODE_ID])

      // Collect current children (we need to track them)
      for (const child of node._getFabricChildren()) {
        fabricUIManager.appendChildToSet(childSet, child)
      }

      const newFabricNode = fabricUIManager.cloneNodeWithNewChildren(oldFabricNode, childSet)
      node[FABRIC_NODE] = newFabricNode
    } else if (propsChanged && !childrenChanged) {
      // Only props changed - clone with new props
      const nativeName = node.tagName.startsWith('RCT') ? node.tagName : `RCT${node.tagName}`
      const viewConfig = ReactNativePrivateInterface.ReactNativeViewConfigRegistry.get(nativeName)
      const updatePayload = ReactNativePrivateInterface.createAttributePayload(
        node.currentProps,
        viewConfig.validAttributes
      )

      const newFabricNode = fabricUIManager.cloneNodeWithNewProps(oldFabricNode, updatePayload)
      node[FABRIC_NODE] = newFabricNode

      // Update snapshot
      node._propsSnapshot = { ...node.currentProps }
    } else {
      // Both changed - clone with both
      const nativeName = node.tagName.startsWith('RCT') ? node.tagName : `RCT${node.tagName}`
      const viewConfig = ReactNativePrivateInterface.ReactNativeViewConfigRegistry.get(nativeName)
      const updatePayload = ReactNativePrivateInterface.createAttributePayload(
        node.currentProps,
        viewConfig.validAttributes
      )
      const childSet = fabricUIManager.createChildSet(node[FABRIC_NODE_ID])
      for (const child of node._getFabricChildren()) {
        fabricUIManager.appendChildToSet(childSet, child)
      }

      const newFabricNode = fabricUIManager.cloneNodeWithNewChildrenAndProps(
        oldFabricNode,
        childSet,
        updatePayload
      )
      node[FABRIC_NODE] = newFabricNode
      node._propsSnapshot = { ...node.currentProps }
    }

    // Clear dirty flags
    node._propsDirty = false
    node._childrenDirty = false
  }

  /**
   * Complete Fabric submission
   */
  _completeRoot(): void {
    // Create child set from current children
    const childSet = getFabricUIManager().createChildSet(this[FABRIC_NODE_ID])

    // Collect children from pending or use direct append
    const children = this._getFabricChildren()
    for (const child of children) {
      getFabricUIManager().appendChildToSet(childSet, child)
    }

    getFabricUIManager().completeRoot(this[FABRIC_NODE_ID], childSet)
  }

  /**
   * Legacy API for backwards compatibility
   */
  completeFabric(): void {
    this._flushUpdates()
  }
}

// ============================================================================
// RNFragment (模拟 DocumentFragment)
// ============================================================================

/**
 * RNFragment - 模拟 DOM DocumentFragment
 * 
 * 用于批量操作子节点，类似 DOM:
 * - appendChild 添加到 fragment（不触发真实 append）
 * - flush 将所有子节点移动到目标父节点
 * - flush 后 fragment 本身变为空
 */
export class RNFragment {
  private _children: (RNNode | RNTextNode)[] = []
  _ownerDocument: RNDocument | null = null
  parentNode: RNNode | null = null
  
  get ownerDocument(): RNDocument {
    return this._ownerDocument!
  }
  
  constructor() {
    this._ownerDocument = null
  }
  
  /**
   * 添加子节点到 fragment
   * 不触发真实 Fabric 操作
   */
  appendChild(child: RNNode | RNTextNode): void {
    child.parentNode = this as unknown as RNNode
    this._children.push(child)
    
    // 获取 ownerDocument 从第一个子节点
    if (!this._ownerDocument) {
      this._ownerDocument = child.ownerDocument
    }
  }
  
  /**
   * 获取 fragment 中的所有子节点
   */
  get children(): (RNNode | RNTextNode)[] {
    return this._children
  }
  
  /**
   * 获取子节点数量
   */
  get childCount(): number {
    return this._children.length
  }
  
  /**
   * 将 fragment 内容 flush 到目标节点
   * 使用 cloneNodeWithNewChildren 批量替换
   */
  flush(target: RNNode): void {
    if (this._children.length === 0) return
    
    const targetFabricNode = target[FABRIC_NODE]
    
    // 构建 childSet
    const childSet = getFabricUIManager().createChildSet(target[FABRIC_NODE_ID])
    for (const child of this._children) {
      const fabricNode = 'node' in child ? child.node : child[FABRIC_NODE]
      getFabricUIManager().appendChildToSet(childSet, fabricNode)
    }
    
    // 使用 cloneNodeWithNewChildren 替换目标节点的子节点
    const newNode = getFabricUIManager().cloneNodeWithNewChildren(
      targetFabricNode,
      childSet
    )
    
    // 更新目标节点的 FABRIC_NODE 引用
    target[FABRIC_NODE] = newNode
    
    // 清空 fragment
    this._children.length = 0
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
}

// ============================================================================
// RNCommentNode (模拟 Comment - 用于占位符/marker)
// ============================================================================

export class RNCommentNode {
  // Internal Fabric field (hidden via Symbol)
  [FABRIC_NODE]: FabricNode
  
  // DOM-like public API
  readonly nodeType = 8 as const  // Comment node
  readonly ownerDocument: RNDocument
  parentNode: RNNode | null = null
  
  private _data: string
  
  constructor(fabricNode: FabricNode, data: string, ownerDocument: RNDocument) {
    this[FABRIC_NODE] = fabricNode
    this._data = data
    this.ownerDocument = ownerDocument
  }
  
  get data(): string {
    return this._data
  }
  
  // Comment nodes are immutable in our implementation
  get nodeValue(): string {
    return this._data
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

function dispatchEventWithBubble(
  _instanceHandle: object,
  type: string,
  nativeEvent: Record<string, unknown>
): void {
  const target = nativeEvent?.target as number | undefined
  if (!target) return

  const instanceMap = getInstanceMap()
  let current: RNNode | null = instanceMap.get(target) || null

  const basePropName = 'on' + type.replace(/^top/, '')

  // Bubble up the parent chain
  while (current) {
    const props = current.currentProps

    // For touchEnd events, check both onTouchEnd and onPress (for touchables)
    let handler = props[basePropName]
    if (!handler && type === 'topTouchEnd') {
      handler = props.onPress
    }

    if (typeof handler === 'function') {
      ;(handler as (event: Record<string, unknown>) => void)(nativeEvent)
      return
    }

    current = current.parentNode
  }
}

// ============================================================================
// Mount Helpers
// ============================================================================

export function mountToContainer(
  rootTag: Container,
  ...nodes: (RNNode | RNTextNode | RNCommentNode)[]
): void {
  const childSet = getFabricUIManager().createChildSet(rootTag)
  for (const node of nodes) {
    getFabricUIManager().appendChildToSet(childSet, node[FABRIC_NODE])
  }
  getFabricUIManager().completeRoot(rootTag, childSet)
}

// Export Host type alias and FABRIC_NODE symbol
export type Host = RNNode
export { FABRIC_NODE, FABRIC_NODE_ID }
