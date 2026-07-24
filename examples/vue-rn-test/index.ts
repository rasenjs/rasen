/**
 * @rasenjs/vue-rn-test — Metro entry point
 *
 * No manual native component imports needed here.
 * @rasenjs/rn-dom auto-registers them via _resolveNativeName.
 */

if (typeof window === 'undefined') (globalThis as any).window = globalThis
if (typeof performance === 'undefined') (globalThis as any).performance = { now: () => Date.now() }

import 'react-native'

import { AppRegistry } from 'react-native'
import { createApp, getOrCreateDocument } from '@rasenjs/vue-rn'
import App from './App.vue'
import { router } from './router'

AppRegistry.registerRunnable('VueRnTest', ({ rootTag }: any) => {
  console.log('[vue-rn] Starting with rootTag:', rootTag)
  const doc = getOrCreateDocument(rootTag as number)
  const app = createApp(App)
  app.use(router)

  // createMemoryHistory starts at START_LOCATION_NORMALIZED (not a real route).
  // Navigate to '/' to match the home route and render content.
  router.push('/')

  app.mount(doc.body)
  console.log('[vue-rn] App mounted')
})
