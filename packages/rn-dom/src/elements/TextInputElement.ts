/**
 * @rasenjs/rn-dom — elements/TextInputNode
 *
 * TextInput / AndroidTextInput 标签的 RN JS 层 prop 转换(对齐 RN TextInput.js):
 *  - value / defaultValue → 原生 `text`(value 不在原生 validAttributes 里)
 *  - numberOfLines = rows ?? numberOfLines
 *  - submitBehavior 由 multiline + blurOnSubmit 推导
 *  - Android: autoCapitalize 默认 'sentences'、placeholder 默认 ''、
 *    cursorColor/selectionHandleColor 默认取 selectionColor
 *  - style.verticalAlign → textAlignVertical
 */

import { Platform } from 'react-native'
import { RNNode, type RNDomInternalNode } from '../node'
import type { RNTextNode, RNCommentNode } from '../node'
import type { FabricUIManager } from '../fabric-global'
import { dispatchCommand } from '../internal'
import { flatStyle, appendStyleOverride, VERTICAL_ALIGN_MAP, applyAria } from './shared'

// ── RN TextInput.js 外层映射表(D1-D4)──
/** enterKeyHint → returnKeyType(TextInput.js L805-813)。 */
const ENTER_KEY_HINT_TO_RETURN_TYPE: Record<string, string> = {
  done: 'done', enter: 'default', go: 'go', next: 'next',
  previous: 'previous', search: 'search', send: 'send',
}
/** inputMode → keyboardType(TextInput.js L815-826)。search 平台相关。 */
const INPUT_MODE_TO_KEYBOARD_TYPE: Record<string, string> = {
  decimal: 'decimal-pad', email: 'email-address', none: 'default',
  numeric: 'number-pad', tel: 'phone-pad', text: 'default', url: 'url',
}
/** autoComplete(web)→ Android autoComplete(TextInput.js L828-860)。 */
const AUTOCOMPLETE_WEB_TO_ANDROID: Record<string, string> = {
  'additional-name': 'name-middle', 'address-line1': 'postal-address-region',
  'address-line2': 'postal-address-locality', bday: 'birthdate-full',
  'bday-day': 'birthdate-day', 'bday-month': 'birthdate-month', 'bday-year': 'birthdate-year',
  'cc-csc': 'cc-csc', 'cc-exp': 'cc-exp', 'cc-exp-month': 'cc-exp-month',
  'cc-exp-year': 'cc-exp-year', 'cc-number': 'cc-number', country: 'postal-address-country',
  'current-password': 'password', email: 'email', 'family-name': 'name-family',
  'given-name': 'name-given', 'honorific-prefix': 'name-prefix',
  'honorific-suffix': 'name-suffix', name: 'name', 'new-password': 'password-new',
  off: 'off', 'one-time-code': 'sms-otp', 'postal-code': 'postal-code',
  sex: 'gender', 'street-address': 'street-address', tel: 'tel',
  'tel-country-code': 'tel-country-code', 'tel-national': 'tel-national', username: 'username',
}
/** autoComplete(web)→ iOS textContentType(TextInput.js L862-898)。 */
const AUTOCOMPLETE_WEB_TO_TEXT_CONTENT_TYPE: Record<string, string> = {
  'additional-name': 'middleName', 'address-line1': 'streetAddressLine1',
  'address-line2': 'streetAddressLine2', bday: 'birthdate',
  'bday-day': 'birthdateDay', 'bday-month': 'birthdateMonth', 'bday-year': 'birthdateYear',
  'cc-additional-name': 'creditCardMiddleName', 'cc-csc': 'creditCardSecurityCode',
  'cc-exp': 'creditCardExpiration', 'cc-exp-month': 'creditCardExpirationMonth',
  'cc-exp-year': 'creditCardExpirationYear', 'cc-family-name': 'creditCardFamilyName',
  'cc-given-name': 'creditCardGivenName', 'cc-name': 'creditCardName',
  'cc-number': 'creditCardNumber', 'cc-type': 'creditCardType', country: 'countryName',
  'current-password': 'password', email: 'emailAddress', 'family-name': 'familyName',
  'given-name': 'givenName', 'honorific-prefix': 'namePrefix',
  'honorific-suffix': 'nameSuffix', name: 'name', 'new-password': 'newPassword',
  nickname: 'nickname', off: 'none', 'one-time-code': 'oneTimeCode',
  organization: 'organizationName', 'organization-title': 'jobTitle',
  'postal-code': 'postalCode', 'street-address': 'fullStreetAddress',
  tel: 'telephoneNumber', url: 'URL', username: 'username',
}

export class RNTextInputElement extends RNNode {
  /** 受控 TextInput 状态:最后一次 native 报告的 text + eventCount。 */
  __RN_textInputState: { nativeText: string; eventCount: number } | null = null

  /** 受控 TextInput selection:最后一次 native 报告的 selection。 */
  __RN_lastNativeSelection: { start: number; end: number } | null = null

  /**
   * @internal - iOS 按 multiline 拆分原生名(对齐 RN TextInput.js):
   * multiline → RCTMultilineTextInputView;单行保持 RCTSinglelineTextInputView。
   * Android 用 AndroidTextInput(两者皆可),无需覆盖。
   */
  __RN_resolveNativeName(): string | null {
    if (Platform.OS === 'android') return null
    return this.__RN_currentProps.multiline === true ? 'RCTMultilineTextInputView' : null
  }

  /**
   * @internal - 受控回写同步(RN useLayoutEffect sync)。value/selection 与
   * native 记录不一致时 dispatch setTextAndSelection。eventCount 传给原生,
   * 由原生端判断是否忽略旧值回写(RN mostRecentEventCount 竞态防护)。
   */
  __RN_syncControlledProp(name: string): void {
    // value 与 defaultValue 都触发回写(RN effect: text = value ?? defaultValue,
    // 任一变化时与 nativeText 不一致即回写)。
    if (name === 'value' || name === 'defaultValue') {
      if (this.__RN_textInputState != null) {
        const v = this.__RN_currentProps.value
        const dv = this.__RN_currentProps.defaultValue
        const target = typeof v === 'string' ? v : (typeof dv === 'string' ? dv : null)
        if (target != null && target !== this.__RN_textInputState.nativeText) {
          dispatchCommand(this as unknown as RNDomInternalNode, 'setTextAndSelection', [
            this.__RN_textInputState.eventCount,
            target,
            -1,
            -1,
          ])
        }
      }
    } else if (name === 'selection') {
      if (this.__RN_lastNativeSelection != null) {
        const raw = this.__RN_currentProps.selection as { start?: number; end?: number } | undefined
        const last = this.__RN_lastNativeSelection
        // RN 归一:selection={{start}} 缺 end 时 end = start(TextInput.js)。
        const sel = raw ? { start: raw.start, end: raw.end ?? raw.start } : null
        if (sel && (sel.start !== last.start || sel.end !== last.end)) {
          dispatchCommand(this as unknown as RNDomInternalNode, 'setTextAndSelection', [
            this.__RN_textInputState?.eventCount ?? 0,
            null,
            sel.start ?? -1,
            sel.end ?? -1,
          ])
        }
      }
    }
  }

  /**
   * @internal - RN TextInput.js:value 与 children 互斥(invariant 抛错)。
   * children 作为初始占位文本;childCount>1 时 RN 包一层 <Text>(Android 语义)。
   */
  __RN_buildChildren(
    childSet: unknown,
    fabricUIManager: FabricUIManager,
    _rootTag: number,
    getFabricNode: (node: RNNode | RNTextNode | RNCommentNode) => unknown,
  ): void {
    const childCount = this.__RN_children.length
    if (this.__RN_currentProps.value != null && childCount > 0) {
      throw new Error('Cannot specify both value and children.')
    }
    for (const subChild of this.__RN_children) {
      const f = getFabricNode(subChild)
      if (f) fabricUIManager.appendChildToSet(childSet, f)
    }
  }

  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    // RN always sends the controlled value as the native `text` prop.
    let text = props.text
    if (text === undefined && typeof props.value === 'string') text = props.value
    else if (text === undefined && typeof props.defaultValue === 'string') text = props.defaultValue

    let next = text === undefined ? props : { ...props, text }

    // numberOfLines = rows ?? numberOfLines (RN: rows wins).
    const numberOfLines = props.rows != null ? props.rows : props.numberOfLines
    if (numberOfLines !== undefined && numberOfLines !== props.numberOfLines) {
      next = next === props ? { ...props } : next
      next.numberOfLines = numberOfLines
    }

    // submitBehavior — derived from multiline + blurOnSubmit (RN TextInput.js).
    const multiline = props.multiline === true
    let submitBehavior: string
    if (props.submitBehavior != null) {
      submitBehavior = !multiline && props.submitBehavior === 'newline'
        ? 'blurAndSubmit'
        : props.submitBehavior as string
    } else if (multiline) {
      submitBehavior = props.blurOnSubmit === true ? 'blurAndSubmit' : 'newline'
    } else {
      submitBehavior = props.blurOnSubmit === false ? 'submit' : 'blurAndSubmit'
    }
    if (next === props) next = { ...props }
    next.submitBehavior = submitBehavior

    const isAndroid = Platform.OS === 'android'
    if (isAndroid) {
      // AndroidTextInput defaults RN injects, plus cursor/selection colors.
      if (next.autoCapitalize === undefined) next.autoCapitalize = 'sentences'
      if (next.placeholder === undefined) next.placeholder = ''
      const selectionColor = next.selectionColor
      if (next.cursorColor === undefined && selectionColor !== undefined) next.cursorColor = selectionColor
      if (next.selectionHandleColor === undefined && selectionColor !== undefined) next.selectionHandleColor = selectionColor
    }

    // style 转换(对齐 RN TextInput.js):verticalAlign→textAlignVertical +
    // fontWeight 数字→字符串(与 TextElement 一致)。
    const tStyle = flatStyle(next.style)
    if (tStyle) {
      const overrides: Record<string, unknown> = {}
      if (tStyle.verticalAlign != null) {
        overrides.verticalAlign = undefined
        next = {
          ...next,
          textAlignVertical: VERTICAL_ALIGN_MAP[tStyle.verticalAlign as string] ?? tStyle.verticalAlign,
        }
      }
      if (typeof tStyle.fontWeight === 'number') {
        overrides.fontWeight = String(tStyle.fontWeight)
      }
      if (Object.keys(overrides).length > 0) {
        next = { ...next, style: appendStyleOverride(next.style, overrides) }
      }
    }
    // iOS multiline 默认 paddingTop:5(RN TextInput.js styles.multilineDefault)。
    if (Platform.OS === 'ios' && multiline) {
      const flat = flatStyle(next.style)
      const useDefault = flat == null ||
        (flat.padding == null && flat.paddingVertical == null && flat.paddingTop == null)
      if (useDefault) {
        next = { ...next, style: appendStyleOverride(next.style, { paddingTop: 5 }) }
      }
    }
    // ── RN TextInput.js 公共外层映射 + 可访问性 ──
    if (next === props) next = { ...props }
    // 默认注入(TextInput.js 外层):allowFontScaling / rejectResponderTermination /
    // Android underlineColorAndroid。
    if (next.allowFontScaling === undefined) next.allowFontScaling = true
    if (next.rejectResponderTermination === undefined) next.rejectResponderTermination = true
    if (isAndroid && next.underlineColorAndroid === undefined) next.underlineColorAndroid = 'transparent'
    // readOnly → editable(TextInput.js L762)。
    if (props.readOnly !== undefined) next.editable = !props.readOnly
    // enterKeyHint → returnKeyType(优先于 returnKeyType)。
    if (props.enterKeyHint != null) {
      next.returnKeyType = ENTER_KEY_HINT_TO_RETURN_TYPE[props.enterKeyHint as string]
    }
    // inputMode → keyboardType(search 平台相关)。
    if (props.inputMode != null) {
      next.keyboardType = props.inputMode === 'search'
        ? (Platform.OS === 'ios' ? 'web-search' : 'default')
        : INPUT_MODE_TO_KEYBOARD_TYPE[props.inputMode as string]
      // inputMode 存在时覆盖 showSoftInputOnFocus:none→false,其余 true。
      next.showSoftInputOnFocus = props.inputMode !== 'none'
    }
    // autoComplete(web)→ Android autoComplete / iOS textContentType。
    if (isAndroid) {
      if (props.autoComplete != null) {
        next.autoComplete =
          AUTOCOMPLETE_WEB_TO_ANDROID[props.autoComplete as string] ?? props.autoComplete
      }
    } else {
      next.autoComplete = undefined
      if (props.textContentType != null) {
        next.textContentType = props.textContentType
      } else if (props.autoComplete != null) {
        const mapped = AUTOCOMPLETE_WEB_TO_TEXT_CONTENT_TYPE[props.autoComplete as string]
        if (mapped != null) next.textContentType = mapped
      }
    }
    // 可访问性:TextInput 默认可访问;tabIndex 显式时控制 focusable。
    next.accessible = props.accessible !== false
    next.focusable = props.tabIndex !== undefined ? !props.tabIndex : props.focusable !== false
    // 测试环境下隐藏光标(RN TextInput.js caretHidden)。
    if (Platform.isTesting) next.caretHidden = true
    return applyAria(next)
  }

  /**
   * @internal - RN TextInput 事件专属处理(替代 event-system 的 topChange 大 if):
   *  - topChange:onChangeText 把 nativeEvent.text 以字符串传给用户(表面 API)
   *    + 受控记录 text/eventCount(setAttribute 回写用)
   *  - topSelectionChange:记录 native selection(受控 selection 回写用)
   * onChange 是 bubbling 通用 handler,仍走 event-system 通用分发。
   */
  __RN_handleNativeEvent(type: string, event: Record<string, unknown>): boolean | void {
    const ne = event.nativeEvent as Record<string, unknown>
    if (type === 'topSelectionChange') {
      const sel = ne.selection as { start?: number; end?: number } | undefined
      if (sel && typeof sel.start === 'number' && typeof sel.end === 'number') {
        this.__RN_lastNativeSelection = { start: sel.start, end: sel.end }
      }
      return
    }
    if (type !== 'topChange') return
    const onChangeText = this.__RN_currentProps.onChangeText
    if (typeof onChangeText === 'function') {
      ;(onChangeText as (text: string) => void)(String(ne.text ?? ''))
    }
    // 受控记录(RN useTextInputStateSynchronization)。
    if (typeof ne.text === 'string') {
      this.__RN_textInputState = {
        nativeText: ne.text,
        eventCount: typeof ne.eventCount === 'number' ? ne.eventCount : 0,
      }
    }
  }
}
