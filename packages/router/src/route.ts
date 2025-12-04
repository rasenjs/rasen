/**
 * @rasenjs/router - Route Definition
 */

import { template, type Template } from '@rasenjs/shared'
import type { RouteInput, Route, RouteOptions, QuerySchema } from './types'

/** 空模板，用于无参数路由 */
const emptyTemplate = template``

/**
 * 定义路由
 * 
 * @example
 * ```typescript
 * // 无参数（使用 key 作为路径）
 * route()
 * 
 * // 仅 options（使用 key 作为路径）
 * route({ meta: { title: 'Home' } })
 * 
 * // 纯字符串路径（无参数）
 * route('/about')
 * route('/users/list')
 * 
 * // 带路径参数
 * route(tpl`/users/${{ id: z.string() }}`)
 * 
 * // 类型转换
 * route(tpl`/posts/${{ id: z.coerce.number() }}`)
 * 
 * // 带 query 参数和 meta
 * route(tpl`/users/${{ id: z.string() }}`, {
 *   query: { page: z.coerce.number().optional() },
 *   meta: { title: 'User Detail' }
 * })
 * ```
 */
// 无参数
export function route(): RouteInput<Record<string, never>, Record<string, never>, unknown>
// 仅 options（用于只设置 meta/query/beforeEnter 等，使用 key 作为路径）
export function route<
  TQuery extends QuerySchema = Record<string, never>,
  TMeta = unknown
>(
  options: RouteOptions<TQuery, TMeta>
): RouteInput<Record<string, never>, TQuery, TMeta>
// 纯字符串路径
export function route<
  TQuery extends QuerySchema = Record<string, never>,
  TMeta = unknown
>(
  path: string,
  options?: RouteOptions<TQuery, TMeta>
): RouteInput<Record<string, never>, TQuery, TMeta>
// Template 路径
export function route<
  TParams extends Record<string, unknown>,
  TQuery extends QuerySchema = Record<string, never>,
  TMeta = unknown
>(
  tpl: Template<TParams>,
  options?: RouteOptions<TQuery, TMeta>
): RouteInput<TParams, TQuery, TMeta>
// 实现
export function route<
  TParams extends Record<string, unknown> = Record<string, never>,
  TQuery extends QuerySchema = Record<string, never>,
  TMeta = unknown
>(
  tplOrPathOrOptions?: Template<TParams> | string | RouteOptions<TQuery, TMeta>,
  options?: RouteOptions<TQuery, TMeta>
): RouteInput<TParams, TQuery, TMeta> {
  let tpl: Template<TParams>
  let finalOptions: RouteOptions<TQuery, TMeta> | undefined
  
  // 判断第一个参数是 options 对象还是路径
  if (
    tplOrPathOrOptions !== undefined &&
    typeof tplOrPathOrOptions === 'object' &&
    !('pattern' in tplOrPathOrOptions) // 不是 Template 对象
  ) {
    // 第一个参数是 options
    tpl = emptyTemplate as Template<TParams>
    finalOptions = tplOrPathOrOptions as RouteOptions<TQuery, TMeta>
  } else {
    // 第一个参数是路径或 undefined
    if (tplOrPathOrOptions === undefined) {
      tpl = emptyTemplate as Template<TParams>
    } else if (typeof tplOrPathOrOptions === 'string') {
      // 纯字符串转成 Template
      tpl = template([tplOrPathOrOptions] as unknown as TemplateStringsArray) as Template<TParams>
    } else {
      tpl = tplOrPathOrOptions as Template<TParams>
    }
    finalOptions = options
  }
  
  return {
    path: tpl,
    query: finalOptions?.query,
    meta: finalOptions?.meta,
    beforeEnter: finalOptions?.beforeEnter,
    _isRouteInput: true as const
  }
}

// Re-export template for convenience
export { template }

/**
 * 判断是否为 RouteInput
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isRouteInput(value: unknown): value is RouteInput<any, any, any> {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_isRouteInput' in value &&
    value._isRouteInput === true
  )
}

/**
 * 从 RouteInput 创建完整的 Route
 */
export function createRoute<
  TParams extends Record<string, unknown>,
  TQuery extends QuerySchema,
  TMeta
>(
  input: RouteInput<TParams, TQuery, TMeta>,
  fullPath: string
): Route<TParams, TQuery, TMeta> {
  const tpl = input.path
  const templatePattern = tpl.pattern
  
  // 判断是否需要添加前缀
  // 如果 fullPath 与 templatePattern 相同，直接使用 tpl
  // 否则，计算需要添加的前缀
  let effectiveTpl: Template<TParams>
  
  if (fullPath === templatePattern) {
    // 路径相同，直接使用
    effectiveTpl = tpl
  } else if (templatePattern === '') {
    // 空模板，fullPath 就是完整路径
    // 需要创建一个匹配 fullPath 的 template
    effectiveTpl = tpl.prefix(fullPath)
  } else if (!templatePattern.startsWith('/')) {
    // 相对路径模板，需要计算前缀
    // fullPath = prefix + templatePattern
    // 例如: fullPath = '/posts/detail/:id', templatePattern = ':id'
    // prefix = '/posts/detail/'
    const idx = fullPath.indexOf(templatePattern)
    if (idx > 0) {
      const prefix = fullPath.slice(0, idx)
      effectiveTpl = tpl.prefix(prefix)
    } else {
      // 如果找不到模板在 fullPath 中的位置，直接用 fullPath 替代
      // 这种情况理论上不应该发生
      effectiveTpl = tpl.prefix(fullPath.replace(templatePattern, ''))
    }
  } else {
    // 绝对路径模板，应该与 fullPath 相同
    // 但如果不同，说明配置有问题，还是使用 fullPath
    effectiveTpl = tpl
  }

  return {
    pattern: templatePattern,
    fullPath,
    regex: effectiveTpl.regex,
    paramNames: effectiveTpl.paramNames,
    query: input.query,
    meta: input.meta,
    beforeEnter: input.beforeEnter,
    _isRoute: true as const,

    parse(pathStr: string): TParams | null {
      return effectiveTpl.parse(pathStr)
    },

    format(params: TParams): string {
      return effectiveTpl.format(params)
    }
  }
}
