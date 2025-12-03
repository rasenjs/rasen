/**
 * @rasenjs/router - Router
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { Route, RouteMatch, HistoryAdapter, Router, NavigateOptions, QuerySchema } from './types'

/**
 * 将 query 对象序列化为 URL query string
 */
function serializeQuery(query: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

/**
 * 解析 URL query string 为对象
 */
function parseQuery(queryString: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  if (!queryString || queryString === '?') return result
  
  const query = queryString.startsWith('?') ? queryString.slice(1) : queryString
  for (const part of query.split('&')) {
    if (!part) continue
    const [key, value] = part.split('=').map(decodeURIComponent)
    if (key in result) {
      // 重复的 key 转为数组
      const existing = result[key]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        result[key] = [existing, value]
      }
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * 判断是否为 Route 对象
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isRoute(value: unknown): value is Route<any, any, any> {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_isRoute' in value &&
    value._isRoute === true
  )
}

/**
 * 递归收集所有 Route 对象
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectRoutes(obj: Record<string, any>): Route<any, any, any>[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routes: Route<any, any, any>[] = []
  
  for (const value of Object.values(obj)) {
    if (isRoute(value)) {
      routes.push(value)
    } else if (typeof value === 'object' && value !== null) {
      routes.push(...collectRoutes(value))
    }
  }
  
  return routes
}

/**
 * 创建路由器
 * 
 * @example
 * ```typescript
 * const routes = createRoutes({
 *   home: route(),
 *   user: route(template`/users/${{ id: z.string() }}`),
 *   posts: {
 *     list: route(),
 *     detail: route(template`${{ id: z.coerce.number() }}`),
 *   }
 * })
 * 
 * const router = createRouter(routes, {
 *   history: createBrowserHistory(),
 * })
 * 
 * // 匹配
 * router.match('/users/123')
 * 
 * // 生成链接（强类型）
 * router.href(routes.user, { id: '123' })  // '/users/123'
 * 
 * // 导航（强类型）
 * router.push(routes.user, { id: '123' })
 * router.push(routes.posts.detail, { id: 42 })
 * 
 * // 订阅变化
 * router.subscribe((match) => console.log(match))
 * ```
 */
export function createRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  routesConfig: Record<string, any>,
  options: {
    history?: HistoryAdapter
  } = {}
): Router {
  const { history } = options
  const listeners = new Set<(match: RouteMatch | null) => void>()
  
  // 收集所有路由，按路径长度排序，优先匹配更具体的路由
  const allRoutes = collectRoutes(routesConfig).sort((a, b) => {
    return b.fullPath.length - a.fullPath.length
  })

  // 使用响应式 ref 存储当前匹配（如果响应式运行时可用）
  const runtime = getReactiveRuntime()
  const currentMatchRef = runtime?.ref<RouteMatch | null>(null)

  /**
   * 获取当前匹配
   */
  function getCurrentMatch(): RouteMatch | null {
    if (currentMatchRef) {
      return currentMatchRef.value
    }
    return null
  }

  /**
   * 设置当前匹配
   */
  function setCurrentMatch(newMatch: RouteMatch | null) {
    if (currentMatchRef) {
      currentMatchRef.value = newMatch
    }
  }

  /**
   * 匹配路径
   */
  function match(fullPath: string): RouteMatch | null {
    // 分离 path 和 query
    const [path, queryString] = fullPath.split('?')
    const query = parseQuery(queryString || '')
    
    for (const route of allRoutes) {
      const params = route.parse(path)
      if (params) {
        return {
          route,
          params,
          query,
          path
        }
      }
    }
    return null
  }

  /**
   * 生成 href
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function href<P extends Record<string, unknown>, Q extends QuerySchema = Record<string, never>>(
    route: Route<P, Q, any>,
    params: P,
    options?: NavigateOptions<Q>
  ): string {
    if (!isRoute(route)) {
      throw new Error('Invalid route object')
    }
    const path = route.format(params)
    const queryString = options?.query ? serializeQuery(options.query) : ''
    return path + queryString
  }

  /**
   * 通知监听器
   */
  function notifyListeners(newMatch: RouteMatch | null) {
    setCurrentMatch(newMatch)
    listeners.forEach(listener => listener(newMatch))
  }

  /**
   * 导航
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function push<P extends Record<string, unknown>, Q extends QuerySchema = Record<string, never>>(
    route: Route<P, Q, any>,
    params: P,
    options?: NavigateOptions<Q>
  ): void {
    const path = href(route, params, options)
    if (history) {
      history.push(path)
    } else {
      notifyListeners(match(path))
    }
  }

  /**
   * 替换导航
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function replace<P extends Record<string, unknown>, Q extends QuerySchema = Record<string, never>>(
    route: Route<P, Q, any>,
    params: P,
    options?: NavigateOptions<Q>
  ): void {
    const path = href(route, params, options)
    if (history) {
      history.replace(path)
    } else {
      notifyListeners(match(path))
    }
  }

  /**
   * 订阅路由变化
   */
  function subscribe(listener: (match: RouteMatch | null) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  // 监听 history 变化
  if (history) {
    history.subscribe((path) => {
      notifyListeners(match(path))
    })
    // 初始化当前匹配
    setCurrentMatch(match(history.getPath()))
  }

  return {
    match,
    href,
    push,
    replace,
    subscribe,
    get current() {
      return getCurrentMatch()
    }
  }
}
