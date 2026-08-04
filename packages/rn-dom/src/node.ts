/**
 * @rasenjs/rn-dom — RNNode: DOM-like node model for React Native Fabric
 *
 * 节点家族 + 通用基础设施(与 Fabric 提交逻辑解耦)。
 * RNDocument / RNBody(Fabric 提交)在 index.ts,RNBody extends 这里的 RNNode。
 *
 * 每个原生标签的 JS 层行为(props / events / children)由各自的子类承载
 * (见 ./elements/*),RNNode 提供默认实现与 hook:
 *   - __RN_normalizeProps():   prop 转换,子类 override
 *   - __RN_handleNativeEvent():原生事件处理,子类 override
 *   - __RN_buildChildren():    children 结构构建,子类 override
 *   - __RN_resolveNativeName():mount-time 原生名覆盖,子类 override
 *   - __RN_syncControlledProp():受控回写同步,子类 override
 *   - __RN_preparePayload():   Fabric payload 预处理,子类 override
 *
 * 注意:node.ts 是基类,index.ts 依赖它,因此这里对 index.ts 只做 type-only
 * import(RNDocument / RNBody),避免运行时循环依赖。
 */

import type { FabricNode, FabricUIManager } from './fabric-global'
import { unregisterModalNode, type EventNode } from './event-system'
// type-only: RNNode.ownerDocument 需要 RNDocument 类型,
// 但它们定义在 index.ts(index.ts 运行时 import 本模块 → 单向,无运行时循环)。
import type { RNDocument } from './index'
// 内部协调函数(D 类)集中在 ./internal.ts,不挂实例。
// internal.ts 对本模块只做 type-only import → 无运行时循环。
import {
  FABRIC_NODE,
  FABRIC_NODE_ID,
  getFabricUIManager,
  markDirty,
  markChildrenDirty,
  requestUpdate,
  markSubtreeDirty,
} from './internal'
// 保持既有导出面(FABRIC_NODE / FABRIC_NODE_ID / getFabricUIManager)。
export { FABRIC_NODE, FABRIC_NODE_ID, getFabricUIManager } from './internal'
// aria 通用转换(shared.ts 不 import 本模块,无循环)。
import { applyAria } from './elements/shared'

export type Props = Record<string, unknown>

/**
 * @internal - 库内部跨实例/独立函数访问 RNNode 内部成员的安全视角。
 *
 * TS 的 protected 成员不允许"通过基类类型实例"访问,但库内部的协调逻辑
 * (RNBody.__RN_getFabricNode、独立命令 helper、createStyleObject 等)需要访问
 * 子节点的内部状态。该接口显式列出这些成员,供 `as unknown as RNDomInternalNode`
 * cast 使用。**这不是公共 API,用户不应使用。**
 */
export interface RNDomInternalNode {
  [FABRIC_NODE]: FabricNode
  [FABRIC_NODE_ID]: number
  tagName: string
  parentNode: RNNode | null
  ownerDocument: RNDocument
  __RN_currentProps: Props
  __RN_mounted: boolean
  __RN_nativeName: string
  __RN_instanceHandle: InstanceHandle | null
  __RN_propsDirty: boolean
  __RN_childrenDirty: boolean
  __RN_propsSnapshot: Props
  __RN_dirtyPropsCount: number
  __RN_children: (RNNode | RNTextNode | RNCommentNode)[]
  __RN_classList: Set<string> | null
  __RN_lastValidAttrs: Record<string, unknown> | null
  __RN_listeners: Map<string, Set<EventListenerOrEventListenerObject>> | null
  // RNBody 调度字段(internal.scheduleFlush 访问)。
  __RN_flushScheduled: boolean
  __RN_flushGeneration: number
  __RN_alwaysBuildChildren: boolean
  // per-tag 多态 hook(仍挂实例,子类 override)。
  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown>
  __RN_handleNativeEvent?(type: string, event: Record<string, unknown>): boolean | void
  __RN_buildChildren(
    childSet: unknown,
    fabricUIManager: FabricUIManager,
    rootTag: number,
    getFabricNode: (node: RNNode | RNTextNode | RNCommentNode) => unknown,
  ): void
  __RN_resolveNativeName(): string | null
  __RN_syncControlledProp(name: string): void
  __RN_preparePayload(props: Record<string, unknown>): void
}

// ============================================================================
// Fabric Interop (shared)
// ============================================================================

// getFabricUIManager 已收进 ./internal.ts,这里 re-export 保持导出面。

// Instance handle for Fabric nodes
export interface InstanceHandle {
  tag: number
  stateNode: unknown
}

// ============================================================================
// Symbol Keys (Internal Implementation)
// ============================================================================

// FABRIC_NODE / FABRIC_NODE_ID 已收进 ./internal.ts,这里 re-export 保持导出面。

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
 * reference each time, because __RN_propsSnapshot stores a shallow copy of
 * __RN_currentProps. If we mutate in-place, __RN_propsSnapshot.style and
 * __RN_currentProps.style point to the same object, and RN's
 * diffAttributePayloads sees no change — skipping the Fabric update.
 */
function createStyleObject(element: RNNode) {
  // 内部函数需访问 protected __RN_requestUpdate,cast 到内部接口(库内部允许)。
  const el = element as unknown as RNDomInternalNode
  return {
    setProperty(property: string, value: unknown): void {
      const oldStyle = el.__RN_currentProps.style as Record<string, unknown> | undefined
      el.__RN_currentProps = {
        ...el.__RN_currentProps,
        style: { ...(oldStyle ?? {}), [property]: value },
      }
      requestUpdate(el)
    },

    removeProperty(property: string): void {
      const currentStyle = el.__RN_currentProps.style as Record<string, unknown> | undefined
      if (currentStyle && property in currentStyle) {
        const rest = { ...currentStyle }
      delete rest[property]
        // Manual empty-check avoids Object.keys().length array allocation
        let empty = true
        for (const _ in rest) { empty = false; break }
        el.__RN_currentProps = {
          ...el.__RN_currentProps,
          style: empty ? {} : rest,
        }
        requestUpdate(el)
      }
    },

    getPropertyValue(property: string): unknown {
      const currentStyle = (el.__RN_currentProps.style || {}) as Record<string, unknown>
      return currentStyle[property]
    }
  }
}

// ============================================================================
// Instance Map + Focus Management
// ============================================================================

const INSTANCE_MAP_KEY = '__RASEN_INSTANCE_MAP__'

/** Map Fabric tag → RNNode, so Fabric events can find their target node. */
export function getInstanceMap(): Map<number, RNNode> {
  const g = globalThis as Record<string, unknown>
  if (!g[INSTANCE_MAP_KEY]) {
    g[INSTANCE_MAP_KEY] = new Map<number, RNNode>()
  }
  return g[INSTANCE_MAP_KEY] as Map<number, RNNode>
}

// ============================================================================
// Tag Counter (Fabric node ids)
// ============================================================================

let nextReactTag = 2

/** Allocate the next Fabric node tag (even numbers, like React). */
export function allocateTag(): number {
  const tag = nextReactTag
  nextReactTag += 2
  return tag
}

/** Reset the tag counter (used by tests / hot reload). */
export function resetTagCounter(): void {
  nextReactTag = 2
}

/** Track the currently focused node for blur-on-tap-outside behavior. */
let _focusedNode: RNNode | null = null

/** Helper: blur the currently focused node (if any) via Fabric dispatchCommand. */
export function _blurFocusedNode(): void {
  if (!_focusedNode) return
  const n = _focusedNode as unknown as RNDomInternalNode
  try {
    const uim = getFabricUIManager()
    if (typeof uim.dispatchCommand === 'function' && typeof uim.findShadowNodeByTag_DEPRECATED === 'function') {
      const tag = n[FABRIC_NODE_ID]
      const shadowNode = uim.findShadowNodeByTag_DEPRECATED(tag)
      if (shadowNode) {
        uim.dispatchCommand(shadowNode, 'blur', [])
      }
    }
  } catch (_) { /* dispatchCommand may not be available */ }
  _focusedNode = null
}

/** Helper: focus a node via Fabric dispatchCommand. */
export function _focusNode(node: RNNode): void {
  const n = node as unknown as RNDomInternalNode
  try {
    const uim = getFabricUIManager()
    if (typeof uim.dispatchCommand === 'function' && typeof uim.findShadowNodeByTag_DEPRECATED === 'function') {
      const tag = n[FABRIC_NODE_ID]
      const shadowNode = uim.findShadowNodeByTag_DEPRECATED(tag)
      if (shadowNode) {
        uim.dispatchCommand(shadowNode, 'focus', [])
      }
    }
  } catch (_) { /* dispatchCommand may not be available */ }
  _focusedNode = node
}

/** Get the currently focused node (may be null). */
export function getFocusedNode(): RNNode | null {
  return _focusedNode
}

/**
 * Recursively register a node and its descendants in the instance map
 * so event handlers on them can be found by dispatchEventWithBubble.
 */
export function registerInInstanceMap(node: RNNode | RNTextNode | RNCommentNode): void {
  if (node.nodeType === 8) return // Skip comment nodes (no tag)
  const map = getInstanceMap()
  if ('tagName' in node) {
    const n = node as unknown as RNDomInternalNode
    if (!map.has(n[FABRIC_NODE_ID])) {
      map.set(n[FABRIC_NODE_ID], node as RNNode)
    }
  }
  // Recurse into children
  if ('__RN_children' in node) {
    const n = node as unknown as RNDomInternalNode
    for (const child of n.__RN_children) {
      registerInInstanceMap(child)
    }
  }
}

export function unregisterFromInstanceMap(node: RNNode | RNTextNode | RNCommentNode): void {
  if (node.nodeType === 8) return // Skip comment nodes (no tag)
  const map = getInstanceMap()
  if ('tagName' in node) {
    const n = node as unknown as RNDomInternalNode
    map.delete(n[FABRIC_NODE_ID])
    // Clean up Modal identifier mapping on unmount.
    if (n.tagName === 'Modal' || (n.__RN_nativeName ?? '').includes('ModalHostView')) {
      unregisterModalNode(node as unknown as EventNode)
    }
  }
  // Recurse into children
  if ('__RN_children' in node) {
    const n = node as unknown as RNDomInternalNode
    for (const child of n.__RN_children) {
      unregisterFromInstanceMap(child)
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
  /** @internal Fabric 节点句柄(symbol 键,库内部访问)。 */
  protected [FABRIC_NODE]: FabricNode
  /** @internal Fabric 节点 id(symbol 键,库内部访问)。 */
  protected [FABRIC_NODE_ID]: number

  // =========================================================================
  // Public DOM-like properties
  // =========================================================================
  readonly nodeName = 'Element' as const
  readonly tagName: string
  readonly nodeType = 1 as const  // Element node
  readonly ownerDocument: RNDocument
  readonly style: ReturnType<typeof createStyleObject>

  /** @internal 当前 props(协调/事件/样式读取,非 DOM 标准)。 */
  protected __RN_currentProps: Props
  parentNode: RNNode | null = null

  // =========================================================================
  // DOM Class List API
  // =========================================================================

  /**
   * Get the class list as a DOMTokenList-like object.
   * Lazily allocates the underlying Set on first access.
   */
  get classList(): RASENTokenList {
    if (!this.__RN_classList) this.__RN_classList = new Set()
    return new RASENTokenList(this.__RN_classList, () => {
      if (this.__RN_mounted) markDirty(this as unknown as RNDomInternalNode, 'props', 'class')
    })
  }

  /**
   * Get/set the className string (DOM-compatible alias for classList).
   */
  get className(): string {
    return this.__RN_classList ? [...this.__RN_classList].join(' ') : ''
  }

  set className(value: string) {
    const names = value.trim().split(/\s+/).filter(Boolean)
    if (!this.__RN_classList) this.__RN_classList = new Set()
    this.__RN_classList.clear()
    for (const n of names) this.__RN_classList.add(n)
    if (this.__RN_mounted) markDirty(this as unknown as RNDomInternalNode, 'props', 'class')
  }

  // =========================================================================
  // Internal state (库内部访问,不对外暴露)
  // =========================================================================
  /** @internal true once node has been committed to Fabric via createNode. */
  protected __RN_mounted = false
  /** @internal Native component name for Fabric createNode (e.g. 'RCTView'). */
  protected __RN_nativeName: string = ''
  /** @internal Instance handle for Fabric createNode. Set in createElement. */
  protected __RN_instanceHandle: InstanceHandle | null = null
  protected __RN_propsDirty = false
  protected __RN_childrenDirty = false
  protected __RN_propsSnapshot: Props = {}
  protected __RN_dirtyPropsCount = 0
  protected __RN_children: (RNNode | RNTextNode | RNCommentNode)[] = []
  /**
   * @internal true 时即使无 children 也调用 __RN_buildChildren(自闭合但需
   * 内部结构节点的元素,如 ActivityIndicator 的容器 + 内层 spinner)。
   */
  protected __RN_alwaysBuildChildren = false
  // Lazily allocated on first addEventListener call (most nodes never use it).
  protected __RN_listeners: Map<string, Set<EventListenerOrEventListenerObject>> | null = null
  /** CSS class list (DOM-style, resolved at flush time via StyleSheetList). */
  protected __RN_classList: Set<string> | null = null

  /** Last validAttributes (needed for children-only updates on mounted nodes). */
  protected __RN_lastValidAttrs: Record<string, unknown> | null = null

  // 受控状态(__RN_textInputState/__RN_switchNativeValue/__RN_lastNativeSelection)、ScrollView
  // 容器字段(_scrollContent*)已随 per-tag 逻辑收进对应节点类(elements/*)。
  // 基类只保留通用 DOM 状态。

  // =========================================================================
  // Constructor
  // NOTE: Use RNDocument.createElement() to create nodes.
  // Direct construction is for internal use only.
  // =========================================================================
  constructor(
    fabricNode: FabricNode,
    fabricNodeId: number,
    tagName: string,
    __RN_currentProps: Props,
    ownerDocument: RNDocument
  ) {
    this[FABRIC_NODE] = fabricNode
    this[FABRIC_NODE_ID] = fabricNodeId
    this.tagName = tagName
    this.__RN_currentProps = __RN_currentProps
    this.__RN_propsSnapshot = { ...__RN_currentProps }
    this.ownerDocument = ownerDocument
    this.style = createStyleObject(this)
  }

  // =========================================================================
  // Per-tag behavior hooks (override in ./elements/* subclasses)
  // =========================================================================

  /**
   * @internal - Per-tag JS-layer prop transforms (RN component semantics).
   * Base = View 语义:aria-* → accessibility 通用转换(View.js);元素子类
   * override 且末尾调用 shared.applyAria。
   */
  protected __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    return applyAria(props)
  }

  /**
   * @internal - 处理到达本节点的原生(Fabric)事件(由 event-system 的
   * dispatchEventWithBubble 调用)。
   * 返回 true 表示已消费(跳过该节点的通用 props-based handler 分发)。
   * 默认不处理;子类(TextInput/Switch/ScrollView 等)override 做 RN 组件的
   * 事件专属逻辑(onChangeText 变换、onContentSizeChange 转发、受控记录等)。
   */
  protected __RN_handleNativeEvent(_type: string, _event: Record<string, unknown>): boolean | void {
    // 默认不处理
  }

  /**
   * @internal - Mount-time 原生名覆盖(RN 按 props/ancestry 拆分原生层,如
   * TextInput multiline、Text selectable/嵌套)。返回要覆盖的原生名,
   * 或 null 保持 createElement 已解析的 __RN_nativeName。
   */
  protected __RN_resolveNativeName(): string | null {
    return null
  }

  /**
   * @internal - 受控组件回写同步(在 setAttribute 设置已挂载节点的 prop 后
   * 调用)。默认不处理;TextInput/Switch 等受控组件 override(RN 的
   * useLayoutEffect sync —— 当 JS value 与 native 记录不一致时回写命令)。
   */
  protected __RN_syncControlledProp(_name: string): void {
    // 默认不处理
  }

  /**
   * @internal - 挂载前 Fabric payload 预处理(buildFabricPayload 之前调用)。
   * 子类可注入额外 props(如 Modal 的 identifier)。
   */
  protected __RN_preparePayload(_fabricProps: Record<string, unknown>): void {
    // 默认不处理
  }

  /**
   * @internal - 构建该节点的 Fabric 子节点(追加到 childSet)。
   * 默认遍历 this.__RN_children,逐个经 getFabricNode 解析后 append。
   * 子类(ScrollView 等)override 做 children 结构包装(RN 语义,如单子容器)。
   */
  protected __RN_buildChildren(
    childSet: unknown,
    fabricUIManager: FabricUIManager,
    _rootTag: number,
    getFabricNode: (node: RNNode | RNTextNode | RNCommentNode) => unknown,
  ): void {
    for (const subChild of this.__RN_children) {
      const subFabricNode = getFabricNode(subChild)
      if (subFabricNode) {
        fabricUIManager.appendChildToSet(childSet, subFabricNode)
      }
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
    return this.__RN_children
  }

  /**
   * DOM-compatible children getter
   * Returns only Element children (filters out text/comment nodes)
   */
  get children(): RNNode[] {
    return this.__RN_children.filter(c => c.nodeType === 1) as RNNode[]
  }

  get childElementCount(): number {
    let count = 0
    for (const c of this.__RN_children) {
      if (c.nodeType === 1) count++
    }
    return count
  }

  // =========================================================================
  // Public DOM-like API
  // =========================================================================

  setAttribute(name: string, value: unknown): void {
    this.__RN_currentProps = { ...this.__RN_currentProps, [name]: value }
    // Only mark dirty if the node is already mounted in the Fabric tree.
    // Pre-mount nodes accumulate props via __RN_currentProps and get a full
    // init on first __RN_getFabricNode call, avoiding incremental cloneNode
    // issues with partial payloads.
    if (this.__RN_mounted) {
      markDirty(this as unknown as RNDomInternalNode, 'props', name)

      // 受控组件回写同步(RN 的 useLayoutEffect sync)——由节点类处理
      // (RNTextInputElement 的 value/selection、RNSwitchElement 的 value)。
      this.__RN_syncControlledProp(name)
    }
  }

  // =========================================================================
  // Imperative commands (RN component ref methods)
  //
  // Mirrors the commands exposed by RN's component refs (TextInput.focus(),
  // ScrollView.scrollTo(), Switch setValue, …). Backed by Fabric
  // dispatchCommand; no-ops before the node is committed to Fabric.
  // 底层命令封装(dispatchCommand / setNativeProps / setNativeRefreshing)
  // 已收进 ./internal.ts(模块函数,不挂实例)。
  // =========================================================================

  appendChild(child: RNNode | RNTextNode | RNCommentNode): void {
    child.parentNode = this
    this.__RN_children.push(child)
    registerInInstanceMap(child)
    markSubtreeDirty(child)
    if (this.__RN_mounted) {
      markChildrenDirty(this as unknown as RNDomInternalNode)
    }
  }

  removeChild(child: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode {
    child.parentNode = null
    const idx = this.__RN_children.indexOf(child)
    if (idx !== -1) this.__RN_children.splice(idx, 1)
    unregisterFromInstanceMap(child)
    if (this.__RN_mounted) {
      markChildrenDirty(this as unknown as RNDomInternalNode)
    }
    return child
  }

  insertBefore(child: RNNode | RNTextNode | RNCommentNode, ref: RNNode | RNTextNode | RNCommentNode | null): RNNode | RNTextNode | RNCommentNode {
    child.parentNode = this
    // Remove from old position first (DOM move semantics)
    const existingIdx = this.__RN_children.indexOf(child)
    if (existingIdx !== -1) {
      this.__RN_children.splice(existingIdx, 1)
    }
    if (!ref) {
      this.__RN_children.push(child)
    } else {
      const refIndex = this.__RN_children.indexOf(ref)
      if (refIndex === -1) {
        this.__RN_children.push(child)
      } else {
        this.__RN_children.splice(refIndex, 0, child)
      }
    }
    registerInInstanceMap(child)
    // Only mark subtree dirty for fresh (unmounted) nodes.
    // Already-mounted nodes keep their props; only the parent's child order changes.
    if (child.nodeType === 1 && !(child as RNNode).__RN_mounted) {
      markSubtreeDirty(child)
    }
    if (this.__RN_mounted) {
      markChildrenDirty(this as unknown as RNDomInternalNode)
    }
    return child
  }

  /** @internal - Recursively mark a subtree as needing a full Fabric
   *  reprocess (props + children). Used when a subtree is re-inserted
   *  after removal (e.g. tab switching). When the subtree comes back,
   *  its old Fabric handles may be stale, so we force a complete
   *  re-process from the root on the next flush.
   *
   *  Unlike `__RN_mounted` (which is only for first-time createNode deferral),
   *  this does NOT set `__RN_mounted = false` — re-inserted nodes keep their
   *  existing Fabric handle and get updated via cloneNode* in the mounted
   *  incremental path, which avoids leaking Fabric nodes.
   */
  getAttribute(name: string): unknown {
    return this.__RN_currentProps[name]
  }

  hasAttribute(name: string): boolean {
    return name in this.__RN_currentProps
  }

  removeAttribute(name: string): void {
    const next = { ...this.__RN_currentProps }
    delete next[name]
    this.__RN_currentProps = next
    if (this.__RN_mounted) {
      markDirty(this as unknown as RNDomInternalNode, 'props', name)
    }
  }

  replaceChild(newChild: RNNode | RNTextNode | RNCommentNode, oldChild: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode {
    const idx = this.__RN_children.indexOf(oldChild)
    if (idx === -1) return oldChild
    oldChild.parentNode = null
    unregisterFromInstanceMap(oldChild)
    newChild.parentNode = this
    this.__RN_children[idx] = newChild
    markSubtreeDirty(newChild)
    if (this.__RN_mounted) {
      markChildrenDirty(this as unknown as RNDomInternalNode)
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
    return this.__RN_children.length > 0
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
    if (!this.__RN_listeners) this.__RN_listeners = new Map()
    const capture = typeof options === 'boolean' ? options : !!options?.capture
    const key = capture ? `__capture_${type}` : type
    if (!this.__RN_listeners!.has(key)) {
      this.__RN_listeners!.set(key, new Set())
    }
    this.__RN_listeners!.get(key)!.add(handler)
  }

  removeEventListener(
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void {
    if (!this.__RN_listeners) return
    const capture = typeof options === 'boolean' ? options : !!options?.capture
    const key = capture ? `__capture_${type}` : type
    this.__RN_listeners.get(key)?.delete(handler)
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this.__RN_listeners?.get(event.type)
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
    return this.__RN_children[0] ?? null
  }

  get lastChild(): RNNode | RNTextNode | RNCommentNode | null {
    return this.__RN_children[this.__RN_children.length - 1] ?? null
  }

  get nextSibling(): RNNode | RNTextNode | RNCommentNode | null {
    if (!this.parentNode) return null
    const idx = this.parentNode.__RN_children.indexOf(this)
    if (idx === -1 || idx >= this.parentNode.__RN_children.length - 1) return null
    return this.parentNode.__RN_children[idx + 1]
  }

  get previousSibling(): RNNode | RNTextNode | RNCommentNode | null {
    if (!this.parentNode) return null
    const idx = this.parentNode.__RN_children.indexOf(this)
    if (idx <= 0) return null
    return this.parentNode.__RN_children[idx - 1]
  }

  get textContent(): string {
    return this.__RN_children.map(c => c.textContent || '').join('')
  }

  set textContent(value: string) {
    // Fast path: single text child + non-empty → update in-place (no Fabric node churn)
    if (value && this.__RN_children.length === 1 && this.__RN_children[0].nodeType === 3) {
      ;(this.__RN_children[0] as RNTextNode).textContent = value
      return
    }
    // Full replace: detach all existing children, add a new text node
    const oldChildren = this.__RN_children.splice(0)
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
    while (i < this.__RN_children.length) {
      const child = this.__RN_children[i]
      if (child.nodeType === 3) {
        // Merge with next sibling if also text
        while (i + 1 < this.__RN_children.length && this.__RN_children[i + 1].nodeType === 3) {
          const next = this.__RN_children[i + 1] as RNTextNode
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
    clone.__RN_currentProps = { ...this.__RN_currentProps }
    if (deep) {
      for (const child of this.__RN_children) {
        if ('cloneNode' in child && typeof (child as RNNode).cloneNode === 'function') {
          clone.appendChild((child as RNNode).cloneNode(true))
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

  // 注:measure 非 DOM 标准(见 index.ts 导出的 measure(node, cb) 独立函数)。
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
    const siblings = (this.parentNode as unknown as RNDomInternalNode).__RN_children
    const idx = siblings.indexOf(this)
    if (idx === -1 || idx >= siblings.length - 1) return null
    return siblings[idx + 1]
  }

  get previousSibling(): RNNode | RNTextNode | RNCommentNode | null {
    if (!this.parentNode) return null
    const siblings = (this.parentNode as unknown as RNDomInternalNode).__RN_children
    const idx = siblings.indexOf(this)
    if (idx <= 0) return null
    return siblings[idx - 1]
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
  __RN_children: (RNNode | RNTextNode | RNCommentNode)[]
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
  __RN_children: (RNNode | RNTextNode | RNCommentNode)[] = []

  constructor(ownerDocument: RNDocument) {
    this.ownerDocument = ownerDocument
  }

  get childNodes(): (RNNode | RNTextNode | RNCommentNode)[] {
    return this.__RN_children
  }

  appendChild(child: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode {
    child.parentNode = this as unknown as RNNode
    this.__RN_children.push(child)
    if (child.nodeType === 1) {
      registerInInstanceMap(child as RNNode)
    }
    return child
  }

  removeChild(child: RNNode | RNTextNode | RNCommentNode): RNNode | RNTextNode | RNCommentNode {
    const idx = this.__RN_children.indexOf(child)
    if (idx >= 0) this.__RN_children.splice(idx, 1)
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
      this.__RN_children.push(newChild)
    } else {
      const idx = this.__RN_children.indexOf(refChild)
      if (idx >= 0) this.__RN_children.splice(idx, 0, newChild)
      else this.__RN_children.push(newChild)
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
    const host = targetHost as unknown as RNDomInternalNode
    const items = this.__RN_children.splice(0)
    for (const child of items) {
      child.parentNode = null
    }
    const refIndex = before ? host.__RN_children.indexOf(before) : -1
    for (const child of items) {
      child.parentNode = targetHost
    }
    if (refIndex >= 0) {
      host.__RN_children.splice(refIndex, 0, ...items)
    } else {
      host.__RN_children.push(...items)
    }
    if (host.__RN_mounted) {
      markChildrenDirty(host as unknown as RNDomInternalNode)
    }
  }

  cloneNode(): RNDocumentFragment {
    return this.ownerDocument.createDocumentFragment()
  }
}
