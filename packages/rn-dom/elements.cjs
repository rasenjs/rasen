/**
 * @rasenjs/rn-dom — Elements: Runtime tag list + Fabric View Config Auto-Registration
 *
 * This file is the single runtime entry for `@rasenjs/rn-dom/elements`.
 * Not processed by tsup — Metro statically traces all literal require() calls.
 *
 * 职责(收缩后):
 *  - RN_BUILT_IN_TAGS / getAllTags:tag 表(纯数据,Vue SFC transformer 用)
 *  - isPlatformAmbiguous:平台二义组件
 *  - ensure():tag → Fabric 原生名 + 懒 require 注册(副作用,Metro 静态追踪)
 *
 * 原 normalizeProps(RN JS 层 prop 转换)已迁移至主模块 src/elements/* ——
 * 各标签节点类 override RNNode.normalizeProps()(见 src/elements/registry.ts)。
 *
 * At RUNTIME the require() calls inside ensure() only execute on first use
 * of each component. RN_BUILT_IN_TAGS / isRNBuiltIn / getAllTags /
 * isPlatformAmbiguous are pure — no side effects.
 */

'use strict'

// ── Runtime tag list (used by Vue SFC transformer) ───────────────────

/** All known React Native built-in element tag names. */
var RN_BUILT_IN_TAGS = [
  'View', 'SafeAreaView',
  'Text',
  'Image',
  'TextInput', 'AndroidTextInput',
  'ScrollView', 'AndroidHorizontalScrollView',
  'ActivityIndicator', 'ProgressBarAndroid',
  'Switch', 'AndroidSwitch',
  'RefreshControl', 'AndroidSwipeRefreshLayout',
  'Modal',
  'DrawerLayoutAndroid',
  'DebuggingOverlay',
  // Press-touchable tags are JS-only in RN (they render a View + Pressability);
  // here they resolve to the plain RCTView and the press series is synthesized
  // by rn-dom's event system (drivePress), matching RN's Pressable semantics.
  'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
  // TouchableNativeFeedback:RN Android 走 TouchableNativeFeedback(ripple 需要
  // 原生 drawable,rn-dom 不支持 ripple,作为 RCTView + press 合成;iOS 同
  // TouchableOpacity)。
  'TouchableNativeFeedback',
  // InputAccessoryView:iOS 专属(RCTInputAccessoryView)。Android 渲染 null。
  'InputAccessoryView',
]

var TAG_SET = new Set(RN_BUILT_IN_TAGS)

/** Check if a tag is a known RN built-in. */
function isRNBuiltIn(tag) {
  return TAG_SET.has(tag)
}

/** Get all known RN tag names. */
function getAllTags() {
  return [...TAG_SET]
}

// ── Platform-ambiguous components ────────────────────────────────────

/**
 * Components whose JS codegen name is registered but whose native ViewManager
 * name differs per platform. They must resolve via ensure() (which branches
 * on Platform.OS) — resolving as-is yields a name (e.g. 'Switch', 'TextInput',
 * 'ActivityIndicator') that doesn't exist in the target platform's
 * ViewManagerRegistry (Android uses AndroidSwitch, AndroidTextInput,
 * AndroidProgressBar).
 */
var PLATFORM_AMBIGUOUS_TAGS = ['Switch', 'TextInput', 'ActivityIndicator']

/** Check if a tag resolves to different native names per platform. */
function isPlatformAmbiguous(tag) {
  return PLATFORM_AMBIGUOUS_TAGS.indexOf(tag) !== -1
}

// ── Lazy Fabric View Config Registration ─────────────────────────────

/**
 * Ensure the Fabric view config for `tagName` is registered,
 * and return the Fabric-native name for it.
 *
 * Safe to call multiple times — the config registry deduplicates.
 *
 * @param {string} tagName
 * @param {boolean} [isAndroid] - Hint for platform-ambiguous components
 * @returns {string|undefined} Fabric uiViewClassName, or undefined if unknown
 */
function ensure(tagName, isAndroid) {
  switch (tagName) {
    case 'View':
      require('react-native/Libraries/Components/View/ViewNativeComponent')
      return 'RCTView'
    case 'Text':
      require('react-native/Libraries/Text/TextNativeComponent')
      return 'RCTText'
    case 'Image':
      require('react-native/Libraries/Image/ImageViewNativeComponent')
      return 'RCTImageView'
    case 'ScrollView':
      require('react-native/Libraries/Components/ScrollView/ScrollViewNativeComponent')
      return 'RCTScrollView'
    case 'TextInput':
      // Android and iOS use different native classes for TextInput.
      // Caller passes isAndroid from Platform.OS (which is available
      // only from react-native, not from this pure CJS file).
      if (isAndroid) {
        require('react-native/Libraries/Components/TextInput/AndroidTextInputNativeComponent')
        return 'AndroidTextInput'
      }
      require('react-native/Libraries/Components/TextInput/RCTSingelineTextInputNativeComponent')
      require('react-native/Libraries/Components/TextInput/RCTMultilineTextInputNativeComponent')
      return 'RCTSinglelineTextInputView'
    case 'Switch':
      // Android registers the switch under 'AndroidSwitch', iOS under 'RCTSwitch'.
      if (isAndroid) {
        require('react-native/Libraries/Components/Switch/AndroidSwitchNativeComponent')
        return 'AndroidSwitch'
      }
      require('react-native/Libraries/Components/Switch/SwitchNativeComponent')
      // codegen: 'Switch' with paperComponentName 'RCTSwitch' → registered as RCTSwitch
      return 'RCTSwitch'
    case 'ActivityIndicator':
      // Android renders ActivityIndicator via ProgressBarAndroid (AndroidProgressBar).
      if (isAndroid) {
        require('react-native/Libraries/Components/ProgressBarAndroid/ProgressBarAndroidNativeComponent')
        return 'AndroidProgressBar'
      }
      require('react-native/Libraries/Components/ActivityIndicator/ActivityIndicatorViewNativeComponent')
      // codegen: 'RCTActivityIndicatorView' → registered as RCTActivityIndicatorView
      return 'RCTActivityIndicatorView'
    case 'ProgressBarAndroid':
      require('react-native/Libraries/Components/ProgressBarAndroid/ProgressBarAndroidNativeComponent')
      return 'AndroidProgressBar'
    case 'DebuggingOverlay':
      require('react-native/Libraries/Debugging/DebuggingOverlayNativeComponent')
      return 'DebuggingOverlay'
    case 'SafeAreaView':
      require('react-native/Libraries/Components/SafeAreaView/RCTSafeAreaViewNativeComponent')
      // codegen: 'RCTSafeAreaView' → registered as RCTSafeAreaView
      return 'RCTSafeAreaView'
    case 'AndroidHorizontalScrollView':
      require('react-native/Libraries/Components/ScrollView/AndroidHorizontalScrollViewNativeComponent')
      return 'AndroidHorizontalScrollView'
    case 'AndroidSwitch':
      require('react-native/Libraries/Components/Switch/AndroidSwitchNativeComponent')
      return 'AndroidSwitch'
    // Press-touchable components render a plain View in RN (Pressable →
    // <View collapsable={false}> + Pressability). Press synthesis lives in
    // rn-dom's event system, so the native host is just RCTView.
    case 'Pressable':
    case 'TouchableOpacity':
    case 'TouchableHighlight':
    case 'TouchableWithoutFeedback':
    case 'TouchableNativeFeedback':
      require('react-native/Libraries/Components/View/ViewNativeComponent')
      return 'RCTView'
    case 'RefreshControl':
      require('react-native/Libraries/Components/RefreshControl/PullToRefreshViewNativeComponent')
      // codegen: 'PullToRefreshView' with paperComponentName 'RCTRefreshControl' → RCTRefreshControl
      return 'RCTRefreshControl'
    case 'AndroidSwipeRefreshLayout':
      require('react-native/Libraries/Components/RefreshControl/AndroidSwipeRefreshLayoutNativeComponent')
      return 'AndroidSwipeRefreshLayout'
    case 'Modal':
    case 'RCTModalHostView':
      require('react-native/Libraries/Modal/RCTModalHostViewNativeComponent')
      // JS viewConfigRegistry 注册名是 'RCTModalHostView'(requireNativeComponent
      // 用 paper 名);但 Fabric createNode 需要 C++ registry 名 'ModalHostView'
      // (codegen 名)。因此这里返回 viewConfig 名,RNModalElement 的
      // __RN_resolveNativeName() hook 再映射成 'ModalHostView'。
      return 'RCTModalHostView'
    case 'DrawerLayoutAndroid':
      require('react-native/Libraries/Components/DrawerAndroid/AndroidDrawerLayoutNativeComponent')
      return 'AndroidDrawerLayout'
    case 'InputAccessoryView':
      // iOS 专属;Android 下 RN 渲染 null(无 ViewManager)。
      if (isAndroid) return undefined
      require('react-native/Libraries/Components/TextInput/RCTInputAccessoryViewNativeComponent')
      return 'RCTInputAccessoryView'
  }
}

module.exports = { ensure, isPlatformAmbiguous, RN_BUILT_IN_TAGS, isRNBuiltIn, getAllTags }
