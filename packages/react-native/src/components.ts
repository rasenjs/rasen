/**
 * Components for @rasenjs/react-native.
 *
 * Two layers:
 *  - Simple native tags (View, Text, Image, …) are thin typed aliases over
 *    `element(tag, props)` — rn-dom's node classes handle their semantics.
 *  - Composite JS components (Pressable, Button, Touchable*, FlatList, …)
 *    are real implementations that assemble native nodes + press synthesis.
 *
 * Each tag is fully typed using RN's native prop types from
 * `@rasenjs/rn-dom/elements`.
 */

import { tag } from './element'
export type { Child } from './element'

// ── Composite JS components ────────────────────────────────────────────

import { Pressable } from './components/Pressable'
import { Button } from './components/Button'
import { TouchableOpacity } from './components/TouchableOpacity'
import { TouchableHighlight } from './components/TouchableHighlight'
import { TouchableWithoutFeedback } from './components/TouchableWithoutFeedback'
import { SafeAreaView } from './components/SafeAreaView'
import { ImageBackground } from './components/ImageBackground'
import { KeyboardAvoidingView } from './components/KeyboardAvoidingView'
import { StatusBar } from './components/StatusBar'
import { FlatList } from './components/FlatList'

export {
  Pressable,
  Button,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  SafeAreaView,
  ImageBackground,
  KeyboardAvoidingView,
  StatusBar,
  FlatList,
}
export type {
  PressableProps,
  PressableState,
  AccessibilityState,
} from './components/Pressable'
export type { ButtonProps } from './components/Button'
export type { TouchableOpacityProps } from './components/TouchableOpacity'
export type { TouchableHighlightProps } from './components/TouchableHighlight'
export type { TouchableWithoutFeedbackProps } from './components/TouchableWithoutFeedback'
export type { SafeAreaViewProps } from './components/SafeAreaView'
export type { ImageBackgroundProps } from './components/ImageBackground'
export type { KeyboardAvoidingViewProps } from './components/KeyboardAvoidingView'
export type { StatusBarProps } from './components/StatusBar'
export type { FlatListProps, ListRenderItem, ListRenderItemInfo } from './components/FlatList'

// CamelCase aliases (functional API style) for the composite components.
/** @alias Pressable */
export const pressable = Pressable
/** @alias Button */
export const button = Button
/** @alias TouchableOpacity */
export const touchableOpacity = TouchableOpacity
/** @alias TouchableHighlight */
export const touchableHighlight = TouchableHighlight
/** @alias TouchableWithoutFeedback */
export const touchableWithoutFeedback = TouchableWithoutFeedback
/** @alias SafeAreaView */
export const safeAreaView = SafeAreaView
/** @alias ImageBackground */
export const imageBackground = ImageBackground
/** @alias KeyboardAvoidingView */
export const keyboardAvoidingView = KeyboardAvoidingView
/** @alias StatusBar */
export const statusBar = StatusBar
/** @alias FlatList */
export const flatList = FlatList

// ── Built-in RN Tags (thin aliases) ────────────────────────────────────

// CamelCase aliases (functional API style)
/** Container component with Flexbox layout. */
export const view = tag('View')
/** Text display component. */
export const text = tag('Text')
/** Image display component. */
export const image = tag('Image')
/** Text input field. */
export const textInput = tag('TextInput')
/** Scrollable container. */
export const scrollView = tag('ScrollView')
/** Loading indicator. */
export const activityIndicator = tag('ActivityIndicator')
/** Toggle switch. */
export const switch_ = tag('Switch')
/** Modal overlay. */
export const modal = tag('Modal')
/** Pull-to-refresh control. */
export const refreshControl = tag('RefreshControl')
/** Android DrawerLayout. */
export const drawerLayoutAndroid = tag('DrawerLayoutAndroid')
/** Android progress bar. */
export const progressBarAndroid = tag('ProgressBarAndroid')

// PascalCase aliases (JSX style — import as named components)
/** @alias view */
export const View = view
/** @alias text */
export const Text = text
/** @alias image */
export const Image = image
/** @alias textInput */
export const TextInput = textInput
/** @alias scrollView */
export const ScrollView = scrollView
/** @alias activityIndicator */
export const ActivityIndicator = activityIndicator
/** @alias switch_ */
export const Switch = switch_
/** @alias modal */
export const Modal = modal
/** @alias refreshControl */
export const RefreshControl = refreshControl
/** @alias drawerLayoutAndroid */
export const DrawerLayoutAndroid = drawerLayoutAndroid
/** @alias progressBarAndroid */
export const ProgressBarAndroid = progressBarAndroid
