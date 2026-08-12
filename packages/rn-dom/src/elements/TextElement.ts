/**
 * @rasenjs/rn-dom — elements/TextElement
 *
 * Text 标签的 RN JS 层 prop 转换(对齐 RN Text.js):
 *  - ellipsizeMode 默认 'tail'、allowFontScaling 默认 true
 *  - style.fontWeight 数字 → 字符串
 *  - style.userSelect → selectable(映射 USER_SELECT_TO_SELECTABLE)
 *  - style.verticalAlign → textAlignVertical(映射 VERTICAL_ALIGN_MAP)
 */

import { Platform } from 'react-native'
import { RNNode } from '../node'
import { flatStyle, appendStyleOverride, appendStylePrefix, VERTICAL_ALIGN_MAP, USER_SELECT_TO_SELECTABLE, applyAria } from './shared'

/**
 * RN feature flags:selectable Text 是否走 RCTSelectableText(默认 false → RCTText),
 * overflow:hidden 是否默认注入(默认 true)。对齐 RN Text.js + TextNativeComponent.js。
 *
 * 不用 require('react-native/src/private/featureflags/ReactNativeFeatureFlags'):
 *  1. 该模块是 Flow 源码,esbuild/vitest 无法解析(jest 靠 babel-preset 编译) → 测试环境 require 必失败。
 *  2. createNativeFlagGetter 在无原生模块时返回 defaultValue:
 *     NativeReactNativeFeatureFlags(undefined)?.[name]?.() ?? defaultValue。
 *     rn-dom 的 Fabric/DOM 环境无该原生模块 → 永远拿到默认值。
 *  3. 因此直接采用 RN 默认值常量(enablePreparedTextLayout=false /
 *     defaultTextToOverflowHidden=true),与运行期行为一致,且不引入 Flow 依赖。
 */
const enablePreparedTextLayout = () => false
const defaultTextToOverflowHidden = () => true

export class RNTextElement extends RNNode {
  /**
   * @internal - iOS 原生名按 props/ancestry 拆分(对齐 RN Text.js):
   *  - 嵌套在 Text 内 → RCTVirtualText
   *  - selectable=true(prop 或 style.userSelect)→ RCTSelectableText
   *    仅当 enablePreparedTextLayout()(默认 false):RN TextNativeComponent.js
   *    NativeSelectableText = enablePreparedTextLayout() ? RCTSelectableText
   *    : NativeText。默认走 RCTText,否则 C++ 映射 SelectableParagraph 在
   *    iOS 未注册 → UnimplementedView 空视图。
   * Android 无这些原生名,回退 RCTText(selectable 走 prop)。
   */
  __RN_resolveNativeName(): string | null {
    if (Platform.OS !== 'ios') return null
    if (this.parentNode?.tagName === 'Text') return 'RCTVirtualText'
    // selectable:prop 或 style.userSelect(auto/text/all → true)。
    const selectable =
      this.__RN_currentProps.selectable === true ||
      (() => {
        const style = flatStyle(this.__RN_currentProps.style)
        return style != null && style.userSelect != null && USER_SELECT_TO_SELECTABLE[style.userSelect as string] === true
      })()
    if (selectable && enablePreparedTextLayout()) return 'RCTSelectableText'
    return null
  }

  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    let tNext = props
    // Defaults RN injects unconditionally (Text.js).
    if (props.ellipsizeMode === undefined || props.allowFontScaling === undefined) {
      tNext = {
        ...props,
        ellipsizeMode: props.ellipsizeMode === undefined ? 'tail' : props.ellipsizeMode,
        allowFontScaling: props.allowFontScaling !== false,
      }
    }
    // RN Text.js styles.default = { overflow: 'hidden' } 默认注入
    // (defaultTextToOverflowHidden() 默认 true)。
    if (defaultTextToOverflowHidden()) {
      tNext = { ...tNext, style: appendStylePrefix(tNext.style, { overflow: 'hidden' }) }
    }
    // Style transforms (RN Text.js).
    const textStyle = flatStyle(props.style)
    if (textStyle) {
      let overrides: Record<string, unknown> | null = null
      if (typeof textStyle.fontWeight === 'number') {
        overrides = overrides || {}
        overrides.fontWeight = String(textStyle.fontWeight)
      }
      if (textStyle.userSelect != null) {
        overrides = overrides || {}
        overrides.userSelect = undefined
        if (tNext.selectable === undefined) {
          if (tNext === props) tNext = { ...props }
          tNext.selectable = USER_SELECT_TO_SELECTABLE[textStyle.userSelect as string]
        }
      }
      if (textStyle.verticalAlign != null) {
        overrides = overrides || {}
        overrides.verticalAlign = undefined
        if (tNext === props) tNext = { ...props }
        tNext.textAlignVertical =
          VERTICAL_ALIGN_MAP[textStyle.verticalAlign as string] ?? textStyle.verticalAlign
      }
      if (overrides) {
        tNext = { ...tNext, style: appendStyleOverride(tNext.style, overrides) }
      }
    }
    // ── RN Text.js render 语义:accessible 平台默认 / link role / numberOfLines
    // 校验 / id→nativeID / aria 通用转换。
    const result: Record<string, unknown> = { ...tNext }
    if (props.id != null && result.nativeID == null) result.nativeID = props.id
    // numberOfLines 必须非负(RN 非法→0)。
    if (props.numberOfLines != null && !((props.numberOfLines as number) >= 0)) {
      result.numberOfLines = 0
    }
    // accessible:ios 默认 true;android 仅当有 onPress/onLongPress 才算可访问。
    const hasPress =
      props.onPress != null || props.onLongPress != null || props.onStartShouldSetResponder != null
    // disabled 同步(RN Text.js):_disabled = disabled ?? accessibilityState.disabled,
    // aria-disabled 先并入 accessibilityState,再按 disabled prop 同步 accessibilityState。
    let accState = props.accessibilityState as Record<string, unknown> | undefined
    const ariaDisabled = props['aria-disabled'] as boolean | undefined
    if (ariaDisabled != null && (accState == null || accState.disabled !== ariaDisabled)) {
      accState = accState ? { ...accState, disabled: ariaDisabled } : { disabled: ariaDisabled }
    }
    const disabledValue = props.disabled ?? accState?.disabled
    if (
      disabledValue !== accState?.disabled &&
      ((disabledValue != null && disabledValue !== false) ||
        (accState?.disabled != null && accState?.disabled !== false))
    ) {
      accState = accState ? { ...accState, disabled: disabledValue } : { disabled: disabledValue }
    }
    const isPressable = hasPress && disabledValue !== true
    result.accessible = Platform.OS === 'ios'
      ? props.accessible !== false
      : (props.accessible == null ? isPressable : props.accessible)
    // pressable 且未显式 role/accessibilityRole → link role(RN Text.js)。
    if (isPressable && props.accessibilityRole == null && props.role == null) {
      result.accessibilityRole = 'link'
    }
    // 输出 disabled(同步后)与 pressable 标记(RN Text.js processedProps / PressableText)。
    if (accState !== undefined) result.accessibilityState = accState
    if (disabledValue !== undefined) result.disabled = disabledValue
    if (isPressable) {
      result.isPressable = true
      result.isHighlighted = false
    }
    return applyAria(result)
  }
}
