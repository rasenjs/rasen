/**
 * Client entry point
 */
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { createBrowserHistory } from '@rasenjs/router'
import { hydrate } from '@rasenjs/dom'
import { createApp } from './App'

// Setup reactive runtime for client
setReactiveRuntime(createReactiveRuntime())

// Create app with browser history
const history = createBrowserHistory()
const App = createApp(history)

// Hydrate the server-rendered HTML
const root = document.getElementById('app')
if (root) {
  hydrate(App(), root)
}
