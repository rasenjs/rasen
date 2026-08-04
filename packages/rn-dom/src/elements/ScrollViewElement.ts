/**
 * @rasenjs/rn-dom — elements/ScrollViewElement
 *
 * ScrollView / AndroidHorizontalScrollView 标签的 RN JS 层行为:
 *  - props 转换(对齐 RN ScrollView.js):baseStyle、decelerationRate、
 *    pagingEnabled、snapTo*、keyboardShouldPersistTaps
 *  - children:RCTScrollView 只 host 一个子节点,必须包一层 content
 *    container(RN ScrollView.js 的 NativeScrollContentView 语义)。容器是
 *    稳定 RCTView,children 变化只重建容器、ScrollView 自身 child 不变,
 *    规避 RN 0.86 Fabric 单子 ScrollView 的 append 崩溃。
 *  - 事件:容器 topLayout → onContentSizeChange(自身 topLayout 走通用 onLayout)
 */

import { Platform, Keyboard } from 'react-native'
import type { FabricNode, FabricUIManager } from '../fabric-global'
import { RNNode, allocateTag, FABRIC_NODE_ID, type RNDomInternalNode } from '../node'
import { dispatchCommand, getFabricUIManager, markChildrenDirty } from '../internal'
import type { RNTextNode, RNCommentNode } from '../node'
import { SCROLL_BASE_VERTICAL, SCROLL_BASE_HORIZONTAL } from './shared'

/** sticky header 包装容器缓存项(对应 RN ScrollViewStickyHeader 的 Animated.View)。 */
interface StickyWrapper {
  /** 包装 Fabric 节点(header 容器,RCTView,onLayout:true)。 */
  wrapper: FabricNode
  /** wrapper 的 tag(事件路由匹配)。 */
  tag: number
  /** 当前 child 的 Fabric 引用(检测内容变化,变化时更新 wrapper children)。 */
  child: unknown
  /** 上次计算的 translateY(避免每帧重复 setNativeProps)。 */
  lastTranslateY: number | null
  /** onLayout 报告的 header 在内容中的 y / 高度。 */
  layoutY: number
  layoutHeight: number
}

export class RNScrollViewElement extends RNNode {
  /**
   * ScrollView content container (Fabric)。RCTScrollView 只 host 一个子节点,
   * 容器稳定缓存(collapsable:false 防止 view-flatten),children 变化只重建
   * 容器子节点 → 规避 RN 0.86 Fabric 单子 ScrollView 的 append 崩溃。
   */
  __RN_scrollContentFabric: FabricNode | null = null
  __RN_scrollContentFabricId: number | null = null
  /** Last content-container children (ShadowNode refs) — for skip-if-unchanged. */
  __RN_scrollContentChildren: unknown[] | null = null
  /** Last content-container payload (style/onLayout) — for diffing. */
  __RN_scrollContentPayload: Record<string, unknown> | null = null
  /** sticky header 包装容器缓存:index → wrapper。 */
  __RN_stickyWrappers: Map<number, StickyWrapper> = new Map()

  // ── ScrollView (ScrollViewCommands) ────────────────────────────────────
  /** Scroll to an x/y offset (animated by default, like RN). */
  scrollTo(x: number, y: number, animated = true): void {
    // RN: x||0 / y||0,animated !== false(避免传 undefined 给原生)。
    dispatchCommand(this as unknown as RNDomInternalNode, 'scrollTo', [x || 0, y || 0, animated !== false])
  }

  /**
   * @internal - stickyHeaderIndices 变化会影响 content container 的 children
   * 结构(哪些 child 包 sticky wrapper),因此运行时变化时标记 children 重建
   *(清理旧 wrapper + 按新索引重建)。其余 name 无操作。
   */
  __RN_syncControlledProp(name: string): void {
    if (name === 'stickyHeaderIndices') {
      markChildrenDirty(this as unknown as RNDomInternalNode)
    }
  }

  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    const horizontal = props.horizontal === true
    const isAndroid = Platform.OS === 'android'
    const sNext: Record<string, unknown> = {
      ...props,
      // baseStyle: RN scrolls only when the flex/overflow defaults are set.
      style: [horizontal ? SCROLL_BASE_HORIZONTAL : SCROLL_BASE_VERTICAL, props.style],
      alwaysBounceHorizontal: props.alwaysBounceHorizontal !== undefined
        ? props.alwaysBounceHorizontal
        : horizontal,
      alwaysBounceVertical: props.alwaysBounceVertical !== undefined
        ? props.alwaysBounceVertical
        : !horizontal,
      // Defaults to true.
      snapToStart: props.snapToStart !== false,
      snapToEnd: props.snapToEnd !== false,
      // pagingEnabled is overridden by snapToInterval / snapToOffsets:
      //  - iOS: must be false for snapTo* to work
      //  - Android: must be true for snapTo* to work
      pagingEnabled: isAndroid
        ? props.pagingEnabled === true || props.snapToInterval != null || props.snapToOffsets != null
        : props.pagingEnabled === true && props.snapToInterval == null && props.snapToOffsets == null,
      // Native only sends momentum events when asked.
      sendMomentumEvents: props.onMomentumScrollBegin != null || props.onMomentumScrollEnd != null,
    }
    if (props.decelerationRate === 'normal') {
      sNext.decelerationRate = isAndroid ? 0.985 : 0.998
    } else if (props.decelerationRate === 'fast') {
      sNext.decelerationRate = isAndroid ? 0.9 : 0.99
    }
    // keyboardShouldPersistTaps boolean → 'always'/'never'.
    if (typeof props.keyboardShouldPersistTaps === 'boolean') {
      sNext.keyboardShouldPersistTaps = props.keyboardShouldPersistTaps ? 'always' : 'never'
    }
    // removeClippedSubviews(RN ScrollView.js):iOS 不支持,忽略;Android 且
    // stickyHeaderIndices 非空时强制 false(否则 sticky header 被裁剪)。
    if (isAndroid) {
      const sticky = props.stickyHeaderIndices
      sNext.removeClippedSubviews =
        Array.isArray(sticky) && sticky.length > 0 ? false : props.removeClippedSubviews
    } else {
      sNext.removeClippedSubviews = undefined
    }
    // collapsableChildren:removeClippedSubviews=true 时禁用子节点展平(RN)。
    sNext.collapsableChildren = sNext.removeClippedSubviews === true ? false : undefined
    // sticky header 时强制 scrollEventThrottle=1(RN ScrollView.js L1798:
    // 保证每帧发 onScroll,否则 sticky 位移滞后)。
    const sticky = props.stickyHeaderIndices
    if (Array.isArray(sticky) && sticky.length > 0) {
      sNext.scrollEventThrottle = 1
    }
    return sNext
  }

  // ── children:content container 包装 ────────────────────────────────

  __RN_buildChildren(
    childSet: unknown,
    fabricUIManager: FabricUIManager,
    rootTag: number,
    getFabricNode: (node: RNNode | RNTextNode | RNCommentNode) => unknown,
  ): void {
    // RCTScrollView hosts exactly one child — the content container.
    const cc = this.__RN_buildScrollContent(fabricUIManager, rootTag, getFabricNode)
    if (cc) fabricUIManager.appendChildToSet(childSet, cc)
  }

  /**
   * Build (or rebuild) the ScrollView's single content container Fabric node.
   * The container is a stable RCTView; its children are the scroll view's
   * element children. Returning the same container instance keeps the
   * ScrollView's own child constant across content updates — RN 0.86's Fabric
   * appends on cloneNodeWithNewChildren for single-child ScrollViews
   * (android.widget.ScrollView allows only one direct child), so the ScrollView
   * child must never change.
   */
  __RN_buildScrollContent(
    fabricUIManager: FabricUIManager,
    rootTag: number,
    getFabricNode: (node: RNNode | RNTextNode | RNCommentNode) => unknown,
  ): FabricNode | null {
    // Content container payload (mirrors RN ScrollView.js):
    //  - collapsable:false — without it the container has no formsView trait in
    //    RN 0.86's C++ ViewShadowNode (no bg/border/stacking context) and gets
    //    view-flattened, promoting the scroll content up to the ScrollView and
    //    tripping its single-child addView crash.
    //  - contentContainerStyle + horizontal row layout.
    //  - onLayout (only when onContentSizeChange is bound) — RN implements
    //    onContentSizeChange by observing the CONTENT container's layout; the
    //    dispatcher forwards it to the ScrollView node's handler.
    const contentStyle: Record<string, unknown> = {}
    if (this.__RN_currentProps.horizontal === true) {
      contentStyle.flexDirection = 'row'
    }
    const ccs = this.__RN_currentProps.contentContainerStyle
    const hasContentSizeChange =
      typeof this.__RN_currentProps.onContentSizeChange === 'function'
    const payload: Record<string, unknown> = {
      collapsable: false,
      style: ccs != null ? [contentStyle, ccs] : contentStyle,
    }
    if (hasContentSizeChange) payload.onLayout = true

    let cc = this.__RN_scrollContentFabric
    if (!cc) {
      const ccId = this.__RN_scrollContentFabricId ?? (this.__RN_scrollContentFabricId = allocateTag())
      const handle = { tag: ccId, stateNode: this }
      cc = fabricUIManager.createNode(ccId, 'RCTView', rootTag, payload, handle)
      this.__RN_scrollContentFabric = cc
      this.__RN_scrollContentChildren = null
    } else if (
      this.__RN_scrollContentPayload == null ||
      JSON.stringify(this.__RN_scrollContentPayload.style) !== JSON.stringify(payload.style) ||
      this.__RN_scrollContentPayload.onLayout !== payload.onLayout
    ) {
      // contentContainerStyle / horizontal / onContentSizeChange changed:
      // re-apply to the stable container WITHOUT touching its children (the
      // ScrollView's single child must never change).
      const diff: Record<string, unknown> = { style: payload.style }
      if (payload.onLayout !== (this.__RN_scrollContentPayload?.onLayout ?? false)) {
        diff.onLayout = payload.onLayout
      }
      cc = fabricUIManager.cloneNodeWithNewProps(cc, diff)
      this.__RN_scrollContentFabric = cc
    }
    this.__RN_scrollContentPayload = payload
    // sticky header:清理已不再标记为 sticky 的 wrapper(索引变化时)。
    const stickyProp = this.__RN_currentProps.stickyHeaderIndices
    const isSticky = Array.isArray(stickyProp)
      ? (i: number): boolean => stickyProp.includes(i)
      : () => false
    if (Array.isArray(stickyProp)) {
      for (const key of Array.from(this.__RN_stickyWrappers.keys())) {
        if (!stickyProp.includes(key)) this.__RN_stickyWrappers.delete(key)
      }
    }
    // Resolve each child's Fabric node (cheap for stable children — returns the
    // cached ShadowNode; only dirty ones clone). sticky index 的 child 包一层
    // 内部 RCTView(对应 RN ScrollViewStickyHeader 的 Animated.View),滚动时
    // 通过 transform.translateY 实现粘住,避免直接改 child 自身 style。
    const curr: unknown[] = []
    for (let i = 0; i < this.__RN_children.length; i++) {
      const subChild = this.__RN_children[i]
      const subFabricNode = getFabricNode(subChild)
      if (!subFabricNode) continue
      if (isSticky(i)) {
        curr.push(this.__RN_buildStickyWrapper(i, subFabricNode, fabricUIManager, rootTag))
      } else {
        curr.push(subFabricNode)
      }
    }
    // Skip the clone when every child's ShadowNode reference is unchanged —
    // the container's child list didn't actually change. This avoids
    // appendChildToSet + cloneNodeWithNewChildren JNI churn on unrelated
    // subtree updates that merely propagate dirty flags to the ScrollView.
    const prev = this.__RN_scrollContentChildren
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
    cc = fabricUIManager.cloneNodeWithNewChildren(cc, ccChildren)
    this.__RN_scrollContentFabric = cc
    this.__RN_scrollContentChildren = curr
    return cc
  }

  /**
   * Build (or reuse) a sticky header's wrapper View. Wrapper 稳定缓存
   * (保留 onLayout 记录的 layoutY);child 引用变化时只更新 wrapper 的 children
   *(不换 wrapper 本身,layoutY 不丢)。collapsable:false 防止 view-flatten。
   */
  __RN_buildStickyWrapper(
    index: number,
    childFabric: unknown,
    fabricUIManager: FabricUIManager,
    rootTag: number,
  ): FabricNode {
    let entry = this.__RN_stickyWrappers.get(index)
    if (!entry) {
      const tag = allocateTag()
      const handle = { tag, stateNode: this }
      let wrapper = fabricUIManager.createNode(tag, 'RCTView', rootTag, {
        collapsable: false,
        onLayout: true,
      }, handle)
      const cs = fabricUIManager.createChildSet()
      fabricUIManager.appendChildToSet(cs, childFabric as FabricNode)
      wrapper = fabricUIManager.cloneNodeWithNewChildren(wrapper, cs)
      entry = {
        wrapper,
        tag,
        lastTranslateY: null,
        layoutY: 0,
        layoutHeight: 0,
        child: childFabric,
      }
      this.__RN_stickyWrappers.set(index, entry)
      return wrapper
    }
    // 缓存命中:child 变化则更新 wrapper children(保留 wrapper + layoutY)。
    if (entry.child !== childFabric) {
      const cs = fabricUIManager.createChildSet()
      fabricUIManager.appendChildToSet(cs, childFabric as FabricNode)
      entry.wrapper = fabricUIManager.cloneNodeWithNewChildren(entry.wrapper, cs)
      entry.child = childFabric
      entry.lastTranslateY = null
    }
    return entry.wrapper
  }

  /**
   * 按 scrollY 驱动所有 sticky wrapper 的 translateY(RN ScrollViewStickyHeader
   * 的 interpolate 语义):
   *   start = header 自身 layoutY;end = 下一个 header 顶 - 本 header 高(碰撞)。
   *   translateY = clamp(scrollY - start, 0, end - start)
   * 无 Animated:直接 setNativeProps 写入 Fabric(JS 线程每帧,RNevent 受
   * scrollEventThrottle=1 限制;仅值变化时写)。
   */
  __RN_applySticky(scrollY: number): void {
    if (this.__RN_stickyWrappers.size === 0) return
    const uim = getFabricUIManager()
    if (!uim || typeof uim.setNativeProps !== 'function') return
    const entries = Array.from(this.__RN_stickyWrappers.entries()).sort((a, b) => a[0] - b[0])
    for (let i = 0; i < entries.length; i++) {
      const [, entry] = entries[i]
      const next = i + 1 < entries.length ? entries[i + 1][1] : null
      const start = entry.layoutY
      const h = entry.layoutHeight
      // 碰撞点:本 header 底贴到下一个 sticky 的顶;无下一个则无限粘住。
      const end = next ? Math.max(start, (next.layoutY ?? 0) - h) : Infinity
      const translateY = Math.max(0, Math.min(scrollY - start, Math.max(0, end - start)))
      if (entry.lastTranslateY === translateY) continue
      entry.lastTranslateY = translateY
      try {
        uim.setNativeProps(entry.wrapper, {
          style: [{ transform: [{ translateY }] }],
        })
      } catch { /* no manager / not committed */ }
    }
  }

  /** 按 wrapper tag 找 sticky 缓存项(事件路由用)。 */
  __RN_findStickyByTag(tag: number): StickyWrapper | null {
    for (const entry of this.__RN_stickyWrappers.values()) {
      if (entry.tag === tag) return entry
    }
    return null
  }

  // ── 事件:content container onLayout → onContentSizeChange ──────────

  __RN_handleNativeEvent(type: string, event: Record<string, unknown>): boolean | void {
    if (type === 'topScrollBeginDrag') {
      // RN ScrollView.js:Android keyboardDismissMode='on-drag' 时拖拽收起键盘。
      if (Platform.OS === 'android' && this.__RN_currentProps.keyboardDismissMode === 'on-drag') {
        Keyboard.dismiss()
      }
      return // 不消费,继续通用分发 onScrollBeginDrag
    }
    if (type === 'topScroll') {
      // sticky header 驱动(scrollEventThrottle=1 时每帧):读 contentOffset.y。
      const contentOffset = (event.nativeEvent as Record<string, unknown>).contentOffset as
        | Record<string, unknown>
        | undefined
      const y = contentOffset?.y
      if (typeof y === 'number') this.__RN_applySticky(y)
      return // 不消费,继续通用分发 onScroll
    }
    if (type !== 'topLayout') return
    const rawTarget = (event.nativeEvent as Record<string, unknown>).target
    const selfTag = this[FABRIC_NODE_ID]
    // 自身 layout → 走通用 onLayout 分发。
    if (rawTarget === selfTag) return
    // sticky wrapper 的 layout → 记录 header 的 y/高度(链式碰撞用)。
    const sticky = typeof rawTarget === 'number' ? this.__RN_findStickyByTag(rawTarget) : null
    if (sticky) {
      const layout = (event.nativeEvent as Record<string, unknown>).layout as
        | Record<string, unknown>
        | undefined
      sticky.layoutY = (layout?.y as number) ?? 0
      sticky.layoutHeight = (layout?.height as number) ?? 0
      return true // 消费,不触发 onContentSizeChange
    }
    // 注入的 content container(RCTView)layout → onContentSizeChange(width, height)
    //(RN ScrollView.js 由 content container 的 onLayout 实现)。
    const layout = (event.nativeEvent as Record<string, unknown>).layout as
      | Record<string, unknown>
      | undefined
    const onContentSizeChange = this.__RN_currentProps.onContentSizeChange
    if (typeof onContentSizeChange === 'function') {
      ;(onContentSizeChange as (w: number, h: number) => void)(
        layout?.width as number,
        layout?.height as number,
      )
    }
    return true
  }
}
