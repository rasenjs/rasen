/**
 * Tag alias components for @rasenjs/react-native.
 *
 * Convenience wrappers around `element(tag, props)` so you can write:
 *
 * ```ts
 * view({ style: { flex: 1 }, children: text({ children: 'Hello' }) })
 * // instead of
 * element('View', { style: { flex: 1 }, children: element('Text', { children: 'Hello' }) })
 * ```
 *
 * Each tag is fully typed using RN's native prop types from `@rasenjs/rn-dom/elements`.
 */

import { tag } from './element'
export type { Child } from './element'

// ── Built-in RN Tags ────────────────────────────────────────────────────

// CamelCase aliases (functional API style)
/** Container component with Flexbox layout. */
export const view = tag('View')
/** Text display component. */
export const text = tag('Text')
/** Safe area container (notch/pill insets). */
export const safeAreaView = tag('SafeAreaView')
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
/** Generic pressable container. */
export const pressable = tag('View')
/** Touchable with opacity feedback. */
export const touchableOpacity = tag('View')
/** Touchable with highlight feedback. */
export const touchableHighlight = tag('View')
/** Touchable without visual feedback. */
export const touchableWithoutFeedback = tag('View')
/** Android DrawerLayout. */
export const drawerLayoutAndroid = tag('DrawerLayoutAndroid')
/** Android progress bar. */
export const progressBarAndroid = tag('ProgressBarAndroid')
/** Keyboard-avoiding container. */
export const keyboardAvoidingView = tag('View')
/** Status bar configurator. */
export const statusBar = tag('StatusBar')

// PascalCase aliases (JSX style — import as named components)
/** @alias view */
export const View = view
/** @alias text */
export const Text = text
/** @alias safeAreaView */
export const SafeAreaView = safeAreaView
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
/** @alias touchableOpacity */
export const TouchableOpacity = touchableOpacity
/** @alias touchableHighlight */
export const TouchableHighlight = touchableHighlight
/** @alias touchableWithoutFeedback */
export const TouchableWithoutFeedback = touchableWithoutFeedback
/** @alias statusBar */
export const StatusBar = statusBar
