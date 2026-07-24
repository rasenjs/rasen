/**
 * @rasenjs/vue-rn-test — Metro entry point
 *
 * No manual native component imports needed here.
 * @rasenjs/rn-dom auto-registers them via _resolveNativeName.
 */

if (typeof window === 'undefined') (globalThis as any).window = globalThis
if (typeof performance === 'undefined') (globalThis as any).performance = { now: () => Date.now() }

import 'react-native'

import { name as appName } from './app.json'
import { createApp } from '@rasenjs/vue-rn'
import App from './App.vue'
import { router } from './router'

createApp(App)
  .use(router)
  .register(appName)

// Navigate from START_LOCATION to the home route
router.push('/')
