/// <reference types="@rasenjs/jsx-runtime/jsx" />

/**
 * Router configuration
 */
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-signals'
import { createRouter, createBrowserHistory, route } from '@rasenjs/router'

// Initialize reactive runtime before creating router
setReactiveRuntime(createReactiveRuntime())

// Define routes configuration
const routesConfig = {
  home: route('/'),
  counter: route('/counter'),
  todo: route('/todo'),
  timer: route('/timer'),
  about: route('/about'),
}

// Create router instance
// The actual Route objects are available at router.routes
export const router = createRouter(routesConfig, {
  history: createBrowserHistory(),
})
