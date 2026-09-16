/**
 * Client entry point - hydration
 */
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { createBrowserHistory } from '@rasenjs/router'
import { hydrate } from '@rasenjs/web'
import { createApp } from './App'
import './style.css'

// Install the signals runtime before hydration reads any signal.
useReactiveRuntime()

// Hydrate the server-rendered HTML
const root = document.getElementById('app')
if (root) {
  hydrate(createApp(createBrowserHistory()), root)
}
