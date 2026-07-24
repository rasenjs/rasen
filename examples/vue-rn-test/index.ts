/**
 * @rasenjs/vue-rn-test — Metro entry point
 */

if (typeof window === 'undefined') (globalThis as any).window = globalThis
if (typeof performance === 'undefined') (globalThis as any).performance = { now: () => Date.now() }

import 'react-native'
import 'react-native/Libraries/Text/TextNativeComponent'
import 'react-native/Libraries/Image/ImageViewNativeComponent'
import 'react-native/Libraries/Components/TextInput/AndroidTextInputNativeComponent'

import { AppRegistry } from 'react-native'
import { RNDocument } from '@rasenjs/rn-dom'
import { createApp } from '@rasenjs/vue-rn'
import App from './App.vue'
import { router } from './router'

AppRegistry.registerRunnable('RasenExample', ({ rootTag }: any) => {
  console.log('[vue-rn] Starting with rootTag:', rootTag)
  const doc = RNDocument.getOrCreate(rootTag as number)
  const app = createApp(App)
  app.use(router)

  // createMemoryHistory starts at START_LOCATION_NORMALIZED (not a real route).
  // Navigate to '/' to match the home route and render content.
  router.push('/')

  app.mount(doc.body)
  console.log('[vue-rn] App mounted')
})
