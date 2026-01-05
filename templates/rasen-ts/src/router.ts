/// <reference types="@rasenjs/jsx-runtime/jsx" />

/**
 * Router configuration
 */
import { createRouter, createBrowserHistory, route } from '@rasenjs/router'

// Define routes
export const routes = {
  home: route('/'),
  counter: route('/counter'),
  todo: route('/todo'),
  timer: route('/timer'),
  about: route('/about'),
}

// Create router instance
export const router = createRouter(routes, {
  history: createBrowserHistory(),
})
