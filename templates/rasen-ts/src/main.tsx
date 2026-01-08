/// <reference types="@rasenjs/jsx-runtime/jsx" />

/**
 * Client entry point - hydration
 */
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { createBrowserHistory } from '@rasenjs/router'
import { hydrate } from '@rasenjs/web'
import { createApp } from './App'
import './style.css'

// Setup reactive runtime for client
useReactiveRuntime()

// Create app with browser history
const history = createBrowserHistory()
const App = createApp(history)

// Hydrate the server-rendered HTML
const root = document.getElementById('app')
if (root) {
  hydrate(App, root)
}
