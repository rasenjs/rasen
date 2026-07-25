/**
 * @rasenjs/vue-rn/web — RN-like components for the browser
 *
 * Vue 3 component wrappers that map React Native tags to HTML elements
 * with atomic CSS style compilation, analogous to react-native-web.
 *
 * Usage:
 *   import { createWebApp } from '@rasenjs/vue-rn/web'
 *   import App from './App.vue'
 *
 *   createWebApp(App).use(router).mount('#app')
 */

import { createApp as vueCreateApp } from 'vue'
import type { App } from 'vue'
import { StyleSheet, injectReset } from './stylesheet'
import { View } from './components/View'
import { Text } from './components/Text'
import { Image } from './components/Image'
import { TextInput } from './components/TextInput'
import { ScrollView } from './components/ScrollView'
import { SafeAreaView } from './components/SafeAreaView'
import { ActivityIndicator } from './components/ActivityIndicator'
import { Switch } from './components/Switch'
import { Pressable } from './components/Pressable'
import { StatusBar } from './components/StatusBar'
import { KeyboardAvoidingView } from './components/KeyboardAvoidingView'
import { ImageBackground } from './components/ImageBackground'
import { Button } from './components/Button'
import { CheckBox } from './components/CheckBox'
import { ProgressBar } from './components/ProgressBar'
import {
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
} from './components/Touchable'
import {
  Alert,
  Platform,
  Dimensions,
  PixelRatio,
  Linking,
  Clipboard,
  AppState,
  Share,
  useWindowDimensions,
  useColorScheme,
  useLocaleContext,
} from './apis'

// ── Component registry ────────────────────────────────────────────────

const componentMap: Record<string, any> = {
  View, Text, Image, TextInput, ScrollView,
  SafeAreaView, ActivityIndicator, Switch,
  Pressable, StatusBar, KeyboardAvoidingView,
  ImageBackground, Button, CheckBox, ProgressBar,
  TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback,
}

/**
 * Create a Vue app with all RN-like web components registered globally.
 *
 * @example
 *   import { createWebApp } from '@rasenjs/vue-rn/web'
 *   import App from './App.vue'
 *   createWebApp(App).mount('#app')
 */
export function createWebApp(rootComponent: object): App<Element> {
  injectReset()
  const app = vueCreateApp(rootComponent)
  for (const [name, comp] of Object.entries(componentMap)) {
    app.component(name, comp as any)
  }
  return app
}

// Plugin form for manual app.use()
export const webPlugin = {
  install(app: App<Element>) {
    injectReset()
    for (const [name, comp] of Object.entries(componentMap)) {
      app.component(name, comp as any)
    }
  },
}

export {
  // Core
  StyleSheet,
  View, Text, Image, TextInput, ScrollView,
  SafeAreaView, ActivityIndicator, Switch,
  Pressable, StatusBar, KeyboardAvoidingView,
  ImageBackground, Button, CheckBox, ProgressBar,
  TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback,

  // APIs
  Alert, Platform, Dimensions, PixelRatio,
  Linking, Clipboard, AppState, Share,

  // Hooks
  useWindowDimensions, useColorScheme, useLocaleContext,
}
