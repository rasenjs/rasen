/**
 * JSX runtime entry for @rasenjs/react-native
 *
 * Configured with RN Fabric intrinsic elements as lowercase JSX tags.
 * Use as `jsxImportSource` in tsconfig.json:
 *
 * ```json
 * { "jsxImportSource": "@rasenjs/react-native" }
 * ```
 */
import { jsx, jsxs, Fragment, configureTags, type TagComponent } from '@rasenjs/core'
import type { Mountable } from '@rasenjs/core'
import type { RNElementPropMap } from '@rasenjs/rn-dom/elements'
import * as tags from './components'

configureTags({ '': tags as unknown as Record<string, TagComponent> })

export { jsx, jsxs, jsx as jsxDEV, Fragment }

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

// Composite JS components (typed via their own prop interfaces).
interface RNComponentProps {
  pressable: import('./components/Pressable').PressableProps
  button: import('./components/Button').ButtonProps
  touchableOpacity: import('./components/TouchableOpacity').TouchableOpacityProps
  touchableHighlight: import('./components/TouchableHighlight').TouchableHighlightProps
  touchableWithoutFeedback: import('./components/TouchableWithoutFeedback').TouchableWithoutFeedbackProps
  safeAreaView: import('./components/SafeAreaView').SafeAreaViewProps
  imageBackground: import('./components/ImageBackground').ImageBackgroundProps
  keyboardAvoidingView: import('./components/KeyboardAvoidingView').KeyboardAvoidingViewProps
  statusBar: import('./components/StatusBar').StatusBarProps
  flatList: import('./components/FlatList').FlatListProps<object>
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Element = Mountable<any>
  export interface ElementChildrenAttribute { children: unknown }
  export interface IntrinsicAttributes { key?: string | number }
}
