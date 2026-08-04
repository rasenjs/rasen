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
import { flatStyle, appendStyleOverride, VERTICAL_ALIGN_MAP, USER_SELECT_TO_SELECTABLE, applyAria } from './shared'

export class RNTextElement extends RNNode {
  /**
   * @internal - iOS 原生名按 props/ancestry 拆分(对齐 RN Text.js):
   *  - 嵌套在 Text 内 → RCTVirtualText
   *  - selectable=true(prop 或 style.userSelect)→ RCTSelectableText
   * Android 无这些原生名,回退 RCTText(selectable 走 prop)。
   */
  __RN_resolveNativeName(): string | null {
    if (Platform.OS !== 'ios') return null
    if (this.parentNode?.tagName === 'Text') return 'RCTVirtualText'
    // selectable:prop 或 style.userSelect(auto/text/all → true)。
    if (this.__RN_currentProps.selectable === true) return 'RCTSelectableText'
    const style = flatStyle(this.__RN_currentProps.style)
    if (style && style.userSelect != null && USER_SELECT_TO_SELECTABLE[style.userSelect as string] === true) {
      return 'RCTSelectableText'
    }
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
    const disabled = props.disabled ?? (props.accessibilityState as Record<string, unknown> | undefined)?.disabled
    const isPressable = hasPress && disabled !== true
    result.accessible = Platform.OS === 'ios'
      ? props.accessible !== false
      : (props.accessible == null ? isPressable : props.accessible)
    // pressable 且未显式 role/accessibilityRole → link role(RN Text.js)。
    if (isPressable && props.accessibilityRole == null && props.role == null) {
      result.accessibilityRole = 'link'
    }
    return applyAria(result)
  }
}
