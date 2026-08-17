/**
 * @rasenjs/rn-dom — 内部协调模块（非 DOM 标准逻辑）
 *
 * 这里集中"操作节点内部状态/协调 Fabric 提交"的函数，**不挂在节点实例上**
 * （RNNode.prototype 只保留 DOM API + 公共命令 + per-tag 多态 hook）。
 *
 * 设计约束：
 * - **type-only** import node.ts 的类型（编译后擦除），不产生运行时依赖，
 *   避免 node.ts ↔ internal.ts 循环。
 * - 运行时只依赖：全局 `nativeFabricUIManager`、`ReactNativePrivateInterface`
 *   、`Symbol.for` 注册表、`globalThis`。
 * - 参数一律用 `RNDomInternalNode`（内部面），调用方 cast。
 */

import ReactNativePrivateInterface from 'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface'

import type {
  RNNode,
  RNTextNode,
  RNCommentNode,
  RNDomInternalNode,
} from './node'
import type { FabricUIManager } from './fabric-global'

// ============================================================================
// Symbols + Fabric interop（与 node.ts 同值，Symbol.for 全局注册表保证一致）
// ============================================================================

/** @internal Fabric 节点句柄（symbol 键，运行时不可枚举/序列化）。 */
export const FABRIC_NODE = Symbol.for('fabricNode')
/** @internal Fabric 节点 id。 */
export const FABRIC_NODE_ID = Symbol.for('fabricNodeId')

/** 获取原生 Fabric UIManager（全局注册，测试在 globalThis 注入）。 */
export function getFabricUIManager(): FabricUIManager {
  if (!nativeFabricUIManager) {
    throw new Error('[RNDOM] nativeFabricUIManager not available')
  }
  return nativeFabricUIManager!
}

// ============================================================================
// Dirty 标记 + 更新调度
// ============================================================================

/**
 * @internal - 解析 classList 对应的样式(class 是 baseline,inline 覆盖)。
 * 由 Fabric 提交(getFabricNode)调用。通用逻辑,无子类 override → 模块函数。
 */
export function resolveClassStyles(node: RNDomInternalNode): Record<string, unknown> {
  if (!node.__RN_classList || node.__RN_classList.size === 0) return {}
  const styleSheets = node.ownerDocument.styleSheets
  if (!styleSheets || styleSheets._sheets.length === 0) return {}
  const result: Record<string, unknown> = {}
  for (const cls of node.__RN_classList) {
    const style = styleSheets._getStyle(cls)
    if (style) Object.assign(result, style)
  }
  return result
}

/** @internal - Mark node as dirty and propagate up. */
export function markDirty(
  node: RNDomInternalNode,
  type: 'props' | 'children',
  key?: string,
): void {
  if (type === 'props') {
    if (key) node.__RN_dirtyPropsCount++
    if (node.__RN_propsDirty) return
    node.__RN_propsDirty = true
  } else {
    if (node.__RN_childrenDirty) return
    node.__RN_childrenDirty = true
  }
  scheduleFlush(node.ownerDocument.body as unknown as RNDomInternalNode)
  if (node.parentNode) {
    markChildrenDirty(node.parentNode as unknown as RNDomInternalNode)
  }
}

/** @internal - Mark children as changed. */
export function markChildrenDirty(node: RNDomInternalNode): void {
  markDirty(node, 'children')
}

/** @internal - Check if props actually changed (O(1)). */
export function hasPropsChanged(node: RNDomInternalNode): boolean {
  return node.__RN_dirtyPropsCount > 0
}

/** @internal - Request update (used by style object). */
export function requestUpdate(node: RNDomInternalNode): void {
  if (node.__RN_mounted) {
    markDirty(node, 'props', 'style')
  }
}

/**
 * @internal - Recursively mark a subtree dirty (re-insert after removal).
 * Clears the snapshot so next flush sends ALL current props (full payload).
 */
export function markSubtreeDirty(node: RNNode | RNTextNode | RNCommentNode): void {
  if (node.nodeType === 8 || node.nodeType === 3) return
  const n = node as unknown as RNDomInternalNode
  n.__RN_propsDirty = true
  n.__RN_childrenDirty = true
  n.__RN_propsSnapshot = {}
  for (const child of n.__RN_children) {
    markSubtreeDirty(child)
  }
}

// ============================================================================
// Fabric 命令 + 原生 props 直写
// ============================================================================

/** @internal Dispatch a Fabric command to the mounted native node (no-op pre-mount). */
export function dispatchCommand(
  node: RNDomInternalNode,
  commandName: string,
  args: unknown[] = [],
): void {
  if (!node.__RN_mounted) return
  try {
    getFabricUIManager().dispatchCommand?.(node[FABRIC_NODE], commandName, args)
  } catch { /* no manager / node not committed */ }
}

/**
 * @internal Directly update native props, bypassing the diff (RN's
 * setNativeProps, deprecated but used for imperative updates). Applies
 * the per-tag __RN_normalizeProps hook too.
 */
export function setNativeProps(node: RNDomInternalNode, props: Record<string, unknown>): void {
  if (!node.__RN_mounted) return
  try {
    const uim = getFabricUIManager()
    if (typeof uim.setNativeProps === 'function') {
      uim.setNativeProps(node[FABRIC_NODE], node.__RN_normalizeProps({ ...props }))
    }
  } catch { /* no manager / node not committed */ }
}

/** @internal Force the native refresh indicator state (setNativeRefreshing). */
export function setNativeRefreshing(node: RNDomInternalNode, refreshing: boolean): void {
  dispatchCommand(node, 'setNativeRefreshing', [refreshing])
}

// ============================================================================
// Fabric payload 构建
// ============================================================================

/**
 * Build a FULL Fabric payload from props. Event handlers (onXxx) are stored
 * in __RN_currentProps as functions but sent to Fabric as boolean `true`
 * markers; createAttributePayload handles known attrs, we inject any missing
 * onXxx markers so Fabric dispatches events back to JS.
 */
export function buildFabricPayload(
  props: Record<string, unknown>,
  validAttrs: Record<string, unknown>,
): Record<string, unknown> | null {
  const result = ReactNativePrivateInterface.createAttributePayload(props, validAttrs)
  const payload = result ?? {}
  const added = injectEventMarkers(props, payload)
  return (result !== null || added) ? payload : null
}

/** Ensure all onXxx props appear as boolean `true` markers in the payload. */
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
 * Build an INCREMENTAL Fabric payload by diffing prevProps vs current props.
 * Only properties that actually changed are included, matching React's own
 * commit path. Callers MUST update `__RN_propsSnapshot` after applying.
 */
export function diffFabricPayload(
  prevProps: Record<string, unknown>,
  nextProps: Record<string, unknown>,
  validAttrs: Record<string, unknown>,
): Record<string, unknown> | null {
  const result = ReactNativePrivateInterface.diffAttributePayloads(prevProps, nextProps, validAttrs)
  const payload = result ?? {}
  const added = injectEventMarkers(nextProps, payload)
  return (result !== null || added) ? payload : null
}

// ============================================================================
// Fabric 提交（RNBody 协调：scheduleFlush / submitToRoot / getFabricNode）
// ============================================================================

/**
 * @internal Schedule a Fabric flush on next animation frame.
 * rAF batches all updates within a frame into a single completeRoot — this is
 * how React commits in RN (once per frame), avoiding a separate JNI round-trip
 * per state change. Falls back to queueMicrotask when rAF is unavailable.
 */
export function scheduleFlush(body: RNDomInternalNode): void {
  if (body.__RN_flushScheduled) return
  body.__RN_flushScheduled = true
  const gen = ++body.__RN_flushGeneration

  const flush = () => {
    if (body.__RN_flushGeneration !== gen) return // superseded by newer flush
    body.__RN_flushScheduled = false
    submitToRoot(body)
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(flush)
  } else {
    queueMicrotask(flush)
  }
}

/** @internal Submit current children to Fabric root. */
export function submitToRoot(body: RNDomInternalNode): void {
  const fabricUIManager = getFabricUIManager()
  const childSet = fabricUIManager.createChildSet()

  for (let i = 0; i < body.__RN_children.length; i++) {
    const child = body.__RN_children[i]
    const fabricNode = getFabricNode(body, child)
    if (fabricNode) {
      fabricUIManager.appendChildToSet(childSet, fabricNode)
    }
  }

  fabricUIManager.completeRoot(body[FABRIC_NODE_ID], childSet)

  // ⚠️ 提交完成后必须重置 body 自身的 childrenDirty。否则它一旦置 true 就
  // 恒 true（markDirty 的去重 `if (node.__RN_childrenDirty) return` 会跳过
  // scheduleFlush）→ 手动 appendChild / 后续变更永远不触发渲染，破坏
  // DOM-like 语义（appendChild 后应渲染）。
  body.__RN_childrenDirty = false
}

/**
 * @internal Get Fabric node for a child, handling both props and children
 * updates. Props changes use cloneNodeWithNewProps; children changes use
 * cloneNodeWithNewChildren.
 */
export function getFabricNode(
  body: RNDomInternalNode,
  child: RNNode | RNTextNode | RNCommentNode,
): unknown {
    if (child.nodeType === 3) {
      const t = child as RNTextNode
      return t.node
    }

    if (child.nodeType === 8) {
      return null
    }

    // 到这里 child 是 RNNode。经内部接口访问其 protected 成员(库内部允许)。
    const n = child as unknown as RNDomInternalNode
    let fabricNode = n[FABRIC_NODE]
    const fabricUIManager = getFabricUIManager()
    let childSet: unknown = null

    // ── UNMOUNTED NODE: fresh createNode with full __RN_currentProps ─────
    // Nodes that have never been committed to Fabric (or were re-inserted
    // after removal) get a fresh createNode with the COMPLETE payload
    // from __RN_currentProps. This avoids cloneNode* issues where incremental
    // updates lose or misapply style props.
    if (!n.__RN_mounted) {
      let nativeName = n.__RN_nativeName
      let validAttrs = n.__RN_lastValidAttrs ?? {}
      // Mount-time native-name override: RN splits some components at the
      // native layer based on props/ancestry (decided after props are set, so
      // createElement can't see them yet):
      //  - TextInput multiline → iOS RCTMultilineTextInputView
      //  - Text selectable → iOS RCTSelectableText;嵌套 → iOS RCTVirtualText
      const effectiveName = n.__RN_resolveNativeName()
      if (effectiveName != null && effectiveName !== nativeName) {
        nativeName = effectiveName
        try {
          const cfg = ReactNativePrivateInterface.ReactNativeViewConfigRegistry.get(nativeName)
          validAttrs =
            ((cfg as Record<string, unknown>)?.validAttributes as Record<string, unknown>) ?? validAttrs
        } catch { /* registry miss: keep previous attrs */ }
      }
      const rootTag = body[FABRIC_NODE_ID]
      // Merge class-based styles with inline style (class is baseline, inline overrides).
      const classStyle = resolveClassStyles(n)
      const mergedProps = classStyle && Object.keys(classStyle).length > 0
        ? { ...n.__RN_currentProps, style: { ...classStyle, ...((n.__RN_currentProps.style || {}) as Record<string, unknown>) } }
        : n.__RN_currentProps
      const fabricProps = n.__RN_normalizeProps({ ...mergedProps })
      // Modal: native `identifier` 由 RNModalElement.__RN_preparePayload 注入,
      // 用于 native `modalDismissed` 事件路由回 onDismiss(RN uniqueModalIdentifier)。
      n.__RN_preparePayload(fabricProps)
      const fullPayload = buildFabricPayload(fabricProps, validAttrs)
      const instanceHandle = n.__RN_instanceHandle ?? { tag: n[FABRIC_NODE_ID], stateNode: child }


      // Create a fresh Fabric node with all current props applied.
      fabricNode = fabricUIManager.createNode(
        n[FABRIC_NODE_ID],
        nativeName,
        rootTag,
        fullPayload ?? {},
        instanceHandle,
      )
      n[FABRIC_NODE] = fabricNode

      n.__RN_propsSnapshot = { ...fabricProps }
      n.__RN_dirtyPropsCount = 0
      n.__RN_propsDirty = false

      if (n.__RN_children.length > 0 || n.__RN_alwaysBuildChildren) {
        childSet = fabricUIManager.createChildSet()
        // 节点类的 __RN_buildChildren hook:默认遍历子节点;ScrollView 等 override
        // 做 children 结构包装(content container,RN 单子语义)。这规避了
        // RN 0.86 Fabric 对单子 ScrollView 的 append-on-update 崩溃。
        n.__RN_buildChildren(
          childSet,
          fabricUIManager,
          rootTag,
          (sub) => getFabricNode(body, sub),
        )
        n.__RN_childrenDirty = false

        // Apply children via cloneNodeWithNewChildren on the fresh node.
        fabricNode = fabricUIManager.cloneNodeWithNewChildren(fabricNode, childSet)
        n[FABRIC_NODE] = fabricNode
      } else {
        n.__RN_childrenDirty = false
      }

      n.__RN_mounted = true
      n.__RN_lastValidAttrs = validAttrs
      return fabricNode
    }

    // ── MOUNTED NODE: incremental dirty-flag-based update ────────────
    let updatePayload: Record<string, unknown> | null = null
    childSet = null

    // Prepare props once — reused by both props and children-only paths.
    // Merge class-based styles with inline style (class is baseline, inline overrides).
    const classStyle = resolveClassStyles(n)
    const mergedProps = classStyle && Object.keys(classStyle).length > 0
      ? { ...n.__RN_currentProps, style: { ...classStyle, ...((n.__RN_currentProps.style || {}) as Record<string, unknown>) } }
      : n.__RN_currentProps
    const fabricProps = n.__RN_normalizeProps({ ...mergedProps })

    if (n.__RN_propsDirty && hasPropsChanged(n)) {
      // Use __RN_nativeName resolved by ensure() during createElement, not a
      // guessed RCT prefix — the real Fabric name may differ (e.g.
      // 'Image' → 'RCTImageView', 'TextInput' → 'RCTSinglelineTextInputView').
      const nativeName = n.__RN_nativeName
      let viewConfig
      try {
        viewConfig = ReactNativePrivateInterface.ReactNativeViewConfigRegistry.get(nativeName)
} catch {
        viewConfig = undefined
      }

      const validAttrs = viewConfig?.validAttributes || {}
      const prevProps = n.__RN_propsSnapshot
      // Diff-based: only send changed props, like React does.
      updatePayload = diffFabricPayload(prevProps, fabricProps, validAttrs)
      n.__RN_lastValidAttrs = validAttrs
      n.__RN_propsSnapshot = { ...fabricProps }
      n.__RN_dirtyPropsCount = 0
      n.__RN_propsDirty = false
    }

    if (
      n.__RN_childrenDirty &&
      (n.__RN_children.length > 0 || n.__RN_hasHadChildren)
    ) {
      // ⚠️ 提交 childSet 必须覆盖"子节点被清空"的场景:之前 `length > 0`
      // 守卫在子节点全移除时(如页面卸载)跳过 cloneNodeWithNewChildren →
      // Fabric 原生不释放已移除的子节点 → Native Heap 随页面切换累积泄漏
      // (~29MB/次)。空 childSet 让原生 diff 出子节点移除并释放。
      // __RN_hasHadChildren 区分"曾有过子节点(清空需提交)"vs"叶子从未有
      // 子节点(无需提交,避免 mounted 但无 FABRIC_NODE 的节点走 clone 崩)"。
      childSet = fabricUIManager.createChildSet()
      // 节点类 __RN_buildChildren hook:ScrollView 只重建 content container 的子节点,
      // 自身 child(容器)保持稳定 → 无 Fabric append-on-update。
      n.__RN_buildChildren(
        childSet,
        fabricUIManager,
        body[FABRIC_NODE_ID],
        (sub) => getFabricNode(body, sub),
      )
    }
    // Always clear the dirty flag (even when there were no children) so
    // the next appendChild/removeChild correctly propagates up the tree.
    n.__RN_childrenDirty = false

    const hasChildren = childSet !== null
    const hasProps = updatePayload !== null

    if (hasProps && hasChildren) {
      fabricNode = fabricUIManager.cloneNodeWithNewChildrenAndProps(fabricNode, childSet, updatePayload!)
    } else if (hasProps) {
      fabricNode = fabricUIManager.cloneNodeWithNewProps(fabricNode, updatePayload!)
    } else if (hasChildren) {
      // Children-only update: cloneNodeWithNewChildren drops rawProps, so
      // we re-build the full payload from current props (i.e. all style,
      // layout, event markers) and use the combined call instead.
      const va = n.__RN_lastValidAttrs ?? {}
      const fullPayload = buildFabricPayload(fabricProps, va)
      if (fullPayload) {
        fabricNode = fabricUIManager.cloneNodeWithNewChildrenAndProps(fabricNode, childSet, fullPayload)
      } else {
        fabricNode = fabricUIManager.cloneNodeWithNewChildren(fabricNode, childSet)
      }
    }

    if (hasChildren || hasProps) {
      n[FABRIC_NODE] = fabricNode
    }

    return fabricNode
}
