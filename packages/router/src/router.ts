/**
 * @rasenjs/router - Router
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { Ref } from '@rasenjs/core'
import { template, isTemplate, type Template } from '@rasenjs/core/utils'
import type {
  Route,
  RouteMatch,
  HistoryAdapter,
  Router,
  NavigateOptions,
  QuerySchema,
  BeforeEachCallback,
  AfterEachCallback,
  OnErrorCallback,
  RoutesConfig,
  TransformRoutes,
  RouteConfig
} from './types'
import { NavigationAbortedError } from './types'
import { isRouteInput, createRoute } from './route'

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
 * 将配置值归一化为 RouteConfig 对象
 */
function normalizeConfig(value: unknown): { config: RouteConfig; isNested: false } | { config: RoutesConfig; isNested: true } | null {
  // 字符串路径
  if (typeof value === 'string') {
    return { 
      config: { 
        path: template([value] as unknown as TemplateStringsArray)
      } as RouteConfig,
      isNested: false 
    }
  }
  
  // Template 对象
  if (isTemplate(value)) {
    return { 
      config: { path: value } as RouteConfig,
      isNested: false 
    }
  }
  
  // RouteInput（已经是标准格式）
  if (isRouteInput(value)) {
    return { 
      config: { 
        path: value.path, 
        query: value.query, 
        meta: value.meta, 
        beforeEnter: value.beforeEnter 
      } as RouteConfig,
      isNested: false
    }
  }
  
  // 对象 - 判断是 RouteConfig、RouteAliasConfig 还是嵌套配置
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    
    // 检查是否为 RouteAliasConfig: { alias: RouteConfig, path: Template | string }
    if ('alias' in obj && 'path' in obj) {
      const aliasConfig = obj.alias as RouteConfig
      const aliasPath = obj.path
      
      // 将别名路径转换为 Template
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let pathTemplate: Template<any>
      if (typeof aliasPath === 'string') {
        pathTemplate = template([aliasPath] as unknown as TemplateStringsArray)
      } else if (isTemplate(aliasPath)) {
        pathTemplate = aliasPath
      } else {
        return null
      }
      
      // 使用别名路径，但保留 alias 中的配置
      return {
        config: {
          path: pathTemplate,
          query: aliasConfig.query,
          meta: aliasConfig.meta,
          beforeEnter: aliasConfig.beforeEnter
        } as RouteConfig,
        isNested: false
      }
    }
    
    const allowedKeys = new Set(['path', 'query', 'meta', 'beforeEnter'])
    
    // 空对象 {} 或所有键都在允许列表中，则是 RouteConfig
    if (keys.length === 0 || keys.every(k => allowedKeys.has(k))) {
      return { 
        config: obj as RouteConfig,
        isNested: false 
      }
    }
    
    // 否则是嵌套配置
    return { 
      config: obj as RoutesConfig,
      isNested: true 
    }
  }
  
  return null
}

/**
 * 递归处理嵌套路由配置，返回保留嵌套结构的路由表
 */
function processRoutes(
  config: RoutesConfig,
  pathPrefix: string = '',
  parentMeta: unknown = undefined
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, Route<any, any, any> | Record<string, any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, Route<any, any, any> | Record<string, any>> = {}

  for (const [key, value] of Object.entries(config)) {
    // 检查空 key
    if (key === '') {
      throw new Error('Empty key is not allowed in route configuration. Use a meaningful name like "index" or use absolute path in template.')
    }

    const normalized = normalizeConfig(value)
    if (!normalized) continue

    if (!normalized.isNested) {
      // 是路由配置
      const routeConfig = normalized.config as RouteConfig
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tpl: Template<any>
      const configPath = routeConfig.path
      
      // 处理 path 字段（可能是 Template 或 string）
      if (!configPath) {
        tpl = template``
      } else if (typeof configPath === 'string') {
        tpl = template([configPath] as unknown as TemplateStringsArray)
      } else {
        tpl = configPath
      }
      
      const templatePattern = tpl.pattern

      // 计算完整路径
      let fullPath: string
      if (templatePattern.startsWith('/')) {
        fullPath = templatePattern
      } else {
        const currentPathPrefix = pathPrefix ? `${pathPrefix}/${key}` : `/${key}`
        fullPath = templatePattern
          ? `${currentPathPrefix}/${templatePattern}`
          : currentPathPrefix
      }

      // 规范化路径
      fullPath = ('/' + fullPath.replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')) || '/'

      // 合并父级 meta
      const mergedMeta = parentMeta && routeConfig.meta
        ? { ...(parentMeta as object), ...(routeConfig.meta as object) }
        : routeConfig.meta ?? parentMeta

      const routeInput = {
        path: tpl,
        query: routeConfig.query,
        meta: mergedMeta,
        beforeEnter: routeConfig.beforeEnter,
        _isRouteInput: true as const
      }

      result[key] = createRoute(routeInput, fullPath)
    } else {
      // 是嵌套配置
      const nestedConfig = normalized.config as unknown as RoutesConfig
      const newPathPrefix = pathPrefix ? `${pathPrefix}/${key}` : `/${key}`
      result[key] = processRoutes(nestedConfig, newPathPrefix, parentMeta)
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
 * const router = createRouter({
 *   home: route(),
 *   user: route(template`/users/${{ id: z.string() }}`),
 *   posts: {
 *     list: route(),
 *     detail: route(template`${{ id: z.coerce.number() }}`),
 *   }
 * }, {
 *   history: createBrowserHistory(),
 * })
 *
 * // 匹配
 * router.match('/users/123')
 *
 * // 生成链接（强类型）
 * router.href(routes.user, { params: { id: '123' } })  // '/users/123'
 *
 * // 导航（强类型）
 * router.push(routes.user, { params: { id: '123' } })
 * router.push(routes.posts.detail, { params: { id: 42 } })
 *
 * // 使用钩子响应路由变化
 * router.afterEach((to, from) => console.log(to.path))
 * ```
 */
export function createRouter<TConfig extends RoutesConfig>(
  config: TConfig,
  options: {
    history?: HistoryAdapter
    /**
     * 重定向深度限制。用于防止无限重定向循环：
     * - 数字：开发环境容忍度（默认 10）。超过此次数会报错并调用 onError
     * - false：生产环境无限制，直到真正的无限循环导致崩溃
     * - undefined：默认为 10（开发默认值）
     */
    redirectDepthLimit?: number | false
  } = {}
): Router<TransformRoutes<TConfig>> {
  // 处理嵌套配置，生成保留结构的路由表
  const routesConfig = processRoutes(config)
  const { history, redirectDepthLimit = 10 } = options

  // 全局钩子
  const beforeGuards = new Set<BeforeEachCallback>()
  const leaveGuards = new Set<BeforeEachCallback>()
  const afterHooks = new Set<AfterEachCallback>()
  const errorHandlers = new Set<OnErrorCallback>()

  // 收集所有路由，按路径长度排序，优先匹配更具体的路由
  const allRoutes = collectRoutes(routesConfig).sort((a, b) => {
    return b.fullPath.length - a.fullPath.length
  })

  // 使用响应式 ref 存储当前匹配（如果响应式运行时可用）
  const runtime = getReactiveRuntime()
  const scope = runtime?.effectScope()
  let currentMatchRef: Ref<RouteMatch | null> | null = null
  let isNavigatingRef: Ref<boolean> | null = null

  if (scope && runtime) {
    scope.run(() => {
      currentMatchRef = runtime.ref<RouteMatch | null>(null)
      isNavigatingRef = runtime.ref<boolean>(false)
    })
  }

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
   * 获取导航状态
   */
  function getIsNavigating(): boolean {
    if (isNavigatingRef) {
      return isNavigatingRef.value
    }
    return false
  }

  /**
   * 设置导航状态
   */
  function setIsNavigating(value: boolean) {
    if (isNavigatingRef) {
      isNavigatingRef.value = value
    }
  }

  /**
   * 通过路由键获取 Route 对象
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getRouteByKey(key: string): Route<any, any, any> | null {
    const keys = key.split('.')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = routesConfig
    
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k]
      } else {
        return null
      }
    }
    
    return isRoute(current) ? current : null
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
          meta: route.meta,
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
    routeOrKey: Route<P, Q, any> | string,
    options?: NavigateOptions<P, Q>
  ): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let route: Route<P, Q, any>
    
    if (typeof routeOrKey === 'string') {
      const foundRoute = getRouteByKey(routeOrKey)
      if (!foundRoute) {
        throw new Error(`Route not found for key: ${routeOrKey}`)
      }
      route = foundRoute
    } else {
      if (!isRoute(routeOrKey)) {
        throw new Error('Invalid route object')
      }
      route = routeOrKey
    }
    
    const params = (options?.params ?? {}) as P
    const path = route.format(params)
    const queryString = options?.query ? serializeQuery(options.query) : ''
    return path + queryString
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
   * @param redirectDepth 当前重定向深度，用于检测循环重定向
   */
  async function navigate(
    path: string,
    mode: 'push' | 'replace',
    redirectDepth = 0
  ): Promise<void> {
    // 检查重定向深度限制
    if (redirectDepthLimit !== false && redirectDepth > redirectDepthLimit) {
      const error = new Error(
        `Potential infinite redirect loop detected: path "${path}" redirected ${redirectDepth} times ` +
        `(limit: ${redirectDepthLimit}). Check your beforeEach/beforeLeave/beforeEnter guards.`
      )
      const to = match(path)
      const from = getCurrentMatch()
      setIsNavigating(false)
      runErrorHandlers(error, to, from)
      // 抛出错误，让调用者可以 catch
      throw error
    }

    const to = match(path)
    const from = getCurrentMatch()

    if (!to) {
      // 无匹配路由，仍然导航（可能是 404）
      if (history) {
        mode === 'push' ? history.push(path) : history.replace(path)
      }
      setCurrentMatch(null)
      setIsNavigating(false)
      return
    }

    try {
      // 先执行离开守卫（针对 from 路由）
      const leaveRedirect = await runLeaveGuards(to, from)
      if (leaveRedirect) {
        const redirectPath = leaveRedirect.format({})
        
        // 防止无限循环：如果重定向到相同路径，则不再重定向
        if (redirectPath !== to.path) {
          await navigate(redirectPath, mode, redirectDepth + 1)
          return
        }
      }

      // 执行全局前置守卫
      const redirect = await runBeforeGuards(to, from)

      if (redirect) {
        // 获取重定向目标路径
        const redirectPath = redirect.format({})
        
        // 防止无限循环：如果重定向到相同路径，则不再重定向
        if (redirectPath !== to.path) {
          await navigate(redirectPath, mode, redirectDepth + 1)
          return
        }
      }

      // 执行单路由前置守卫
      if (to.route.beforeEnter) {
        const beforeEnterResult = await to.route.beforeEnter(to, from)

        // false → 包装成 NavigationAbortedError
        if (beforeEnterResult === false) {
          throw new NavigationAbortedError()
        }

        // string → 包装成 NavigationAbortedError(message)
        if (typeof beforeEnterResult === 'string' && !isRoute(beforeEnterResult)) {
          throw new NavigationAbortedError(beforeEnterResult)
        }

        // Route → 重定向
        if (isRoute(beforeEnterResult)) {
          const redirectPath = beforeEnterResult.format({})
          await navigate(redirectPath, mode, redirectDepth + 1)
          return
        }

        // true / void → 继续
      }

      // 更新当前匹配（不论是否有 history）
      setCurrentMatch(to)

      // 执行导航
      if (history) {
        mode === 'push' ? history.push(path) : history.replace(path)
      }

      // 在执行后置钩子前设置为 false
      setIsNavigating(false)

      // 执行后置钩子
      runAfterHooks(to, from)
    } catch (error) {
      // 执行错误处理器
      setIsNavigating(false)
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
    routeOrKey: Route<P, Q, any> | string,
    options?: NavigateOptions<P, Q>
  ): Promise<void> {
    setIsNavigating(true)
    const path = href(routeOrKey, options)
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
    routeOrKey: Route<P, Q, any> | string,
    options?: NavigateOptions<P, Q>
  ): Promise<void> {
    setIsNavigating(true)
    const path = href(routeOrKey, options)
    await navigate(path, 'replace')
  }

  /**
   * 订阅路由变化
   */
  /**
   * 注册前置守卫
   */
  function beforeEach(callback: BeforeEachCallback): () => void {
    beforeGuards.add(callback)
    return () => beforeGuards.delete(callback)
  }

  /**
   * 注册离开守卫
   */
  function beforeLeave(callback: BeforeEachCallback): () => void {
    leaveGuards.add(callback)
    return () => leaveGuards.delete(callback)
  }

  /**
   * 注册后置钩子
   */
  function afterEach(callback: AfterEachCallback): () => void {
    afterHooks.add(callback)
    return () => afterHooks.delete(callback)
  }

  /**
   * 注册错误处理器
   */
  function onError(callback: OnErrorCallback): () => void {
    errorHandlers.add(callback)
    return () => errorHandlers.delete(callback)
  }

  /**
   * 在历史中前进或后退 n 步
   */
  function go(n: number): void {
    if (history) {
      history.go(n)
    }
  }

  /**
   * 后退一步
   */
  function back(): void {
    go(-1)
  }

  /**
   * 前进一步
   */
  function forward(): void {
    go(1)
  }

  // 监听 history 变化
  let unsubscribe: (() => void) | null = null
  if (history) {
    unsubscribe = history.subscribe((path) => {
      setCurrentMatch(match(path))
    })
    // 初始化当前匹配
    setCurrentMatch(match(history.getPath()))
  }

  /**
   * 销毁路由，清理资源（如 history 订阅和响应式 ref）
   */
  function destroy(): void {
    if (unsubscribe) {
      unsubscribe()
    }
    beforeGuards.clear()
    leaveGuards.clear()
    afterHooks.clear()
    errorHandlers.clear()
    // 清理所有响应式 ref
    if (scope) {
      scope.stop()
    }
  }

  return {
    routes: routesConfig as TransformRoutes<TConfig>,
    match,
    href,
    push,
    replace,
    go,
    back,
    forward,
    beforeEach,
    beforeLeave,
    afterEach,
    onError,
    destroy,
    get current() {
      return getCurrentMatch()
    },
    get isNavigating() {
      return getIsNavigating()
    }
  }
}
