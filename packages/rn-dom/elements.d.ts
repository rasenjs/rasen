/**
 * @rasenjs/rn-dom — Elements: Types + Runtime + Auto-Registration
 *
 * Single `.d.ts` for `@rasenjs/rn-dom/elements`.
 * Covers type declarations, runtime exports, and `ensure()`.
 */

// ── Type declarations ───────────────────────────────────────────────

import type {
  ViewStyle,
  ViewProps,
  TextProps,
  ImageProps,
  TextInputProps,
  ScrollViewProps,
  ActivityIndicatorProps,
  ProgressBarAndroidProps,
  SwitchProps,
  RefreshControlProps,
  ModalProps,
  DrawerLayoutAndroidProps,
} from 'react-native'

export interface RNEvent {
  nativeEvent: Record<string, unknown>
}

export type RNStyle = ViewStyle

export interface RNElementPropMap {
  View: ViewProps
  SafeAreaView: ViewProps
  Text: TextProps
  Image: ImageProps
  TextInput: TextInputProps
  AndroidTextInput: TextInputProps
  ScrollView: ScrollViewProps
  AndroidHorizontalScrollView: ScrollViewProps
  ActivityIndicator: ActivityIndicatorProps
  ProgressBarAndroid: ProgressBarAndroidProps
  Switch: SwitchProps
  AndroidSwitch: SwitchProps
  RefreshControl: RefreshControlProps
  AndroidSwipeRefreshLayout: RefreshControlProps
  Modal: ModalProps
  DrawerLayoutAndroid: DrawerLayoutAndroidProps
  DebuggingOverlay: {
    testID?: string
    key?: string | number
  }
}

export type ElementProps<T extends keyof RNElementPropMap> = RNElementPropMap[T]

export type RNElementPropName = {
  [K in keyof RNElementPropMap[keyof RNElementPropMap]]: K
}[keyof RNElementPropMap[keyof RNElementPropMap]] & string

// ── Runtime values ──────────────────────────────────────────────────

export const RN_BUILT_IN_TAGS: (keyof RNElementPropMap)[]

export function isRNBuiltIn(tag: string): boolean

export function getAllTags(): string[]

// ── Lazy Fabric View Config Registration ─────────────────────────────

export function ensure(tagName: string, isAndroid?: boolean): string | undefined
