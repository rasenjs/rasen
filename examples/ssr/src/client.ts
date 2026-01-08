/**
 * Client entry point
 */
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { createBrowserHistory } from '@rasenjs/router'
import { hydrate } from '@rasenjs/dom'
import { createApp } from './App'

// Setup reactive runtime for client
useReactiveRuntime()

// Create app with browser history
const history = createBrowserHistory()
const App = createApp(history)

// Hydrate the server-rendered HTML
const root = document.getElementById('app')
if (root) {
  hydrate(App(), root)
}
