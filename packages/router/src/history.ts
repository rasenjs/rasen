/**
 * @rasenjs/router - History Adapters
 */

import type { HistoryAdapter } from './types'

/**
 * 浏览器 History API 适配器
 */
export function createBrowserHistory(): HistoryAdapter {
  const listeners = new Set<(path: string) => void>()

  const handlePopState = () => {
    const path = window.location.pathname
    listeners.forEach(listener => listener(path))
  }

  // 监听浏览器前进后退
  window.addEventListener('popstate', handlePopState)

  return {
    getPath() {
      return window.location.pathname
    },

    push(path: string) {
      window.history.pushState(null, '', path)
      listeners.forEach(listener => listener(path))
    },

    replace(path: string) {
      window.history.replaceState(null, '', path)
      listeners.forEach(listener => listener(path))
    },

    subscribe(listener: (path: string) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/**
 * Hash History 适配器
 */
export function createHashHistory(): HistoryAdapter {
  const listeners = new Set<(path: string) => void>()

  const getPath = () => {
    const hash = window.location.hash
    return hash.startsWith('#') ? hash.slice(1) || '/' : '/'
  }

  const handleHashChange = () => {
    const path = getPath()
    listeners.forEach(listener => listener(path))
  }

  window.addEventListener('hashchange', handleHashChange)

  return {
    getPath,

    push(path: string) {
      window.location.hash = path
    },

    replace(path: string) {
      const url = window.location.href.split('#')[0]
      window.location.replace(`${url}#${path}`)
    },

    subscribe(listener: (path: string) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/**
 * 内存 History 适配器（用于测试或非浏览器环境）
 */
export function createMemoryHistory(initialPath: string = '/'): HistoryAdapter {
  const listeners = new Set<(path: string) => void>()
  let currentPath = initialPath

  return {
    getPath() {
      return currentPath
    },

    push(path: string) {
      currentPath = path
      listeners.forEach(listener => listener(path))
    },

    replace(path: string) {
      currentPath = path
      listeners.forEach(listener => listener(path))
    },

    subscribe(listener: (path: string) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
