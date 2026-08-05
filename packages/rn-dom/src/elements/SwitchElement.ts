/**
 * @rasenjs/rn-dom — elements/SwitchNode
 *
 * Switch / AndroidSwitch 标签的 RN JS 层 prop 转换(对齐 RN Switch.js):
 *  - 原生 AndroidSwitch 说 `on`/`enabled`/`thumbTintColor`/
 *    `trackColorForFalse/True`/`trackTintColor`
 *  - 原生 iOS RCTSwitch 说 `value`/`onTintColor`/`tintColor`/`thumbTintColor`
 *  - 两者都不接受 `value`/`trackColor`/`thumbColor` 直接传入,RN 在 render()
 *    里映射;iOS 的 ios_backgroundColor 烘焙进 style
 */

import { Platform } from 'react-native'
import { RNNode, type RNDomInternalNode } from '../node'
import { dispatchCommand } from '../internal'
import { appendStyleOverride, appendStylePrefix, applyAria } from './shared'

/** RN Switch.js 给 iOS RCTSwitch 注入的 responder 常量函数。 */
const returnsFalse = () => false
const returnsTrue = () => true

export class RNSwitchElement extends RNNode {
  /** 受控 Switch 状态:最后一次 native 报告的 on/off。 */
  __RN_switchNativeValue: boolean | null = null

  /**
   * @internal - 受控回写同步(RN Switch.js useLayoutEffect sync):JS value
   * 与 native 记录不一致时 setValue/setNativeValue 回写。
   */
  __RN_syncControlledProp(name: string): void {
    if (name !== 'value') return
    if (this.__RN_switchNativeValue === null) return
    const on = this.__RN_currentProps.value === true || this.__RN_currentProps.on === true
    if (on !== this.__RN_switchNativeValue) {
      dispatchCommand(this as unknown as RNDomInternalNode, Platform.OS === 'android' ? 'setNativeValue' : 'setValue', [on])
    }
  }

  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    const on = props.value === true
    const trackColor = typeof props.trackColor === 'object'
      ? props.trackColor as Record<string, unknown>
      : null
    const trackColorForFalse = trackColor ? trackColor.false : undefined
    const trackColorForTrue = trackColor ? trackColor.true : undefined

    // RN Switch.js:disabled 回退到 accessibilityState.disabled(两端一致)。
    const disabled = props.disabled != null
      ? props.disabled
      : (props.accessibilityState as Record<string, unknown> | undefined)?.disabled

    if (Platform.OS === 'android') {
      // Android:原生说 on/enabled;剥离 iOS 专属 onTintColor/tintColor。
      const next: Record<string, unknown> = { ...props }
      delete next.onTintColor
      delete next.tintColor
      next.on = on
      // enabled 来源:_disabled = disabled ?? accessibilityState.disabled(RN)。
      next.enabled = disabled !== true
      next.thumbTintColor = props.thumbColor !== undefined ? props.thumbColor : props.thumbTintColor
      next.trackColorForFalse = trackColorForFalse !== undefined ? trackColorForFalse : props.trackColorForFalse
      next.trackColorForTrue = trackColorForTrue !== undefined ? trackColorForTrue : props.trackColorForTrue
      next.trackTintColor = on
        ? (trackColorForTrue !== undefined ? trackColorForTrue : props.trackColorForTrue)
        : (trackColorForFalse !== undefined ? trackColorForFalse : props.trackColorForFalse)
      // _accessibilityState:仅当 disabled 与用户 state 不同步时 merge 修正
      // (保留 checked/busy/expanded/selected 等用户字段,RN Switch.js Android)。
      const userState = props.accessibilityState as Record<string, unknown> | undefined
      next.accessibilityState =
        props.disabled == null || userState?.disabled === props.disabled
          ? props.accessibilityState
          : { ...userState, disabled: props.disabled }
      return applyAria(next)
    }

    // iOS:基础样式 styles.nativeSwitch(alignSelf flex-start)无条件在前,
    // 用户 style 在其后覆盖;ios_backgroundColor 烘焙进 style(RN Switch.js)。
    let style = appendStylePrefix(props.style, { alignSelf: 'flex-start' })
    if (props.ios_backgroundColor != null) {
      style = appendStyleOverride(style, {
        backgroundColor: props.ios_backgroundColor,
        borderRadius: 16,
      })
    }
    // _accessibilityState:disabled 显式时重写(RN iOS 分支),否则原样。
    const accessibilityState = props.disabled == null
      ? props.accessibilityState
      : { ...(props.accessibilityState as Record<string, unknown> | undefined), disabled: props.disabled }
    return applyAria({
      ...props,
      value: on,
      onTintColor: trackColorForTrue !== undefined ? trackColorForTrue : props.onTintColor,
      tintColor: trackColorForFalse !== undefined ? trackColorForFalse : props.tintColor,
      thumbTintColor: props.thumbColor !== undefined ? props.thumbColor : props.thumbTintColor,
      accessibilityRole: 'switch',
      accessibilityState,
      onResponderTerminationRequest: returnsFalse,
      onStartShouldSetResponder: returnsTrue,
      style,
    })
  }

  /**
   * @internal - RN Switch 事件专属处理(替代 event-system 的 topChange 大 if):
   *  - onValueChange:把 nativeEvent.value(boolean)传给用户(表面 API)
   *  - 受控记录:记录 native on/off(setAttribute 回写用)
   * onChange 是 bubbling 通用 handler,仍走 event-system 通用分发。
   */
  __RN_handleNativeEvent(type: string, event: Record<string, unknown>): boolean | void {
    if (type !== 'topChange') return
    const ne = event.nativeEvent as Record<string, unknown>
    const onValueChange = this.__RN_currentProps.onValueChange
    if (typeof onValueChange === 'function') {
      ;(onValueChange as (value: boolean) => void)(ne.value as boolean)
    }
    // 受控记录(RN Switch 受控组件)。
    if (typeof ne.value === 'boolean') {
      this.__RN_switchNativeValue = ne.value
    }
  }
}
