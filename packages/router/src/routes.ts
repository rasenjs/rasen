/**
 * @rasenjs/router - Create Routes
 * 
 * 从嵌套配置创建路由表，保留嵌套结构
 */

import type { RoutesConfig, Route, RouteInput } from './types'
import { isRouteInput, createRoute } from './route'

/**
 * 将 RouteInput 配置转换为 Route 配置（保留嵌套结构）
 */
export type TransformRoutes<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof T]: T[K] extends RouteInput<infer P, infer Q, infer M>
    ? Route<P, Q, M>
    : T[K] extends object
      ? TransformRoutes<T[K]>
      : never
}

/**
 * 递归处理路由配置，返回保留嵌套结构的路由表
 */
function processRoutes(
  config: RoutesConfig,
  pathPrefix: string = ''
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, Route<any, any, any> | Record<string, any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, Route<any, any, any> | Record<string, any>> = {}

  for (const [key, value] of Object.entries(config)) {
    // 检查空 key
    if (key === '') {
      throw new Error('Empty key is not allowed in route configuration. Use a meaningful name like "index" or use absolute path in template.')
    }

    if (isRouteInput(value)) {
      // 是路由定义
      const input = value
      const templatePattern = input.template.pattern
      
      // 计算完整路径
      let fullPath: string
      if (templatePattern.startsWith('/')) {
        // 绝对路径：直接使用 template 的 pattern
        fullPath = templatePattern
      } else {
        // 相对路径：加上前缀
        const currentPathPrefix = pathPrefix ? `${pathPrefix}/${key}` : `/${key}`
        fullPath = templatePattern 
          ? `${currentPathPrefix}/${templatePattern}` 
          : currentPathPrefix
      }

      // 规范化路径（去除重复斜杠，确保以 / 开头）
      fullPath = ('/' + fullPath.replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')) || '/'

      result[key] = createRoute(input, fullPath)
    } else {
      // 是嵌套配置
      const nestedConfig = value as RoutesConfig
      const newPathPrefix = pathPrefix ? `${pathPrefix}/${key}` : `/${key}`
      
      result[key] = processRoutes(nestedConfig, newPathPrefix)
    }
  }

  return result
}

/**
 * 创建路由表
 * 
 * 返回保留嵌套结构的路由对象，可直接用于 router.push
 * 
 * @example
 * ```typescript
 * const routes = createRoutes({
 *   home: route(),                    // /home
 *   user: route(template`/users/${{ id: z.string() }}`),
 *   
 *   posts: {
 *     list: route(),                  // /posts/list
 *     detail: route(template`${{ id: z.coerce.number() }}`), // /posts/detail/:id
 *   },
 * })
 * 
 * // 使用
 * router.push(routes.home, {})
 * router.push(routes.posts.detail, { id: 42 })
 * ```
 */
export function createRoutes<T extends RoutesConfig>(
  config: T
): TransformRoutes<T> {
  return processRoutes(config) as TransformRoutes<T>
}
