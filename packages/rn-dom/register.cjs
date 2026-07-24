/**
 * @rasenjs/rn-dom — Fabric View Config Auto-Registration
 *
 * Metro statically traces literal `require('...')` calls at BUILD TIME
 * regardless of whether they're inside functions. So all native modules
 * listed below are included in the JS bundle.
 *
 * At RUNTIME the require() calls only execute when ensure(tagName) is
 * called — i.e. when a component of that tag is first created. This
 * gives us lazy registration with eager bundling.
 *
 * Platform-specific modules (Android-only / iOS-only) fail silently
 * on the wrong platform thanks to try/catch at the call site.
 */

'use strict'

/**
 * Ensure the Fabric view config for `tagName` is registered,
 * and return the Fabric-native name for it.
 *
 * Safe to call multiple times — the config registry deduplicates.
 *
 * @param {string} tagName
 * @returns {string|undefined} Fabric uiViewClassName, or undefined if unknown
 */
function ensure(tagName) {
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
      require('react-native/Libraries/Components/TextInput/AndroidTextInputNativeComponent')
      require('react-native/Libraries/Components/TextInput/RCTSingelineTextInputNativeComponent')
      require('react-native/Libraries/Components/TextInput/RCTMultilineTextInputNativeComponent')
      return 'RCTSinglelineTextInputView'
    case 'Switch':
      require('react-native/Libraries/Components/Switch/SwitchNativeComponent')
      return 'Switch'
    case 'ActivityIndicator':
      require('react-native/Libraries/Components/ActivityIndicator/ActivityIndicatorViewNativeComponent')
      return 'ActivityIndicatorView'
    case 'ProgressBarAndroid':
      require('react-native/Libraries/Components/ProgressBarAndroid/ProgressBarAndroidNativeComponent')
      return 'AndroidProgressBar'
    case 'DebuggingOverlay':
      require('react-native/Libraries/Debugging/DebuggingOverlayNativeComponent')
      return 'DebuggingOverlay'
  }
}

module.exports = { ensure }
