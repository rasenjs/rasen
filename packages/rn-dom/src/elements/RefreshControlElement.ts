/**
 * @rasenjs/rn-dom — elements/RefreshControl
 *
 * RefreshControl 的 RN JS 层行为(对齐 RN RefreshControl.js):
 *  - refreshing 受控:JS prop 变化靠 props diff 更新原生(仅记录
 *    _lastNativeRefreshing);原生下拉触发 topRefresh 而 JS refreshing 未跟上时,
 *    dispatch setNativeRefreshing 强制回退(RN componentDidUpdate 第二分支)。
 *  - 平台拆分(RN render 解构):iOS 剔除 Android 专属(enabled/colors/
 *    progressBackgroundColor/size),Android 剔除 iOS 专属(tintColor/titleColor/title)。
 *  - 默认值(对齐 codegen spec WithDefault):Android enabled=true/size='default'/
 *    progressViewOffset=0;iOS progressViewOffset=0。
 *  - 事件:topRefresh(direct)→ onRefresh。
 *
 * 原生组件名由 elements.cjs ensure() 决定(iOS RCTRefreshControl /
 * Android AndroidSwipeRefreshLayout),无需 __RN_resolveNativeName。
 */

import { Platform } from 'react-native'
import { RNNode, type RNDomInternalNode } from '../node'
import { dispatchCommand } from '../internal'

export class RNRefreshControlElement extends RNNode {
  /** 受控 RefreshControl:最后一次 native 已知的 refreshing 状态。 */
  __RN_lastNativeRefreshing: boolean = false

  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    const isAndroid = Platform.OS === 'android'
    const next: Record<string, unknown> = { ...props }
    if (isAndroid) {
      // 剔除 iOS 专属(RN RefreshControl.js render 解构)。
      delete next.tintColor
      delete next.titleColor
      delete next.title
      // Android spec WithDefault。
      next.enabled = props.enabled !== false
      next.size = props.size ?? 'default'
      next.progressViewOffset = props.progressViewOffset ?? 0
    } else {
      // 剔除 Android 专属。
      delete next.enabled
      delete next.colors
      delete next.progressBackgroundColor
      delete next.size
      next.progressViewOffset = props.progressViewOffset ?? 0
    }
    return next
  }

  /**
   * @internal - refreshing prop 由 JS 控制:JS 变化时原生 props diff 自动更新,
   * 仅记录(RN componentDidUpdate 第一分支,不发 command)。
   */
  __RN_syncControlledProp(name: string): void {
    if (name === 'refreshing') {
      this.__RN_lastNativeRefreshing = this.__RN_currentProps.refreshing === true
    }
  }

  /**
   * @internal - topRefresh:原生下拉触发 onRefresh + 受控重同步。
   * RN _onRefresh:置 _lastNativeRefreshing=true → 调 onRefresh → forceUpdate
   * 触发 componentDidUpdate:若用户没把 refreshing 设 true(未 setState),
   * 发 setNativeRefreshing 强制回退到 JS 值(指示器立刻停)。
   */
  __RN_handleNativeEvent(type: string, _event: Record<string, unknown>): boolean | void {
    if (type !== 'topRefresh') return
    this.__RN_lastNativeRefreshing = true
    const onRefresh = this.__RN_currentProps.onRefresh
    if (typeof onRefresh === 'function') (onRefresh as () => void)()
    // RN:用户未把 refreshing 置 true → 强制回退(受控组件,JS 是真相)。
    const jsRefreshing = this.__RN_currentProps.refreshing === true
    if (!jsRefreshing) {
      dispatchCommand(this as unknown as RNDomInternalNode, 'setNativeRefreshing', [false])
      this.__RN_lastNativeRefreshing = false
    }
    return true // 消费(direct event,避免通用分发 double 调 onRefresh)
  }
}
