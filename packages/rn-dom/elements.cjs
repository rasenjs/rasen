/**
 * @rasenjs/rn-dom — Elements: Runtime tag list + Fabric View Config Auto-Registration
 *
 * This file is the single runtime entry for `@rasenjs/rn-dom/elements`.
 * Not processed by tsup — Metro statically traces all literal require() calls.
 *
 * At RUNTIME the require() calls inside ensure() only execute on first use
 * of each component. RN_BUILT_IN_TAGS / isRNBuiltIn / getAllTags are pure
 * data — no side effects.
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
      require('react-native/Libraries/Components/Switch/SwitchNativeComponent')
      // codegen: 'Switch' with paperComponentName 'RCTSwitch' → registered as RCTSwitch
      return 'RCTSwitch'
    case 'ActivityIndicator':
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
      require('react-native/Libraries/Components/ScrollView/AndroidHorizontalScrollContentViewNativeComponent')
      return 'AndroidHorizontalScrollContentView'
    case 'AndroidSwitch':
      require('react-native/Libraries/Components/Switch/AndroidSwitchNativeComponent')
      return 'AndroidSwitch'
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
      // codegen: 'RCTModalHostView' → registered as RCTModalHostView
      return 'RCTModalHostView'
    case 'DrawerLayoutAndroid':
      require('react-native/Libraries/Components/DrawerAndroid/AndroidDrawerLayoutNativeComponent')
      return 'AndroidDrawerLayout'
  }
}

module.exports = { ensure, RN_BUILT_IN_TAGS, isRNBuiltIn, getAllTags }
