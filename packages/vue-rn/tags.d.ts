/**
 * @rasenjs/vue-rn — RN Built-in Tag Type Declarations for Vue Templates
 *
 * TYPE-ONLY — RN tags are custom elements resolved by rn-dom at runtime.
 * This file is referenced by the project's env.d.ts to enable Volar
 * IntelliSense for RN built-in elements in .vue templates.
 *
 * Usage in env.d.ts:
 *   /// <reference path="node_modules/@rasenjs/vue-rn/tags.d.ts" />
 */

import type { DefineComponent } from 'vue'
import type {
  RNViewProps, RNSafeAreaViewProps, RNTextProps,
  RNImageProps, RNTextInputProps, RNAndroidTextInputProps,
  RNScrollViewProps, RNAndroidHorizontalScrollViewProps,
  RNActivityIndicatorProps, RNProgressBarAndroidProps,
  RNSwitchProps, RNAndroidSwitchProps,
  RNRefreshControlProps, RNAndroidSwipeRefreshLayoutProps,
  RNModalProps, RNDrawerLayoutAndroidProps, RNDebuggingOverlayProps,
} from '@rasenjs/rn-dom'

declare module 'vue' {
  export interface GlobalComponents {
    View: DefineComponent<RNViewProps>
    SafeAreaView: DefineComponent<RNSafeAreaViewProps>
    Text: DefineComponent<RNTextProps>
    Image: DefineComponent<RNImageProps>
    TextInput: DefineComponent<RNTextInputProps>
    AndroidTextInput: DefineComponent<RNAndroidTextInputProps>
    ScrollView: DefineComponent<RNScrollViewProps>
    AndroidHorizontalScrollView: DefineComponent<RNAndroidHorizontalScrollViewProps>
    ActivityIndicator: DefineComponent<RNActivityIndicatorProps>
    ProgressBarAndroid: DefineComponent<RNProgressBarAndroidProps>
    Switch: DefineComponent<RNSwitchProps>
    AndroidSwitch: DefineComponent<RNAndroidSwitchProps>
    RefreshControl: DefineComponent<RNRefreshControlProps>
    AndroidSwipeRefreshLayout: DefineComponent<RNAndroidSwipeRefreshLayoutProps>
    Modal: DefineComponent<RNModalProps>
    DrawerLayoutAndroid: DefineComponent<RNDrawerLayoutAndroidProps>
    DebuggingOverlay: DefineComponent<RNDebuggingOverlayProps>
  }
}
