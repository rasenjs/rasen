/**
 * JSX runtime entry for @rasenjs/react-native — TYPES ONLY (a hand-written
 * `.d.ts`).
 *
 * Rasen compiles JSX away, so no `jsx()` call exists in a working build; this
 * module only has to resolve for `jsxImportSource` type checking and carry the
 * RN tag typings below.
 *
 * Use as `jsxImportSource` in tsconfig.json:
 *
 * ```json
 * { "jsxImportSource": "@rasenjs/react-native" }
 * ```
 */
import type {
  JSXElement,
  JSXElementChildrenAttribute,
  JSXIntrinsicAttributes,
} from '@rasenjs/core'
import type { RNElementPropMap } from '@rasenjs/rn-dom/elements'

export declare function jsx(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string
): JSXElement

export declare function jsxs(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string
): JSXElement

export declare function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string
): JSXElement

/** Binds to `@rasenjs/react-native`'s root `Fragment` export. */
export declare const Fragment: (
  props: { children?: unknown },
) => JSXElement

/** JSX tag name → native component name mapping */
interface RNComponentNameMap {
  view: 'View'
  text: 'Text'
  image: 'Image'
  textInput: 'TextInput'
  scrollView: 'ScrollView'
  activityIndicator: 'ActivityIndicator'
  switch: 'Switch'
  modal: 'Modal'
  refreshControl: 'RefreshControl'
  drawerLayoutAndroid: 'DrawerLayoutAndroid'
  progressBarAndroid: 'ProgressBarAndroid'
}

// Composite JS components (typed via their own prop interfaces). `./index`
// resolves in both layouts: `src/index.ts` while developing, `dist/index.d.ts`
// in a published tree (there is no `dist/components`).
interface RNComponentProps {
  pressable: import('./index').PressableProps
  button: import('./index').ButtonProps
  touchableOpacity: import('./index').TouchableOpacityProps
  touchableHighlight: import('./index').TouchableHighlightProps
  touchableWithoutFeedback: import('./index').TouchableWithoutFeedbackProps
  safeAreaView: import('./index').SafeAreaViewProps
  imageBackground: import('./index').ImageBackgroundProps
  keyboardAvoidingView: import('./index').KeyboardAvoidingViewProps
  statusBar: import('./index').StatusBarProps
  flatList: import('./index').FlatListProps<object>
}

export namespace JSX {
  type IntrinsicElementProps<K extends keyof RNComponentNameMap> =
    RNElementPropMap[RNComponentNameMap[K]]

  export type IntrinsicElements = {
    [K in keyof RNComponentNameMap]: IntrinsicElementProps<K>
  } & {
    [K in keyof RNComponentProps]: RNComponentProps[K]
  } & {
    [tag: string]: Record<string, unknown>
  }
  export type Element = JSXElement
  export interface ElementChildrenAttribute extends JSXElementChildrenAttribute {}
  export interface IntrinsicAttributes extends JSXIntrinsicAttributes {}
}
