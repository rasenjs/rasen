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

    go(n: number) {
      window.history.go(n)
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

    go(n: number) {
      window.history.go(n)
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
  let currentIndex = 0
  const historyStack = [initialPath]

  return {
    getPath() {
      return historyStack[currentIndex]
    },

    push(path: string) {
      // 移除当前位置之后的历史
      historyStack.splice(currentIndex + 1)
      historyStack.push(path)
      currentIndex++
      listeners.forEach(listener => listener(path))
    },

    replace(path: string) {
      historyStack[currentIndex] = path
      listeners.forEach(listener => listener(path))
    },

    go(n: number) {
      const newIndex = currentIndex + n
      if (newIndex >= 0 && newIndex < historyStack.length) {
        currentIndex = newIndex
        const path = historyStack[currentIndex]
        listeners.forEach(listener => listener(path))
      }
    },

    subscribe(listener: (path: string) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
