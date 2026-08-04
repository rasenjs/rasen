/**
 * @rasenjs/rn-dom — elements/DrawerLayoutAndroid
 *
 * DrawerLayoutAndroid 的 RN JS 层行为(对齐 RN DrawerLayoutAndroid.android.js):
 *  - children 结构:原生 AndroidDrawerLayout 期望两个 child(主内容在前、抽屉
 *    在后)。RN 用 childrenWrapper(绝对定位铺满,collapsable:false)包主内容、
 *    drawerViewWrapper(绝对定位 + width=drawerWidth + backgroundColor +
 *    pointerEvents=drawerOpened?'auto':'none')包 renderNavigationView() 返回值。
 *    【DOM 映射约定】rn-dom 里 drawer 槽 = children[0](navigationView),其余
 *    children = 主内容。RN 的 renderNavigationView 是函数 prop,DOM 无法表达,
 *    故用"第一个子节点 = 抽屉"约定(vue-rn 层可再封装具名 slot)。
 *  - 默认值(JS 参数默认 + spec WithDefault):drawerBackgroundColor 'white'、
 *    keyboardDismissMode 'none'、drawerPosition 'left'、drawerLockMode 'unlocked'。
 *  - 事件(direct):topDrawerSlide{offset}→onDrawerSlide(+keyboardDismissMode
 *    'on-drag' 收键盘)、topDrawerOpen→onDrawerOpen、topDrawerClose→onDrawerClose、
 *    topDrawerStateChanged{drawerState:int}→onDrawerStateChanged('Idle'|'Dragging'
 *    |'Settling')。onDrawerOpen/Close 同时切换 drawer 的 pointerEvents。
 *  - 命令:openDrawer/closeDrawer(index.ts 导出独立函数,符合 B 类命令分层)。
 */

import { Keyboard } from 'react-native'
import type { FabricNode, FabricUIManager } from '../fabric-global'
import { RNNode, allocateTag } from '../node'
import type { RNTextNode, RNCommentNode } from '../node'
import { getFabricUIManager } from '../internal'

/** RN DRAWER_STATES:int → 字符串状态。 */
const DRAWER_STATES = ['Idle', 'Dragging', 'Settling']

export class RNDrawerLayoutAndroidElement extends RNNode {
  /** 抽屉开合状态(控制 drawer wrapper 的 pointerEvents,RN state.drawerOpened)。 */
  __RN_drawerOpened: boolean = false

  /** 主内容 wrapper(Fabric,稳定缓存)。 */
  __RN_drawerMainFabric: FabricNode | null = null
  __RN_drawerMainId: number | null = null
  __RN_drawerMainChildren: unknown[] | null = null
  /** 抽屉 wrapper(Fabric,稳定缓存)。 */
  __RN_drawerViewFabric: FabricNode | null = null
  __RN_drawerViewId: number | null = null
  __RN_drawerViewChildren: unknown[] | null = null

  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    // 默认值(JS 参数默认 + spec WithDefault)。
    const next: Record<string, unknown> = { ...props }
    if (next.drawerBackgroundColor == null) next.drawerBackgroundColor = 'white'
    if (next.keyboardDismissMode == null) next.keyboardDismissMode = 'none'
    if (next.drawerPosition == null) next.drawerPosition = 'left'
    if (next.drawerLockMode == null) next.drawerLockMode = 'unlocked'
    // RN:base style {flex:1, elevation:16} 在前,用户 style 覆盖。
    if (props.style != null) {
      next.style = [{ flex: 1, elevation: 16 }, props.style]
    } else {
      next.style = [{ flex: 1, elevation: 16 }]
    }
    return next
  }

  // ── children:main + drawer 双 wrapper(RN DrawerLayoutAndroid 结构)──

  __RN_buildChildren(
    childSet: unknown,
    fabricUIManager: FabricUIManager,
    rootTag: number,
    getFabricNode: (node: RNNode | RNTextNode | RNCommentNode) => unknown,
  ): void {
    // 【DOM 映射约定】children[0] = navigationView(抽屉),其余 = 主内容。
    const navChild = this.__RN_children[0] ?? null
    const mainChildren = this.__RN_children.slice(1)
    const main = this.__RN_buildDrawerSubview(
      false, mainChildren, fabricUIManager, rootTag, getFabricNode,
    )
    const drawer = this.__RN_buildDrawerSubview(
      true, navChild ? [navChild] : [], fabricUIManager, rootTag, getFabricNode,
    )
    // 顺序:主内容在前、抽屉在后(RN AndroidDrawerLayout children 顺序)。
    if (main) fabricUIManager.appendChildToSet(childSet, main)
    if (drawer) fabricUIManager.appendChildToSet(childSet, drawer)
  }

  /**
   * Build (or rebuild) one drawer subview wrapper。稳定缓存 + children 引用
   * diff,避免不必要的 clone(与 ScrollView content container 同模式)。
   */
  __RN_buildDrawerSubview(
    isDrawer: boolean,
    children: (RNNode | RNTextNode | RNCommentNode)[],
    fabricUIManager: FabricUIManager,
    rootTag: number,
    getFabricNode: (node: RNNode | RNTextNode | RNCommentNode) => unknown,
  ): FabricNode | null {
    const cacheFabric = isDrawer ? this.__RN_drawerViewFabric : this.__RN_drawerMainFabric
    const cacheId = isDrawer ? this.__RN_drawerViewId : this.__RN_drawerMainId
    const cacheChildren = isDrawer ? this.__RN_drawerViewChildren : this.__RN_drawerMainChildren

    // 主内容:绝对定位铺满(RN styles.mainSubview)。抽屉:绝对定位 + width +
    // backgroundColor + pointerEvents 随开合切换(RN drawerViewWrapper)。
    const style: Record<string, unknown> = isDrawer
      ? {
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: (this.__RN_currentProps.drawerWidth as number | undefined) ?? 320,
          backgroundColor: this.__RN_currentProps.drawerBackgroundColor ?? 'white',
        }
      : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }
    const payload: Record<string, unknown> = {
      collapsable: false,
      style,
    }
    if (isDrawer) {
      payload.pointerEvents = this.__RN_drawerOpened ? 'auto' : 'none'
    }

    let wrapper = cacheFabric
    if (!wrapper) {
      const id = cacheId ?? (isDrawer
        ? (this.__RN_drawerViewId = allocateTag())
        : (this.__RN_drawerMainId = allocateTag()))
      const handle = { tag: id, stateNode: this }
      wrapper = fabricUIManager.createNode(id, 'RCTView', rootTag, payload, handle)
      if (isDrawer) this.__RN_drawerViewFabric = wrapper
      else this.__RN_drawerMainFabric = wrapper
    }

    // children diff:解析 fabric 引用,不变则跳过 clone。
    const curr: unknown[] = []
    for (const sub of children) {
      const f = getFabricNode(sub)
      if (f) curr.push(f)
    }
    const prev = cacheChildren
    if (prev !== null) {
      let same = prev.length === curr.length
      if (same) {
        for (let i = 0; i < prev.length; i++) {
          if (prev[i] !== curr[i]) { same = false; break }
        }
      }
      // children 相同但仍要确保 pointerEvents 最新(开合切换)。
      const wProps = (wrapper as unknown as { props?: Record<string, unknown> }).props
      const needPointerUpdate = isDrawer && wProps?.pointerEvents !== payload.pointerEvents
      if (same && !needPointerUpdate) return wrapper
      if (same && needPointerUpdate) {
        const next = fabricUIManager.cloneNodeWithNewProps(wrapper, { pointerEvents: payload.pointerEvents })
        if (isDrawer) this.__RN_drawerViewFabric = next
        else this.__RN_drawerMainFabric = next
        return next
      }
    }
    const cs = fabricUIManager.createChildSet()
    for (const n of curr) fabricUIManager.appendChildToSet(cs, n)
    wrapper = fabricUIManager.cloneNodeWithNewChildren(wrapper, cs)
    if (isDrawer) this.__RN_drawerViewFabric = wrapper
    else this.__RN_drawerMainFabric = wrapper
    if (isDrawer) this.__RN_drawerViewChildren = curr
    else this.__RN_drawerMainChildren = curr
    return wrapper
  }

  // ── 事件:drawer direct events ──────────────────────────────────

  __RN_handleNativeEvent(type: string, event: Record<string, unknown>): boolean | void {
    const props = this.__RN_currentProps
    switch (type) {
      case 'topDrawerSlide': {
        const onDrawerSlide = props.onDrawerSlide
        if (typeof onDrawerSlide === 'function') {
          (onDrawerSlide as (e: Record<string, unknown>) => void)(event)
        }
        // RN:keyboardDismissMode='on-drag' 时拖动收键盘。
        if (props.keyboardDismissMode === 'on-drag') Keyboard.dismiss()
        return true
      }
      case 'topDrawerOpen': {
        this.__RN_drawerOpened = true
        const onDrawerOpen = props.onDrawerOpen
        if (typeof onDrawerOpen === 'function') (onDrawerOpen as () => void)()
        this.__RN_syncDrawerPointerEvents()
        return true
      }
      case 'topDrawerClose': {
        this.__RN_drawerOpened = false
        const onDrawerClose = props.onDrawerClose
        if (typeof onDrawerClose === 'function') (onDrawerClose as () => void)()
        this.__RN_syncDrawerPointerEvents()
        return true
      }
      case 'topDrawerStateChanged': {
        const onDrawerStateChanged = props.onDrawerStateChanged
        if (typeof onDrawerStateChanged === 'function') {
          const state = (event.nativeEvent as Record<string, unknown>).drawerState as number | undefined
          (onDrawerStateChanged as (s: string) => void)(DRAWER_STATES[state ?? 0] ?? 'Idle')
        }
        return true
      }
      default:
        return
    }
  }

  /** 开合切换后同步 drawer wrapper 的 pointerEvents(RN state→View prop)。 */
  __RN_syncDrawerPointerEvents(): void {
    if (!this.__RN_drawerViewFabric) return
    const uim = getFabricUIManager()
    if (!uim || typeof uim.cloneNodeWithNewProps !== 'function') return
    try {
      this.__RN_drawerViewFabric = uim.cloneNodeWithNewProps(this.__RN_drawerViewFabric, {
        pointerEvents: this.__RN_drawerOpened ? 'auto' : 'none',
      })
    } catch { /* no manager */ }
  }
}
