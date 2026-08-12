/**
 * @rasenjs/rn-dom — RN JS-layer component normalization + commands tests
 *
 * Gates the RN component JS-layer transforms we replicate in the per-tag
 * element classes (src/elements/* — __RN_normalizeProps) and rn-dom's RNNode
 * (value→text, Switch platform props, Image defaults, ScrollView base styles,
 * Modal defaults, Fabric commands, controlled-component re-sync).
 */

import { describe, it, expect, vi } from 'vitest'
import { Platform } from 'react-native'
import { RNDocument, resetTagCounter, type RNNode, scrollToEnd, openDrawer, closeDrawer } from '../index'
import { type RNDomInternalNode } from '../node'
import { setNativeProps } from '../internal'
import { getFabricNode, submitToRoot } from '../internal'
import { getElementClass } from '../elements/registry'
import { applyAria } from '../elements/shared'
import { resetFabricMocks, nativeFabricUIManager, mockKeyboard } from './setup'

/**
 * 通过元素注册表实例化标签节点类,调用其 __RN_normalizeProps —— 与运行时
 * createElement 走同一路径(替代旧的 elements.cjs __RN_normalizeProps 函数)。
 */

/** 测试内部成员访问:经内部接口读 protected 成员(不用 as any)。 */
const internal = <T,>(node: T): RNDomInternalNode => node as unknown as RNDomInternalNode

/** TextInput 子类内部字段(测试局部接口)。 */
interface TextInputInternal extends RNDomInternalNode {
  __RN_textInputState: { nativeText: string; eventCount: number } | null
  __RN_lastNativeSelection: { start: number; end: number } | null
}

/** Switch 子类内部字段。 */
interface SwitchInternal extends RNDomInternalNode {
  __RN_switchNativeValue: boolean | null
}

/** ScrollView 公共命令(子类方法,基类 RNNode 上没有)。 */
interface ScrollViewInternal extends RNDomInternalNode {
  scrollTo(x: number, y: number, animated?: boolean): void
  scrollToEnd(animated?: boolean): void
}

function createElement(tagName: string): RNNode {
  const Ctor = getElementClass(tagName)
  return new Ctor(null as never, 0, tagName, {}, null as never) as unknown as RNNode
}

function normalize(tagName: string, props: Record<string, unknown>): Record<string, unknown> {
  return internal(createElement(tagName)).__RN_normalizeProps(props)
}

/** 临时切到 android 平台执行(节点类内部用 Platform.OS 分支),返回结果。 */
function withAndroid<T>(fn: () => T): T {
  const os = Platform as unknown as { OS: string }
  const prev = os.OS
  os.OS = 'android'
  try {
    return fn()
  } finally {
    os.OS = prev
  }
}

function createDoc(): RNDocument {
  RNDocument.reset()
  resetTagCounter()
  resetFabricMocks()
  return RNDocument.getOrCreate(1)
}

function lastCreateNodeCall(): { viewName: string; props: Record<string, unknown> } {
  const calls = nativeFabricUIManager.createNode.mock.calls as unknown as Array<[number, string, number, Record<string, unknown>]>
  const call = calls[calls.length - 1]
  return { viewName: call[1], props: call[3] }
}

describe('__RN_normalizeProps — TextInput (TextInput.js)', () => {
  it('value → native text prop', () => {
    const out = normalize('TextInput', { value: 'hello' })
    expect(out.text).toBe('hello')
  })

  it('defaultValue → text when no value', () => {
    const out = normalize('TextInput', { defaultValue: 'draft' })
    expect(out.text).toBe('draft')
  })

  it('explicit text wins over value', () => {
    const out = normalize('TextInput', { text: 'a', value: 'b' })
    expect(out.text).toBe('a')
  })

  it('submitBehavior: single-line default blurAndSubmit', () => {
    expect(normalize('TextInput', {}).submitBehavior).toBe('blurAndSubmit')
  })

  it('submitBehavior: single-line blurOnSubmit=false → submit', () => {
    expect(normalize('TextInput', { blurOnSubmit: false }).submitBehavior).toBe('submit')
  })

  it('submitBehavior: multiline default → newline', () => {
    expect(normalize('TextInput', { multiline: true }).submitBehavior).toBe('newline')
  })

  it('submitBehavior: multiline blurOnSubmit=true → blurAndSubmit', () => {
    expect(normalize('TextInput', { multiline: true, blurOnSubmit: true }).submitBehavior).toBe('blurAndSubmit')
  })

  it('submitBehavior: explicit newline on single-line → blurAndSubmit', () => {
    expect(normalize('TextInput', { submitBehavior: 'newline' }).submitBehavior).toBe('blurAndSubmit')
  })

  it('android: autoCapitalize default sentences + placeholder default empty', () => {
    const out = withAndroid(() => normalize('TextInput', {}))
    expect(out.autoCapitalize).toBe('sentences')
    expect(out.placeholder).toBe('')
  })

  it('android: cursorColor defaults to selectionColor', () => {
    const out = withAndroid(() => normalize('TextInput', { selectionColor: '#f00' }))
    expect(out.cursorColor).toBe('#f00')
    expect(out.selectionHandleColor).toBe('#f00')
  })

  it('rows overrides numberOfLines', () => {
    const out = normalize('TextInput', { rows: 3, numberOfLines: 5 })
    expect(out.numberOfLines).toBe(3)
  })

  it('style.verticalAlign → textAlignVertical', () => {
    const out = normalize('TextInput', { style: { verticalAlign: 'top' } })
    expect(out.textAlignVertical).toBe('top')
  })

  it('外层映射:readOnly → editable (TextInput.js)', () => {
    expect(normalize('TextInput', { readOnly: true }).editable).toBe(false)
    expect(normalize('TextInput', { readOnly: false }).editable).toBe(true)
  })

  it('外层映射:enterKeyHint → returnKeyType', () => {
    expect(normalize('TextInput', { enterKeyHint: 'search' }).returnKeyType).toBe('search')
  })

  it('外层映射:inputMode → keyboardType + showSoftInputOnFocus', () => {
    expect(normalize('TextInput', { inputMode: 'email' }).keyboardType).toBe('email-address')
    expect(withAndroid(() => normalize('TextInput', { inputMode: 'search' })).keyboardType).toBe('default')
    expect(normalize('TextInput', { inputMode: 'search' }).keyboardType).toBe('web-search')
    expect(normalize('TextInput', { inputMode: 'numeric' }).showSoftInputOnFocus).toBe(true)
    expect(normalize('TextInput', { inputMode: 'none' }).showSoftInputOnFocus).toBe(false)
  })

  it('外层映射:autoComplete android → autoComplete;ios → textContentType', () => {
    const andr = withAndroid(() => normalize('TextInput', { autoComplete: 'email' }))
    expect(andr.autoComplete).toBe('email')
    const ios = normalize('TextInput', { autoComplete: 'email' })
    expect(ios.autoComplete).toBeUndefined()
    expect(ios.textContentType).toBe('emailAddress')
    // textContentType 显式时优先。
    expect(normalize('TextInput', { autoComplete: 'email', textContentType: 'password' }).textContentType).toBe('password')
  })

  it('可访问性:accessible 默认 true;tabIndex → focusable (TextInput.js)', () => {
    expect(normalize('TextInput', {}).accessible).toBe(true)
    expect(normalize('TextInput', { accessible: false }).accessible).toBe(false)
    expect(normalize('TextInput', { tabIndex: 0 }).focusable).toBe(true)
    expect(normalize('TextInput', { tabIndex: -1 }).focusable).toBe(false)
  })

  it('外层默认:allowFontScaling/rejectResponderTermination 默认 true + android underlineColorAndroid', () => {
    expect(normalize('TextInput', {}).allowFontScaling).toBe(true)
    expect(normalize('TextInput', {}).rejectResponderTermination).toBe(true)
    expect(withAndroid(() => normalize('TextInput', {})).underlineColorAndroid).toBe('transparent')
  })
})

describe('__RN_normalizeProps — Switch (Switch.js)', () => {
  it('android: value → on, disabled → enabled, thumbColor → thumbTintColor', () => {
    const out = withAndroid(() => normalize('Switch', { value: true, disabled: true, thumbColor: '#abc' }))
    expect(out.on).toBe(true)
    expect(out.enabled).toBe(false)
    expect(out.thumbTintColor).toBe('#abc')
  })

  it('android: trackColor split to trackColorForFalse/True + trackTintColor', () => {
    const out = withAndroid(() =>
      normalize('Switch', { value: true, trackColor: { false: '#111', true: '#222' } }),
    )
    expect(out.trackColorForFalse).toBe('#111')
    expect(out.trackColorForTrue).toBe('#222')
    expect(out.trackTintColor).toBe('#222')
  })

  it('ios: value stays boolean, trackColor → onTintColor/tintColor', () => {
    const out = normalize('Switch', { value: true, trackColor: { false: '#111', true: '#222' } })
    expect(out.value).toBe(true)
    expect(out.onTintColor).toBe('#222')
    expect(out.tintColor).toBe('#111')
  })

  it('ios: ios_backgroundColor baked into style (base alignSelf flex-start + override)', () => {
    const out = normalize('Switch', { ios_backgroundColor: '#333' })
    expect(out.style).toEqual([
      { alignSelf: 'flex-start' },
      { backgroundColor: '#333', borderRadius: 16 },
    ])
  })

  it('ios: 无 ios_backgroundColor 也有 base alignSelf flex-start,且 role=switch/responder', () => {
    const out = normalize('Switch', { value: true })
    expect(out.style).toEqual([{ alignSelf: 'flex-start' }])
    expect(out.accessibilityRole).toBe('switch')
    expect(typeof out.onResponderTerminationRequest).toBe('function')
    expect(typeof out.onStartShouldSetResponder).toBe('function')
  })

  it('android: 剥离 iOS 专属 onTintColor/tintColor', () => {
    const out = withAndroid(() => normalize('Switch', { value: true, onTintColor: '#111', tintColor: '#222' }))
    expect(out.onTintColor).toBeUndefined()
    expect(out.tintColor).toBeUndefined()
  })

  it('disabled 回退:disabled 未设时用 accessibilityState.disabled', () => {
    const out = normalize('Switch', { accessibilityState: { disabled: true } })
    expect(out.accessibilityState).toEqual({ disabled: true })
  })

  it('iOS:disabled 显式时重写 accessibilityState', () => {
    const out = normalize('Switch', { disabled: true, accessibilityState: { selected: true } })
    expect(out.accessibilityState).toEqual({ disabled: true, selected: true })
  })

  it('android:disabled 回退 + accessibilityState 保留用户字段(RN merge)', () => {
    // 用户 state.disabled=true 与 disabled 未显式 → 原样保留(不整体替换)。
    const out = withAndroid(() => normalize('Switch', { accessibilityState: { disabled: true } }))
    expect(out.accessibilityState).toEqual({ disabled: true })
    // 显式 disabled 与用户 state 不同步 → merge 修正,保留其他字段。
    const out2 = withAndroid(() => normalize('Switch', { disabled: true, accessibilityState: { selected: true } }))
    expect(out2.accessibilityState).toEqual({ disabled: true, selected: true })
    // enabled 也回退 accessibilityState.disabled。
    const out3 = withAndroid(() => normalize('Switch', { accessibilityState: { disabled: true } }))
    expect(out3.enabled).toBe(false)
  })
})

describe('__RN_normalizeProps — Image (Image.android.js / Image.ios.js)', () => {
  it('resizeMode defaults to cover', () => {
    expect(normalize('Image', {}).resizeMode).toBe('cover')
  })

  it('resizeMode: prop wins', () => {
    expect(normalize('Image', { resizeMode: 'contain' }).resizeMode).toBe('contain')
  })

  it('source object → array', () => {
    const out = normalize('Image', { source: { uri: 'x' } })
    expect(out.source).toEqual([{ uri: 'x' }])
  })

  it('style base: overflow hidden injected', () => {
    const out = normalize('Image', { style: { width: 10 } })
    expect(out.style).toEqual([{ overflow: 'hidden' }, { width: 10 }])
  })

  it('android: shouldNotifyLoadEvents when load handlers present', () => {
    const withHandler = withAndroid(() => normalize('Image', { onLoad: () => {} }))
    expect(withHandler.shouldNotifyLoadEvents).toBe(true)
    const without = withAndroid(() => normalize('Image', {}))
    expect(without.shouldNotifyLoadEvents).toBeUndefined()
  })

  it('android: defaultSource object → uri, loadingIndicatorSource → loadingIndicatorSrc', () => {
    const out = withAndroid(() =>
      normalize('Image', { defaultSource: { uri: 'd' }, loadingIndicatorSource: { uri: 'l' } }),
    )
    expect(out.defaultSource).toBe('d')
    expect(out.loadingIndicatorSrc).toBe('l')
  })

  it('ios: tintColor from prop', () => {
    expect(normalize('Image', { tintColor: '#f00' }).tintColor).toBe('#f00')
  })

  it('srcSet splits into scale array (ImageSourceUtils)', () => {
    const out = normalize('Image', { srcSet: 'a.png 1x, b.png 2x' })
    expect(out.source).toEqual([
      { uri: 'a.png', scale: 1, headers: {} },
      { uri: 'b.png', scale: 2, headers: {} },
    ])
  })

  it('srcSet 无 1x 档时用 src 兜底(ImageSourceUtils)', () => {
    const out = normalize('Image', { srcSet: 'b.png 2x', src: 'a.png' })
    expect(out.source).toEqual([
      { uri: 'a.png', scale: 1, headers: {} },
      { uri: 'b.png', scale: 2, headers: {} },
    ])
  })

  it('src → { uri } array', () => {
    expect(normalize('Image', { src: 'a.png' }).source).toEqual([{ uri: 'a.png' }])
  })

  it('crossOrigin use-credentials merges headers into source', () => {
    const out = normalize('Image', { source: { uri: 'x' }, crossOrigin: 'use-credentials' })
    expect(out.source).toEqual([{ uri: 'x', headers: { 'Access-Control-Allow-Credentials': 'true' } }])
  })

  it('objectFit maps to resizeMode (ImageUtils)', () => {
    expect(normalize('Image', { style: { objectFit: 'fill' } }).resizeMode).toBe('stretch')
    expect(normalize('Image', { style: { objectFit: 'scale-down' } }).resizeMode).toBe('contain')
  })

  it('aria: alt chain → accessibilityLabel + accessible=true (Image.android/ios.js)', () => {
    const viaAlt = normalize('Image', { alt: 'desc' })
    expect(viaAlt.accessibilityLabel).toBe('desc')
    expect(viaAlt.accessible).toBe(true)
    const viaAria = normalize('Image', { 'aria-label': 'desc' })
    expect(viaAria.accessibilityLabel).toBe('desc')
    const viaAcc = normalize('Image', { accessibilityLabel: 'desc' })
    expect(viaAcc.accessibilityLabel).toBe('desc')
  })

  it('aria: aria-hidden → accessible=false,label 保留(iOS)', () => {
    const out = normalize('Image', { 'aria-hidden': true, alt: 'desc' })
    expect(out.accessible).toBe(false)
    // iOS aria-hidden 保留 label(RN Image.ios.js:accessible=false 已隐藏)。
    expect(out.accessibilityLabel).toBe('desc')
  })

  it('aria: android aria-hidden → importantForAccessibility no-hide-descendants', () => {
    const out = withAndroid(() => normalize('Image', { 'aria-hidden': true }))
    expect(out.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('defaultSource + loadingIndicatorSource → warn (不 throw)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      withAndroid(() => normalize('Image', { defaultSource: { uri: 'd' }, loadingIndicatorSource: { uri: 'l' } }))
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('单 source 固有宽高 → base style (RN Image: source.width ?? props.width)', () => {
    const out = normalize('Image', { source: { uri: 'x', width: 100, height: 80 } })
    expect((out.style as unknown[])[0]).toEqual({ overflow: 'hidden', width: 100, height: 80 })
  })

  it('单 source 无宽高 → 兜底 props.width/height', () => {
    const out = normalize('Image', { source: { uri: 'x' }, width: 60, height: 40 })
    expect((out.style as unknown[])[0]).toEqual({ overflow: 'hidden', width: 60, height: 40 })
  })

  it('单 source 无宽高且无 props → 仅 overflow:hidden base', () => {
    expect((normalize('Image', { source: { uri: 'x' } }).style as unknown[])[0]).toEqual({ overflow: 'hidden' })
  })

  it('referrerPolicy → source headers Referrer-Policy (RN ImageSourceUtils)', () => {
    const out = normalize('Image', { source: { uri: 'x' }, referrerPolicy: 'no-referrer' })
    expect(out.source).toEqual([{ uri: 'x', headers: { 'Referrer-Policy': 'no-referrer' } }])
  })

  it('android: source[0].headers → headers prop', () => {
    const out = withAndroid(() => normalize('Image', { source: [{ uri: 'x', headers: { a: '1' } }] }))
    expect(out.headers).toEqual({ a: '1' })
  })

  it('iOS tintColor = prop ?? style.tintColor (Image.ios.js)', () => {
    expect(normalize('Image', { style: { tintColor: '#abc' } }).tintColor).toBe('#abc')
    expect(normalize('Image', { tintColor: '#111', style: { tintColor: '#abc' } }).tintColor).toBe('#111')
  })
})

describe('__RN_normalizeProps — Text / Modal / ScrollView (Text.js / Modal.js / ScrollView.js)', () => {
  it('Text: ellipsizeMode default tail + allowFontScaling default true', () => {
    const out = normalize('Text', {})
    expect(out.ellipsizeMode).toBe('tail')
    expect(out.allowFontScaling).toBe(true)
  })

  it('Text: allowFontScaling={false} preserved', () => {
    expect(normalize('Text', { allowFontScaling: false }).allowFontScaling).toBe(false)
  })

  it('Text: fontWeight number → string (overflow:hidden 前缀在首)', () => {
    const out = normalize('Text', { style: { fontWeight: 700 } })
    // RN Text.js styles.default = {overflow:'hidden'} 默认注入在前,override 在末。
    expect(out.style).toEqual([{ overflow: 'hidden' }, { fontWeight: 700 }, { fontWeight: '700' }])
  })

  it('Text: 默认注入 overflow:hidden (defaultTextToOverflowHidden=true)', () => {
    expect(normalize('Text', {}).style).toEqual([{ overflow: 'hidden' }])
  })

  it('Text: accessible ios 默认 true;android 无按压默认 false (Text.js)', () => {
    expect(normalize('Text', {}).accessible).toBe(true)
    expect(withAndroid(() => normalize('Text', {})).accessible).toBe(false)
  })

  it('Text: pressable + 无 role → accessibilityRole=link (Text.js)', () => {
    const out = normalize('Text', { onPress: () => {} })
    expect(out.accessibilityRole).toBe('link')
    // 已有 role 时保留。
    expect(normalize('Text', { onPress: () => {}, role: 'button' }).accessibilityRole).toBeUndefined()
    // 无按压不设 link。
    expect(normalize('Text', {}).accessibilityRole).toBeUndefined()
  })

  it('Text: numberOfLines 负值 → 0 (Text.js 校验)', () => {
    expect(normalize('Text', { numberOfLines: -1 }).numberOfLines).toBe(0)
    expect(normalize('Text', { numberOfLines: 2 }).numberOfLines).toBe(2)
  })

  it('Text: id → nativeID + aria-label → accessibilityLabel (applyAria)', () => {
    const out = normalize('Text', { id: 't1', 'aria-label': '标题' })
    expect(out.nativeID).toBe('t1')
    expect(out.accessibilityLabel).toBe('标题')
  })

  it('Text: style.userSelect → selectable + 移除 userSelect (Text.js USER_SELECT_TO_SELECTABLE)', () => {
    const out = normalize('Text', { style: { userSelect: 'text' } })
    expect(out.selectable).toBe(true)
    // style:overflow 默认前缀在首;userSelect 被 override 移除(undefined)在末。
    const styleArr = out.style as unknown[]
    expect(styleArr[0]).toEqual({ overflow: 'hidden' })
    expect(styleArr[styleArr.length - 1]).toEqual({ userSelect: undefined })
  })

  it('Text: style.userSelect none → selectable=false', () => {
    expect(normalize('Text', { style: { userSelect: 'none' } }).selectable).toBe(false)
    expect(normalize('Text', { style: { userSelect: 'contain' } }).selectable).toBe(true)
  })

  it('Text: 显式 selectable 优先于 style.userSelect (Text.js)', () => {
    expect(normalize('Text', { selectable: false, style: { userSelect: 'text' } }).selectable).toBe(false)
  })

  it('Text: style.verticalAlign → textAlignVertical (VERTICAL_ALIGN_MAP)', () => {
    expect(normalize('Text', { style: { verticalAlign: 'middle' } }).textAlignVertical).toBe('center')
    expect(normalize('Text', { style: { verticalAlign: 'top' } }).textAlignVertical).toBe('top')
    expect(normalize('Text', { style: { verticalAlign: 'bottom' } }).textAlignVertical).toBe('bottom')
    expect(normalize('Text', { style: { verticalAlign: 'auto' } }).textAlignVertical).toBe('auto')
    // 未知值原样透传(?? verticalAlign)。
    expect(normalize('Text', { style: { verticalAlign: 'sub' } }).textAlignVertical).toBe('sub')
  })

  it('Modal: visible defaults to true', () => {
    expect(normalize('Modal', {}).visible).toBe(true)
    expect(normalize('Modal', { visible: false }).visible).toBe(false)
  })

  it('Modal: animationType default none', () => {
    expect(normalize('Modal', {}).animationType).toBe('none')
  })

  it('Modal: presentationStyle default fullScreen / overFullScreen when transparent', () => {
    expect(normalize('Modal', {}).presentationStyle).toBe('fullScreen')
    expect(normalize('Modal', { transparent: true }).presentationStyle).toBe('overFullScreen')
  })

  it('Modal: hardwareAccelerated 默认 false(===true 归一)', () => {
    expect(normalize('Modal', {}).hardwareAccelerated).toBe(false)
    expect(normalize('Modal', { hardwareAccelerated: true }).hardwareAccelerated).toBe(true)
  })

  it('Modal: __DEV__ confirmProps 三个警告 (Modal.js)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // presentationStyle + transparent(非 overFullScreen)→ 警告。
      normalize('Modal', { presentationStyle: 'pageSheet', transparent: true })
      expect(spy).toHaveBeenCalledWith('Cannot specify "transparent" prop with "presentationStyle" prop.')
      spy.mockClear()
      // navigationBarTranslucent 无 statusBarTranslucent → 警告。
      normalize('Modal', { navigationBarTranslucent: true })
      expect(spy).toHaveBeenCalledWith('`navigationBarTranslucent` requires `statusBarTranslucent` to be set.')
      spy.mockClear()
      // iOS allowSwipeDismissal 无 onRequestClose → 警告。
      normalize('Modal', { allowSwipeDismissal: true })
      expect(spy).toHaveBeenCalledWith('Cannot specify "allowSwipeDismissal" prop without "onRequestClose" prop.')
      // 满足条件不警告。
      spy.mockClear()
      normalize('Modal', { allowSwipeDismissal: true, onRequestClose: () => {} })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('Modal: __RN_preparePayload 注入 native identifier (Mount)', () => {
    const doc = createDoc()
    const m = doc.createElement('Modal')
    getFabricNode(internal(doc.body), m)
    expect(lastCreateNodeCall().viewName).toBe('ModalHostView')
    expect(typeof lastCreateNodeCall().props.identifier).toBe('number')
  })

  it('ScrollView: baseStyle injected', () => {
    const out = normalize('ScrollView', {})
    expect(out.style).toEqual([
      { flexGrow: 1, flexShrink: 1, flexDirection: 'column', overflow: 'scroll' },
      undefined,
    ])
  })

  it('ScrollView: horizontal baseStyle row', () => {
    const out = normalize('ScrollView', { horizontal: true })
    expect((out.style as Array<Record<string, unknown>>)[0].flexDirection).toBe('row')
  })

  it('ScrollView: decelerationRate normal → platform number', () => {
    expect(withAndroid(() => normalize('ScrollView', { decelerationRate: 'normal' })).decelerationRate).toBe(0.985)
    expect(normalize('ScrollView', { decelerationRate: 'normal' }).decelerationRate).toBe(0.998)
  })

  it('ScrollView: snapToStart/End default true', () => {
    const out = normalize('ScrollView', {})
    expect(out.snapToStart).toBe(true)
    expect(out.snapToEnd).toBe(true)
  })

  it('ScrollView: android pagingEnabled from snapToInterval', () => {
    expect(withAndroid(() => normalize('ScrollView', { snapToInterval: 100 })).pagingEnabled).toBe(true)
    expect(normalize('ScrollView', {}).pagingEnabled).toBe(false)
  })

  it('ScrollView: keyboardShouldPersistTaps boolean → string', () => {
    expect(normalize('ScrollView', { keyboardShouldPersistTaps: true }).keyboardShouldPersistTaps).toBe('always')
    expect(normalize('ScrollView', { keyboardShouldPersistTaps: false }).keyboardShouldPersistTaps).toBe('never')
  })

  it('ScrollView: android stickyHeaderIndices 非空 → removeClippedSubviews=false (ScrollView.js)', () => {
    const out = withAndroid(() => normalize('ScrollView', { removeClippedSubviews: true, stickyHeaderIndices: [0] }))
    expect(out.removeClippedSubviews).toBe(false)
    const noSticky = withAndroid(() => normalize('ScrollView', { removeClippedSubviews: true }))
    expect(noSticky.removeClippedSubviews).toBe(true)
  })

  it('ScrollView: iOS 忽略 removeClippedSubviews + collapsableChildren 联动', () => {
    const out = normalize('ScrollView', { removeClippedSubviews: true })
    expect(out.removeClippedSubviews).toBeUndefined()
    expect(out.collapsableChildren).toBeUndefined()
    const andr = withAndroid(() => normalize('ScrollView', { removeClippedSubviews: true }))
    expect(andr.collapsableChildren).toBe(false)
  })

  it('ScrollView: stickyHeaderIndices 非空 → scrollEventThrottle=1 (ScrollView.js)', () => {
    expect(normalize('ScrollView', { stickyHeaderIndices: [0] }).scrollEventThrottle).toBe(1)
    expect(normalize('ScrollView', {}).scrollEventThrottle).toBeUndefined()
  })

  it('ScrollView: alwaysBounceHorizontal/Vertical 默认随 horizontal (ScrollView.js)', () => {
    expect(normalize('ScrollView', {}).alwaysBounceHorizontal).toBe(false)
    expect(normalize('ScrollView', {}).alwaysBounceVertical).toBe(true)
    const h = normalize('ScrollView', { horizontal: true })
    expect(h.alwaysBounceHorizontal).toBe(true)
    expect(h.alwaysBounceVertical).toBe(false)
    expect(normalize('ScrollView', { alwaysBounceVertical: true }).alwaysBounceVertical).toBe(true)
    expect(normalize('ScrollView', { horizontal: true, alwaysBounceHorizontal: false }).alwaysBounceHorizontal).toBe(false)
  })

  it('ScrollView: sendMomentumEvents 由 onMomentumScrollBegin/End 驱动 (ScrollView.js)', () => {
    expect(normalize('ScrollView', {}).sendMomentumEvents).toBe(false)
    expect(normalize('ScrollView', { onMomentumScrollEnd: () => {} }).sendMomentumEvents).toBe(true)
    expect(normalize('ScrollView', { onMomentumScrollBegin: () => {} }).sendMomentumEvents).toBe(true)
  })

  it('ScrollView: decelerationRate fast → 平台数字 (ScrollView.js)', () => {
    expect(withAndroid(() => normalize('ScrollView', { decelerationRate: 'fast' })).decelerationRate).toBe(0.9)
    expect(normalize('ScrollView', { decelerationRate: 'fast' }).decelerationRate).toBe(0.99)
  })

  it('ScrollView: iOS pagingEnabled 需显式 true 且无 snapTo* (ScrollView.js)', () => {
    expect(normalize('ScrollView', { pagingEnabled: true }).pagingEnabled).toBe(true)
    expect(normalize('ScrollView', { pagingEnabled: true, snapToInterval: 100 }).pagingEnabled).toBe(false)
    expect(normalize('ScrollView', { pagingEnabled: true, snapToOffsets: [0] }).pagingEnabled).toBe(false)
  })

  it('ScrollView: android pagingEnabled 由 snapToInterval/snapToOffsets 驱动', () => {
    expect(withAndroid(() => normalize('ScrollView', { snapToOffsets: [0, 100] })).pagingEnabled).toBe(true)
    expect(withAndroid(() => normalize('ScrollView', { pagingEnabled: true })).pagingEnabled).toBe(true)
  })

  it('ScrollView: keyboardShouldPersistTaps 字符串原样透传', () => {
    expect(normalize('ScrollView', { keyboardShouldPersistTaps: 'handled' }).keyboardShouldPersistTaps).toBe('handled')
    expect(normalize('ScrollView', { keyboardShouldPersistTaps: 'always' }).keyboardShouldPersistTaps).toBe('always')
  })

  it('ScrollView: nestedScrollEnabled 默认 true (⚠️ rn-dom 全平台;RN 仅 android+refreshControl 分支)', () => {
    expect(normalize('ScrollView', {}).nestedScrollEnabled).toBe(true)
    expect(normalize('ScrollView', { nestedScrollEnabled: false }).nestedScrollEnabled).toBe(false)
  })
})

describe('Mount path (RNNode → Fabric)', () => {
  it('TextInput value flows to native text', () => {
    const doc = createDoc()
    const ti = doc.createElement('TextInput')
    ti.setAttribute('value', 'hi')
    getFabricNode(internal(doc.body), ti);
    expect(lastCreateNodeCall().viewName).toBe('RCTSinglelineTextInputView')
    expect(lastCreateNodeCall().props.text).toBe('hi')
  })

  it('TextInput multiline → iOS RCTMultilineTextInputView', () => {
    const doc = createDoc()
    const ti = doc.createElement('TextInput')
    ti.setAttribute('multiline', true)
    getFabricNode(internal(doc.body), ti);
    expect(lastCreateNodeCall().viewName).toBe('RCTMultilineTextInputView')
  })

  it('Text nested inside Text → RCTVirtualText', () => {
    const doc = createDoc()
    const outer = doc.createElement('Text')
    const inner = doc.createElement('Text')
    outer.appendChild(inner)
    getFabricNode(internal(doc.body), outer);
    // inner mounts while outer's children are processed
    const views = (nativeFabricUIManager.createNode.mock.calls as unknown as Array<[number, string]>).map(c => c[1])
    expect(views).toContain('RCTVirtualText')
  })

  it('Pressable resolves to RCTView', () => {
    const doc = createDoc()
    const p = doc.createElement('Pressable')
    getFabricNode(internal(doc.body), p);
    expect(lastCreateNodeCall().viewName).toBe('RCTView')
  })

  it('ScrollView content container carries contentContainerStyle', () => {
    const doc = createDoc()
    const sv = doc.createElement('ScrollView')
    sv.setAttribute('contentContainerStyle', { padding: 8 })
    sv.appendChild(doc.createElement('View')) // container only exists with children
    getFabricNode(internal(doc.body), sv);
    // The injected content container is the RCTView whose style is
    // [contentStyle(empty for vertical), contentContainerStyle].
    const views = nativeFabricUIManager.createNode.mock.calls as unknown as Array<[number, string, number, Record<string, unknown>]>
    const container = views.find(
      c => c[1] === 'RCTView' && Array.isArray(c[3]?.style) && (c[3].style as unknown[])[1] != null,
    )
    expect(container).toBeTruthy()
    expect((container![3].style as unknown[])[1]).toEqual({ padding: 8 })
  })

  it('Text selectable=true → iOS 默认 RCTText(enablePreparedTextLayout=false)', () => {
    const doc = createDoc()
    const t = doc.createElement('Text')
    t.setAttribute('selectable', true)
    getFabricNode(internal(doc.body), t);
    // RN TextNativeComponent.js:NativeSelectableText = enablePreparedTextLayout()
    // ? RCTSelectableText : NativeText。默认 false → RCTText(否则 iOS
    // SelectableParagraph 未注册 → UnimplementedView 空视图)。
    expect(lastCreateNodeCall().viewName).toBe('RCTText')
  })

  it('Text with userSelect style → iOS 默认 RCTText(同 gating)', () => {
    const doc = createDoc()
    const t = doc.createElement('Text')
    t.setAttribute('style', { userSelect: 'text' })
    getFabricNode(internal(doc.body), t);
    expect(lastCreateNodeCall().viewName).toBe('RCTText')
  })

  it('Modal children 直接挂 ModalHostView(无容器包装,RootNodeKind 子树容器 style 不生效)', () => {
    const doc = createDoc()
    const m = doc.createElement('Modal')
    m.appendChild(doc.createElement('View'))
    getFabricNode(internal(doc.body), m);
    const views = nativeFabricUIManager.createNode.mock.calls as unknown as Array<[number, string, number, Record<string, unknown>]>
    // Modal host + child View(无注入容器 RCTView)。
    const host = views.find(c => c[1] === 'ModalHostView')
    expect(host).toBeTruthy()
    const child = views.find(c => c[1] === 'RCTView')
    expect(child).toBeTruthy()
  })

  it('Image with children throws (RN semantics)', () => {
    const doc = createDoc()
    const img = doc.createElement('Image')
    img.appendChild(doc.createElement('View'))
    expect(() => getFabricNode(internal(doc.body), img)).toThrow(/cannot contain children/)
  })

  it('TextInput: JS selection diverging → setTextAndSelection (selection only)', () => {
    const doc = createDoc()
    const ti = doc.createElement('TextInput')
    getFabricNode(internal(doc.body), ti);
    ;(nativeFabricUIManager.dispatchCommand as unknown as { mockClear: () => void }).mockClear()
    ;(ti as unknown as TextInputInternal).__RN_lastNativeSelection = { start: 0, end: 0 }
    ti.setAttribute('selection', { start: 2, end: 5 })
    expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
      expect.anything(),
      'setTextAndSelection',
      [0, null, 2, 5],
    )
  })

  it('setNativeProps applies __RN_normalizeProps + native setNativeProps', () => {
    const doc = createDoc()
    const ti = doc.createElement('TextInput')
    getFabricNode(internal(doc.body), ti);
    setNativeProps(internal(ti), { value: 'x' })
    expect(nativeFabricUIManager.setNativeProps).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ text: 'x' }),
    )
  })

  it('TextInput: value + children throws (RN invariant)', () => {
    const doc = createDoc()
    const ti = doc.createElement('TextInput')
    ti.setAttribute('value', 'x')
    ti.appendChild(doc.createTextNode('placeholder'))
    expect(() => getFabricNode(internal(doc.body), ti)).toThrow(/Cannot specify both value and children/)
  })

  it('ScrollView: keyboardDismissMode on-drag dismisses keyboard (Android)', () => {
    withAndroid(() => {
      const doc = createDoc()
      const sv = doc.createElement('ScrollView')
      sv.setAttribute('keyboardDismissMode', 'on-drag')
      mockKeyboard.dismiss.mockClear()
      internal(sv).__RN_handleNativeEvent?.('topScrollBeginDrag', { nativeEvent: {} })
      expect(mockKeyboard.dismiss).toHaveBeenCalled()
    })
  })
})

describe('Fabric commands (RNNode ref methods)', () => {
  it('focus() dispatches the focus command', () => {
    const doc = createDoc()
    const ti = doc.createElement('TextInput')
    getFabricNode(internal(doc.body), ti); // mount
    ti.focus()
    expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
      expect.anything(),
      'focus',
      [],
    )
  })

  it('scrollTo dispatches scrollTo with args', () => {
    const doc = createDoc()
    const sv = doc.createElement('ScrollView')
    getFabricNode(internal(doc.body), sv);
    ;(sv as unknown as ScrollViewInternal).scrollTo(0, 100, true)
    expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
      expect.anything(),
      'scrollTo',
      [0, 100, true],
    )
  })

  it('scrollToEnd defaults animated=true', () => {
    const doc = createDoc()
    const sv = doc.createElement('ScrollView')
    getFabricNode(internal(doc.body), sv);
    ;scrollToEnd(sv)
    expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
      expect.anything(),
      'scrollToEnd',
      [true],
    )
  })

  it('openDrawer dispatches openDrawer command (Android)', () => {
    const doc = createDoc()
    const d = doc.createElement('DrawerLayoutAndroid')
    getFabricNode(internal(doc.body), d); // mount
    openDrawer(d)
    expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
      expect.anything(),
      'openDrawer',
      [],
    )
  })

  it('closeDrawer dispatches closeDrawer command (Android)', () => {
    const doc = createDoc()
    const d = doc.createElement('DrawerLayoutAndroid')
    getFabricNode(internal(doc.body), d); // mount
    closeDrawer(d)
    expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
      expect.anything(),
      'closeDrawer',
      [],
    )
  })

  it('no-op before mount (no crash)', () => {
    const doc = createDoc()
    const sv = doc.createElement('ScrollView')
    expect(() => (sv as unknown as ScrollViewInternal).scrollTo(0, 100)).not.toThrow()
    expect(nativeFabricUIManager.dispatchCommand).not.toHaveBeenCalled()
  })
})

describe('Controlled-component re-sync (RN controlled inputs/switches)', () => {
  it('TextInput: JS value diverging from native text → setTextAndSelection', () => {
    const doc = createDoc()
    const ti = doc.createElement('TextInput')
    ti.setAttribute('value', 'js')
    getFabricNode(internal(doc.body), ti); // mount with text 'js'
    ;(nativeFabricUIManager.dispatchCommand as unknown as { mockClear: () => void }).mockClear()

    // Native reports it now holds 'typed'; JS keeps 'js' → force native back.
    ;(ti as unknown as TextInputInternal).__RN_textInputState = { nativeText: 'typed', eventCount: 7 }
    ti.setAttribute('value', 'js')
    expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
      expect.anything(),
      'setTextAndSelection',
      [7, 'js', -1, -1],
    )
  })

  it('TextInput: matching text → no command', () => {
    const doc = createDoc()
    const ti = doc.createElement('TextInput')
    getFabricNode(internal(doc.body), ti);
    ;(nativeFabricUIManager.dispatchCommand as unknown as { mockClear: () => void }).mockClear()
    ;(ti as unknown as TextInputInternal).__RN_textInputState = { nativeText: 'same', eventCount: 1 }
    ti.setAttribute('value', 'same')
    expect(nativeFabricUIManager.dispatchCommand).not.toHaveBeenCalled()
  })

  it('Switch: JS value diverging from native → setValue command', () => {
    const doc = createDoc()
    const sw = doc.createElement('Switch')
    getFabricNode(internal(doc.body), sw);
    ;(nativeFabricUIManager.dispatchCommand as unknown as { mockClear: () => void }).mockClear()
    ;(sw as unknown as SwitchInternal).__RN_switchNativeValue = true
    sw.setAttribute('value', false)
    // iOS platform in tests → 'setValue'
    expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
      expect.anything(),
      'setValue',
      [false],
    )
  })

  it('Switch: android JS value diverging → setNativeValue command', () => {
    withAndroid(() => {
      const doc = createDoc()
      const sw = doc.createElement('Switch')
      getFabricNode(internal(doc.body), sw)
      ;(nativeFabricUIManager.dispatchCommand as unknown as { mockClear: () => void }).mockClear()
      ;(sw as unknown as SwitchInternal).__RN_switchNativeValue = true
      sw.setAttribute('value', false)
      // android platform → 'setNativeValue'
      expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
        expect.anything(),
        'setNativeValue',
        [false],
      )
    })
  })
})

// ── ScrollView sticky header(事件驱动,无 Animated)───────────────

describe('ScrollView sticky header', () => {
  /** Sticky wrapper 内部字段访问。 */
  interface StickyEntry {
    wrapper: unknown
    tag: number
    child: unknown
    lastTranslateY: number | null
    layoutY: number
    layoutHeight: number
  }
  interface ScrollViewSticky extends ScrollViewInternal {
    __RN_stickyWrappers: Map<number, StickyEntry>
    __RN_applySticky(y: number): void
  }

  function buildSticky(indices: number[]) {
    const doc = createDoc()
    const sv = doc.createElement('ScrollView')
    sv.setAttribute('stickyHeaderIndices', indices)
    const a = doc.createElement('View')
    const b = doc.createElement('View')
    sv.appendChild(a)
    sv.appendChild(b)
    doc.body.appendChild(sv)
    submitToRoot(internal(doc.body))
    return { doc, sv: internal(sv) as unknown as ScrollViewSticky, a, b }
  }

  it('sticky child 被内部 wrapper 包裹(collapsable:false + onLayout)', () => {
    const { sv } = buildSticky([0])
    expect(sv.__RN_stickyWrappers.size).toBe(1)
    const entry = sv.__RN_stickyWrappers.get(0)!
    // mock fabric 节点结构:{ viewName, props, children }
    const w = entry.wrapper as { viewName: string; props: Record<string, unknown>; children: unknown[] }
    expect(w.viewName).toBe('RCTView')
    expect(w.props.collapsable).toBe(false)
    expect(w.props.onLayout).toBe(true)
    // wrapper 内含 child a 的 fabric;b 直接挂在 content container。
    expect(w.children.length).toBe(1)
  })

  it('sticky index 变化时清理旧 wrapper', () => {
    const doc = createDoc()
    const sv = doc.createElement('ScrollView')
    sv.setAttribute('stickyHeaderIndices', [0])
    const a = doc.createElement('View')
    const b = doc.createElement('View')
    sv.appendChild(a)
    sv.appendChild(b)
    doc.body.appendChild(sv)
    submitToRoot(internal(doc.body))
    const sticky = internal(sv) as unknown as ScrollViewSticky
    expect(sticky.__RN_stickyWrappers.size).toBe(1)
    // 改为 index 1 → 旧 wrapper 清理,新 wrapper 建在 b 上。
    sv.setAttribute('stickyHeaderIndices', [1])
    getFabricNode(internal(doc.body), sv)
    expect(sticky.__RN_stickyWrappers.size).toBe(1)
    expect(sticky.__RN_stickyWrappers.has(1)).toBe(true)
    expect(sticky.__RN_stickyWrappers.has(0)).toBe(false)
  })

  it('__RN_applySticky:translateY = clamp(scrollY - layoutY, 0, ∞)', () => {
    const { sv } = buildSticky([0])
    const entry = sv.__RN_stickyWrappers.get(0)!
    entry.layoutY = 100
    entry.layoutHeight = 40
    ;(nativeFabricUIManager.setNativeProps as unknown as { mockClear: () => void }).mockClear()
    // 滚动 200 → 位移 100;未到 layoutY 前不动;反向为 0。
    sv.__RN_applySticky(200)
    expect(nativeFabricUIManager.setNativeProps).toHaveBeenCalledWith(
      entry.wrapper,
      { style: [{ transform: [{ translateY: 100 }] }] },
    )
    sv.__RN_applySticky(50)
    expect(nativeFabricUIManager.setNativeProps).toHaveBeenLastCalledWith(
      entry.wrapper,
      { style: [{ transform: [{ translateY: 0 }] }] },
    )
  })

  it('__RN_applySticky:链式碰撞(next header 顶 - 本 header 高)截断', () => {
    const { sv } = buildSticky([0, 1])
    const e0 = sv.__RN_stickyWrappers.get(0)!
    const e1 = sv.__RN_stickyWrappers.get(1)!
    e0.layoutY = 100
    e0.layoutHeight = 50
    e1.layoutY = 300
    e1.layoutHeight = 40
    ;(nativeFabricUIManager.setNativeProps as unknown as { mockClear: () => void }).mockClear()
    // 碰撞点 = 300 - 50 = 250 → translateY max = 250 - 100 = 150。
    sv.__RN_applySticky(500)
    expect(nativeFabricUIManager.setNativeProps).toHaveBeenCalledWith(
      e0.wrapper,
      { style: [{ transform: [{ translateY: 150 }] }] },
    )
  })
})

// ── ProgressBarAndroid / RefreshControl / DrawerLayoutAndroid ────────

describe('ProgressBarAndroid (ProgressBarAndroid.android.js)', () => {
  it('默认 styleAttr=Normal / indeterminate=true / animating=true', () => {
    const out = withAndroid(() => normalize('ProgressBarAndroid', {}))
    expect(out.styleAttr).toBe('Normal')
    expect(out.indeterminate).toBe(true)
    expect(out.animating).toBe(true)
  })

  it('显式值保留', () => {
    const out = withAndroid(() =>
      normalize('ProgressBarAndroid', { styleAttr: 'Horizontal', indeterminate: false, animating: false }),
    )
    expect(out.styleAttr).toBe('Horizontal')
    expect(out.indeterminate).toBe(false)
    expect(out.animating).toBe(false)
  })
})

describe('RefreshControl (RefreshControl.js)', () => {
  it('ios:剔除 Android 专属 + progressViewOffset 默认 0', () => {
    const out = normalize('RefreshControl', {
      refreshing: true, enabled: false, colors: ['red'], progressBackgroundColor: '#fff', size: 'large',
    })
    expect(out.refreshing).toBe(true)
    expect(out.enabled).toBeUndefined()
    expect(out.colors).toBeUndefined()
    expect(out.progressBackgroundColor).toBeUndefined()
    expect(out.size).toBeUndefined()
    expect(out.progressViewOffset).toBe(0)
  })

  it('android:剔除 iOS 专属 + enabled/size 默认', () => {
    const out = withAndroid(() => normalize('RefreshControl', {
      refreshing: true, tintColor: 'red', titleColor: 'blue', title: 'x',
    }))
    expect(out.tintColor).toBeUndefined()
    expect(out.titleColor).toBeUndefined()
    expect(out.title).toBeUndefined()
    expect(out.enabled).toBe(true)
    expect(out.size).toBe('default')
    expect(out.progressViewOffset).toBe(0)
  })
})

describe('DrawerLayoutAndroid (DrawerLayoutAndroid.android.js)', () => {
  it('默认值:drawerBackgroundColor=white / keyboardDismissMode=none / drawerPosition=left / drawerLockMode=unlocked', () => {
    const out = withAndroid(() => normalize('DrawerLayoutAndroid', {}))
    expect(out.drawerBackgroundColor).toBe('white')
    expect(out.keyboardDismissMode).toBe('none')
    expect(out.drawerPosition).toBe('left')
    expect(out.drawerLockMode).toBe('unlocked')
    // RN base style {flex:1, elevation:16} 在前。
    expect(out.style).toEqual([{ flex: 1, elevation: 16 }])
  })

  it('用户 style 追加在 base 之后', () => {
    const out = withAndroid(() => normalize('DrawerLayoutAndroid', { style: { backgroundColor: '#f00' } }))
    expect(out.style).toEqual([{ flex: 1, elevation: 16 }, { backgroundColor: '#f00' }])
  })

  it('挂载:children[0] 进抽屉 wrapper,其余进主内容 wrapper', () => {
    const doc = createDoc()
    const drawer = doc.createElement('DrawerLayoutAndroid')
    drawer.setAttribute('drawerWidth', 300)
    const nav = doc.createElement('View')
    const main = doc.createElement('View')
    drawer.appendChild(nav)
    drawer.appendChild(main)
    doc.body.appendChild(drawer)
    submitToRoot(internal(doc.body))
    const d = internal(drawer) as unknown as {
      __RN_drawerViewChildren: unknown[]
      __RN_drawerMainChildren: unknown[]
      __RN_drawerViewFabric: { props: Record<string, unknown> } | null
    }
    // drawer wrapper 含 nav 的 fabric;main wrapper 含 main 的 fabric。
    expect(d.__RN_drawerViewChildren?.length).toBe(1)
    expect(d.__RN_drawerMainChildren?.length).toBe(1)
    // 抽屉 wrapper 带 pointerEvents=none(初始关闭)。
    expect(d.__RN_drawerViewFabric?.props.pointerEvents).toBe('none')
  })
})

describe('dataset (DOMStringMap)', () => {
  it('读:data-* 属性映射为 camelCase dataset key', () => {
    const el = createElement('View')
    el.setAttribute('data-user-id', '5')
    el.setAttribute('data-foo-bar', 'x')
    expect(el.dataset.userId).toBe('5')
    expect(el.dataset.fooBar).toBe('x')
    expect(el.dataset.nope).toBeUndefined()
  })

  it('写:dataset key 反向映射为 data-* 属性(走 setAttribute)', () => {
    const el = createElement('View')
    el.dataset.userId = '7'
    el.dataset.myDataPoint = '42'
    expect(el.getAttribute('data-user-id')).toBe('7')
    expect(el.getAttribute('data-my-data-point')).toBe('42')
    expect(internal(el).__RN_currentProps['data-user-id']).toBe('7')
  })

  it('删:delete dataset key → removeAttribute', () => {
    const el = createElement('View')
    el.setAttribute('data-user-id', '5')
    expect(el.dataset.userId).toBe('5')
    delete el.dataset.userId
    expect(el.hasAttribute('data-user-id')).toBe(false)
    expect(el.dataset.userId).toBeUndefined()
  })

  it('in 运算符反映存在性', () => {
    const el = createElement('View')
    el.setAttribute('data-active', true)
    expect('active' in el.dataset).toBe(true)
    expect('missing' in el.dataset).toBe(false)
  })

  it('ownKeys/Object.keys 只含 data-*', () => {
    const el = createElement('View')
    el.setAttribute('data-a', '1')
    el.setAttribute('data-b-c', '2')
    el.setAttribute('numberOfLines', 3) // 非 data-* 不应出现在 dataset
    expect(Object.keys(el.dataset).sort()).toEqual(['a', 'bC'])
  })

  it('活对象:同一次访问返回同一引用', () => {
    const el = createElement('View')
    expect(el.dataset).toBe(el.dataset)
  })
})

describe('__RN_normalizeProps — ActivityIndicator (ActivityIndicator.js)', () => {
  it('外层容器:居中 base style + 用户 style(styles.container)', () => {
    const out = normalize('ActivityIndicator', { style: { width: 60 } })
    expect(out.style).toEqual([
      { alignItems: 'center', justifyContent: 'center' },
      { width: 60 },
    ])
  })

  it('外层容器:无 style 时 base 在前', () => {
    expect(normalize('ActivityIndicator', {}).style).toEqual([
      { alignItems: 'center', justifyContent: 'center' },
      undefined,
    ])
  })

  it('iOS spinner:默认 animating/hidesWhenStopped/size=small/color=#999999 + 20×20', () => {
    const doc = createDoc()
    const ai = doc.createElement('ActivityIndicator')
    getFabricNode(internal(doc.body), ai)
    const views = nativeFabricUIManager.createNode.mock.calls as unknown as Array<[number, string, number, Record<string, unknown>]>
    const spinner = views.find(c => c[1] === 'RCTActivityIndicatorView')
    expect(spinner).toBeTruthy()
    expect(spinner![3]).toMatchObject({
      animating: true,
      hidesWhenStopped: true,
      size: 'small',
      color: '#999999', // RN GRAY: iOS 默认 #999999
      style: [{ width: 20, height: 20 }],
    })
  })

  it('iOS spinner:显式 animating=false + color + size=large → 36×36', () => {
    const doc = createDoc()
    const ai = doc.createElement('ActivityIndicator')
    ai.setAttribute('animating', false)
    ai.setAttribute('color', '#f00')
    ai.setAttribute('size', 'large')
    getFabricNode(internal(doc.body), ai)
    const views = nativeFabricUIManager.createNode.mock.calls as unknown as Array<[number, string, number, Record<string, unknown>]>
    const spinner = views.find(c => c[1] === 'RCTActivityIndicatorView')
    expect(spinner![3]).toMatchObject({
      animating: false,
      size: 'large',
      color: '#f00',
      style: [{ width: 36, height: 36 }],
    })
  })

  it('iOS spinner:size 数字 → N×N 定尺寸(⚠️ rn-dom 也把数字传 size,RN 传 sizeProp undefined)', () => {
    const doc = createDoc()
    const ai = doc.createElement('ActivityIndicator')
    ai.setAttribute('size', 24)
    getFabricNode(internal(doc.body), ai)
    const views = nativeFabricUIManager.createNode.mock.calls as unknown as Array<[number, string, number, Record<string, unknown>]>
    const spinner = views.find(c => c[1] === 'RCTActivityIndicatorView')
    expect(spinner![3].style).toEqual([{ width: 24, height: 24 }])
    // RN:size 数字时 sizeProp=undefined(style 定尺寸);rn-dom 把 24 也传给了原生 size。
    expect(spinner![3].size).toBe(24)
  })

  it('android spinner:AndroidProgressBar + styleAttr=Normal + indeterminate=true', () => {
    withAndroid(() => {
      const doc = createDoc()
      const ai = doc.createElement('ActivityIndicator')
      getFabricNode(internal(doc.body), ai)
      const views = nativeFabricUIManager.createNode.mock.calls as unknown as Array<[number, string, number, Record<string, unknown>]>
      const spinner = views.find(c => c[1] === 'AndroidProgressBar')
      expect(spinner).toBeTruthy()
      expect(spinner![3]).toMatchObject({
        animating: true,
        styleAttr: 'Normal',
        indeterminate: true,
        size: 'small',
      })
    })
  })

  it('android spinner:显式 size + animating 透传', () => {
    withAndroid(() => {
      const doc = createDoc()
      const ai = doc.createElement('ActivityIndicator')
      ai.setAttribute('size', 'large')
      ai.setAttribute('animating', false)
      getFabricNode(internal(doc.body), ai)
      const views = nativeFabricUIManager.createNode.mock.calls as unknown as Array<[number, string, number, Record<string, unknown>]>
      const spinner = views.find(c => c[1] === 'AndroidProgressBar')
      expect(spinner![3]).toMatchObject({ size: 'large', animating: false, styleAttr: 'Normal', indeterminate: true })
      expect(spinner![3].style).toEqual([{ width: 36, height: 36 }])
    })
  })
})

describe('applyAria (shared.ts) — aria-* → accessibility (RN View.js 默认 JS 转换)', () => {
  it('aria-busy/checked/disabled/expanded/selected → accessibilityState merge', () => {
    const out = applyAria({ 'aria-busy': true, 'aria-checked': false, 'aria-disabled': true })
    expect(out.accessibilityState).toEqual({
      busy: true, checked: false, disabled: true, expanded: undefined, selected: undefined,
    })
    // 已有 accessibilityState 字段保留(merge)。
    const merge = applyAria({ 'aria-expanded': true, accessibilityState: { selected: true } })
    expect(merge.accessibilityState).toEqual({
      busy: undefined, checked: undefined, disabled: undefined, expanded: true, selected: true,
    })
  })

  it('aria-labelledby 逗号拆数组 → accessibilityLabelledBy', () => {
    expect(applyAria({ 'aria-labelledby': 'a, b' }).accessibilityLabelledBy).toEqual(['a', 'b'])
  })

  it('aria-live → accessibilityLiveRegion(off→none)', () => {
    expect(applyAria({ 'aria-live': 'off' }).accessibilityLiveRegion).toBe('none')
    expect(applyAria({ 'aria-live': 'polite' }).accessibilityLiveRegion).toBe('polite')
  })

  it('aria-valuemax/min/now/text → accessibilityValue', () => {
    const out = applyAria({ 'aria-valuemax': 10, 'aria-valuemin': 0, 'aria-valuenow': 5, 'aria-valuetext': '5' })
    expect(out.accessibilityValue).toEqual({ max: 10, min: 0, now: 5, text: '5' })
    // 已有 accessibilityValue 字段保留(merge)。
    const merge = applyAria({ 'aria-valuenow': 7, accessibilityValue: { max: 100, min: 0, now: 1, text: 'x' } })
    expect(merge.accessibilityValue).toEqual({ max: 100, min: 0, now: 7, text: 'x' })
  })

  it('aria-hidden → accessibilityElementsHidden + importantForAccessibility(no-hide-descendants)', () => {
    const out = applyAria({ 'aria-hidden': true })
    expect(out.accessibilityElementsHidden).toBe(true)
    expect(out.importantForAccessibility).toBe('no-hide-descendants')
    // aria-hidden=false 不设 importantForAccessibility。
    expect(applyAria({ 'aria-hidden': false }).importantForAccessibility).toBeUndefined()
  })

  it('tabIndex → focusable', () => {
    expect(applyAria({ tabIndex: 0 }).focusable).toBe(true)
    expect(applyAria({ tabIndex: -1 }).focusable).toBe(false)
  })

  it('id → nativeID', () => {
    expect(applyAria({ id: 'x' }).nativeID).toBe('x')
  })
})
