/**
 * Global JSX type declarations for @rasenjs/react-native.
 *
 * When using `jsxImportSource: "@rasenjs/react-native"` in tsconfig.json,
 * TypeScript resolves the JSX namespace from the package's jsx-runtime entry.
 * This file provides a global fallback so JSX works even without the
 * jsxImportSource setting (e.g. in .tsx files that import components
 * directly).
 *
 * Intrinsic elements are typed via the package's component prop interfaces.
 */

import type { RNElementPropMap } from '@rasenjs/rn-dom/elements'
import type { PressableProps } from './src/components/Pressable'
import type { ButtonProps } from './src/components/Button'
import type { TouchableOpacityProps } from './src/components/TouchableOpacity'
import type { TouchableHighlightProps } from './src/components/TouchableHighlight'
import type { TouchableWithoutFeedbackProps } from './src/components/TouchableWithoutFeedback'
import type { SafeAreaViewProps } from './src/components/SafeAreaView'
import type { ImageBackgroundProps } from './src/components/ImageBackground'
import type { KeyboardAvoidingViewProps } from './src/components/KeyboardAvoidingView'
import type { StatusBarProps } from './src/components/StatusBar'
import type { FlatListProps } from './src/components/FlatList'

declare global {
  namespace JSX {
    interface ElementChildrenAttribute { children: unknown }
    interface IntrinsicAttributes { key?: string | number }

    interface IntrinsicElements {
      // Native tags (typed from RN's prop maps).
      view: RNElementPropMap['View']
      text: RNElementPropMap['Text']
      image: RNElementPropMap['Image']
      textInput: RNElementPropMap['TextInput']
      scrollView: RNElementPropMap['ScrollView']
      activityIndicator: RNElementPropMap['ActivityIndicator']
      switch: RNElementPropMap['Switch']
      modal: RNElementPropMap['Modal']
      refreshControl: RNElementPropMap['RefreshControl']
      drawerLayoutAndroid: RNElementPropMap['DrawerLayoutAndroid']
      progressBarAndroid: RNElementPropMap['ProgressBarAndroid']

      // Composite JS components.
      pressable: PressableProps
      button: ButtonProps
      touchableOpacity: TouchableOpacityProps
      touchableHighlight: TouchableHighlightProps
      touchableWithoutFeedback: TouchableWithoutFeedbackProps
      safeAreaView: SafeAreaViewProps
      imageBackground: ImageBackgroundProps
      keyboardAvoidingView: KeyboardAvoidingViewProps
      statusBar: StatusBarProps
      flatList: FlatListProps<object>

      // Fallback for any other tag.
      [tag: string]: Record<string, unknown>
    }
  }
}

export {}
