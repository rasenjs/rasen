/**
 * @rasenjs/router - Router
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type {
  Route,
  RouteMatch,
  HistoryAdapter,
  Router,
  NavigateOptions,
  QuerySchema,
  NavigationGuard,
  AfterNavigationHook,
  NavigationErrorHandler
} from './types'
import { NavigationAbortedError } from './types'

/**
 * 将 query 对象序列化为 URL query string
 */
function serializeQuery(query: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`
        )
      }
    } else {
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      )
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

  // 全局钩子
  const beforeGuards = new Set<NavigationGuard>()
  const leaveGuards = new Set<NavigationGuard>()
  const afterHooks = new Set<AfterNavigationHook>()
  const errorHandlers = new Set<NavigationErrorHandler>()

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
  function href<
    P extends Record<string, unknown>,
    Q extends QuerySchema = Record<string, never>
  >(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    listeners.forEach((listener) => listener(newMatch))
  }

  /**
   * 执行离开守卫
   * 返回: null=继续, Route=重定向, 抛错=取消
   */
  async function runLeaveGuards(
    to: RouteMatch,
    from: RouteMatch | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<Route<any, any, any> | null> {
    for (const guard of leaveGuards) {
      const result = await guard(to, from)

      // false → 包装成 NavigationAbortedError
      if (result === false) {
        throw new NavigationAbortedError()
      }

      // string → 包装成 NavigationAbortedError(message)
      if (typeof result === 'string' && !isRoute(result)) {
        throw new NavigationAbortedError(result)
      }

      // Route → 重定向
      if (isRoute(result)) {
        return result
      }

      // true / void → 继续
    }
    return null
  }

  /**
   * 执行前置守卫
   * 返回: true=继续, Route=重定向, 抛错=取消
   */
  async function runBeforeGuards(
    to: RouteMatch,
    from: RouteMatch | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<Route<any, any, any> | null> {
    for (const guard of beforeGuards) {
      const result = await guard(to, from)

      // false → 包装成 NavigationAbortedError
      if (result === false) {
        throw new NavigationAbortedError()
      }

      // string → 包装成 NavigationAbortedError(message)
      if (typeof result === 'string' && !isRoute(result)) {
        throw new NavigationAbortedError(result)
      }

      // Route → 重定向
      if (isRoute(result)) {
        return result
      }

      // true / void → 继续
    }
    return null
  }

  /**
   * 执行后置钩子
   */
  function runAfterHooks(to: RouteMatch, from: RouteMatch | null): void {
    for (const hook of afterHooks) {
      try {
        hook(to, from)
      } catch (e) {
        console.error('afterEach hook error:', e)
      }
    }
  }

  /**
   * 执行错误处理器
   */
  function runErrorHandlers(
    error: Error,
    to: RouteMatch | null,
    from: RouteMatch | null
  ): void {
    for (const handler of errorHandlers) {
      try {
        handler(error, to, from)
      } catch (e) {
        console.error('onError handler error:', e)
      }
    }
  }

  /**
   * 内部导航实现
   */
  async function navigate(
    path: string,
    mode: 'push' | 'replace'
  ): Promise<void> {
    const to = match(path)
    const from = getCurrentMatch()

    if (!to) {
      // 无匹配路由，仍然导航（可能是 404）
      if (history) {
        mode === 'push' ? history.push(path) : history.replace(path)
      }
      notifyListeners(null)
      return
    }

    try {
      // 先执行离开守卫（针对 from 路由）
      const leaveRedirect = await runLeaveGuards(to, from)
      if (leaveRedirect) {
        const redirectPath = leaveRedirect.format({})
        await navigate(redirectPath, mode)
        return
      }

      // 执行前置守卫
      const redirect = await runBeforeGuards(to, from)

      if (redirect) {
        // 重定向：递归调用 navigate
        const redirectPath = redirect.format({})
        await navigate(redirectPath, mode)
        return
      }

      // 执行导航
      if (history) {
        mode === 'push' ? history.push(path) : history.replace(path)
      } else {
        notifyListeners(to)
      }

      // 执行后置钩子
      runAfterHooks(to, from)
    } catch (error) {
      // 执行错误处理器
      runErrorHandlers(error as Error, to, from)
      // 重新抛出错误，让调用者可以 catch
      throw error
    }
  }

  /**
   * 导航
   */
  async function push<
    P extends Record<string, unknown>,
    Q extends QuerySchema = Record<string, never>
  >(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    route: Route<P, Q, any>,
    params: P,
    options?: NavigateOptions<Q>
  ): Promise<void> {
    const path = href(route, params, options)
    await navigate(path, 'push')
  }

  /**
   * 替换导航
   */
  async function replace<
    P extends Record<string, unknown>,
    Q extends QuerySchema = Record<string, never>
  >(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    route: Route<P, Q, any>,
    params: P,
    options?: NavigateOptions<Q>
  ): Promise<void> {
    const path = href(route, params, options)
    await navigate(path, 'replace')
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

  /**
   * 注册前置守卫
   */
  function beforeEach(guard: NavigationGuard): () => void {
    beforeGuards.add(guard)
    return () => beforeGuards.delete(guard)
  }

  /**
   * 注册离开守卫
   */
  function beforeLeave(guard: NavigationGuard): () => void {
    leaveGuards.add(guard)
    return () => leaveGuards.delete(guard)
  }

  /**
   * 注册后置钩子
   */
  function afterEach(hook: AfterNavigationHook): () => void {
    afterHooks.add(hook)
    return () => afterHooks.delete(hook)
  }

  /**
   * 注册错误处理器
   */
  function onError(handler: NavigationErrorHandler): () => void {
    errorHandlers.add(handler)
    return () => errorHandlers.delete(handler)
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
    routes: routesConfig,
    match,
    href,
    push,
    replace,
    subscribe,
    beforeEach,
    beforeLeave,
    afterEach,
    onError,
    get current() {
      return getCurrentMatch()
    }
  }
}
