/**
 * @rasenjs/rn-dom — Elements: Runtime tag list + Fabric View Config Auto-Registration
 *
 * This file is the single runtime entry for `@rasenjs/rn-dom/elements`.
 * Not processed by tsup — Metro statically traces all literal require() calls.
 *
 * It is the SINGLE home for per-component native adaptation:
 *  - tag → Fabric native name + lazy registration (ensure)
 *  - platform-ambiguous components (isPlatformAmbiguous)
 *  - component prop normalization replicating RN's JS-layer transforms
 *    (normalizeProps) — logic that lives OUTSIDE viewConfig.validAttributes.
 *
 * At RUNTIME the require() calls inside ensure() only execute on first use
 * of each component. RN_BUILT_IN_TAGS / isRNBuiltIn / getAllTags /
 * isPlatformAmbiguous / normalizeProps are pure — no side effects.
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

// ── Component prop normalization (RN JS-layer transforms) ────────────

/**
 * Normalize props before sending to Fabric, replicating the transforms RN's
 * JS-layer components (Image.android.js, Image.ios.js, ActivityIndicator.js,
 * …) apply in render() — logic that lives OUTSIDE viewConfig.validAttributes
 * and is therefore NOT covered by createAttributePayload/diffAttributePayloads.
 *
 * Returns a new props object only when a transform applies; otherwise returns
 * the input unchanged.
 *
 * @param {string} tagName
 * @param {Record<string, unknown>} props
 * @param {boolean} [isAndroid] - Platform hint (ActivityIndicator/TextInput
 *   etc. resolve to different native views per platform).
 * @returns {Record<string, unknown>}
 */
function normalizeProps(tagName, props, isAndroid) {
  if (props == null) return props
  if (tagName === 'Image') {
    // RN always sends Image source as an array `[{ uri, ... }]`:
    //   - string (common misuse) → `[{ uri }]`
    //   - object (e.g. `{ uri }`) → `[object]`
    //   - array → kept as-is (already standard)
    //   - number (require() asset id) / null → kept as-is
    // Android Fabric's ImageViewManager expects a ReadableArray; passing a
    // raw string/object throws a cast exception in native.
    var source = props.source
    if (source != null && typeof source === 'string') {
      return Object.assign({}, props, { source: [{ uri: source }] })
    }
    if (source != null && typeof source === 'object' && !Array.isArray(source)) {
      return Object.assign({}, props, { source: [source] })
    }
  }
  if (tagName === 'ActivityIndicator' && isAndroid) {
    // RN's ActivityIndicator renders ProgressBarAndroid on Android and ALWAYS
    // injects `styleAttr: 'Normal'` + `indeterminate: true` (ActivityIndicator.js
    // androidProps), plus an EXPLICIT size style (sizeSmall 20x20 / sizeLarge
    // 36x36 / number → NxN). The explicit size matters: without it, Yoga calls
    // the native intrinsic measure, and RN 0.86's ReactProgressBarViewManager.
    // measure does a non-null assertion on localData → NPE when localData is
    // null (before mount). With fixed dimensions Yoga never intrinsic-measures.
    var size = props.size
    var sizeStyle = null
    if (size === 'small') sizeStyle = { width: 20, height: 20 }
    else if (size === 'large') sizeStyle = { width: 36, height: 36 }
    else if (typeof size === 'number') sizeStyle = { width: size, height: size }
    return Object.assign({}, props, {
      styleAttr: 'Normal',
      indeterminate: true,
      style: sizeStyle ? [props.style, sizeStyle] : props.style,
    })
  }
  return props
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

module.exports = { ensure, normalizeProps, isPlatformAmbiguous, RN_BUILT_IN_TAGS, isRNBuiltIn, getAllTags }
