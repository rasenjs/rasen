/**
 * @rasenjs/react-native example — Metro entry point
 *
 * No manual native component imports needed.
 * @rasenjs/rn-dom auto-registers them via _resolveNativeName.
 */

if (typeof window === 'undefined') globalThis.window = globalThis
if (typeof performance === 'undefined') globalThis.performance = { now: () => Date.now() }

import 'react-native'

import { name as appName } from './app.json'
import { registerApp } from '@rasenjs/react-native'
import { App } from './src/App'

registerApp(appName, App)
