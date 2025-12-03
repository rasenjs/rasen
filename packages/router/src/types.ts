/**
 * @rasenjs/router - Types
 */

import type { ZodType } from 'zod'
import type { Template } from '@rasenjs/shared'

/**
 * Query 参数 Schema
 */
export type QuerySchema = Record<string, ZodType>

/**
 * 路由选项
 */
export interface RouteOptions<
  TQuery extends QuerySchema = Record<string, never>,
  TMeta = unknown
> {
  /** Query 参数 schema */
  query?: TQuery
  /** 路由元数据 */
  meta?: TMeta
}

/**
 * 路由定义输入（用户传入，基于 Template）
 */
export interface RouteInput<
  TParams extends Record<string, unknown> = Record<string, never>,
  TQuery extends QuerySchema = Record<string, never>,
  TMeta = unknown
> {
  readonly template: Template<TParams>
  readonly query?: TQuery
  readonly meta?: TMeta
  readonly _isRouteInput: true
}

/**
 * 路由定义（处理后）
 */
export interface Route<
  TParams extends Record<string, unknown> = Record<string, never>,
  TQuery extends QuerySchema = Record<string, never>,
  TMeta = unknown
> {
  /** 路径模式（用于调试） */
  readonly pattern: string
  /** 完整路径模式 */
  readonly fullPath: string
  /** 正则表达式 */
  readonly regex: RegExp
  /** 路径参数名列表 */
  readonly paramNames: string[]
  /** Query 参数 schema */
  readonly query?: TQuery
  /** 路由元数据 */
  readonly meta?: TMeta
  /** 内部标记 */
  readonly _isRoute: true
  
  /** 解析路径，返回参数 */
  parse(path: string): TParams | null
  /** 格式化参数为路径 */
  format(params: TParams): string
}

/**
 * 从 Query Schema 推断参数类型
 */
export type InferQueryParams<T extends QuerySchema> = {
  [K in keyof T]: T[K] extends ZodType<infer V> ? V : never
}

/**
 * 嵌套路由配置
 */
export type RoutesConfig = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: RouteInput<any, any, any> | RoutesConfig
}

/**
 * 判断是否为 RouteInput
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IsRouteInput<T> = T extends RouteInput<any, any, any> ? true : false

/**
 * 将嵌套的路由配置扁平化为路由表类型
 * 
 * @example
 * ```typescript
 * type Config = {
 *   home: RouteInput<{}>
 *   posts: {
 *     list: RouteInput<{}>
 *     detail: RouteInput<{ id: string }>
 *   }
 * }
 * 
 * type Flat = FlattenRoutes<Config>
 * // = {
 * //   home: Route<{}>
 * //   'posts.list': Route<{}>
 * //   'posts.detail': Route<{ id: string }>
 * // }
 * ```
 */
export type FlattenRoutes<T extends RoutesConfig, Prefix extends string = ''> = {
  [K in keyof T & string]: IsRouteInput<T[K]> extends true
    ? T[K] extends RouteInput<infer P, infer Q, infer M>
      ? { [Key in `${Prefix}${K}`]: Route<P, Q, M> }
      : never
    : T[K] extends RoutesConfig
      ? FlattenRoutes<T[K], `${Prefix}${K}.`>
      : never
}[keyof T & string]

/**
 * 合并联合类型为交叉类型
 */
type UnionToIntersection<U> = 
  (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void 
    ? I 
    : never

/**
 * 简化交叉类型的显示
 */
type Simplify<T> = { [K in keyof T]: T[K] }

/**
 * 从嵌套配置推导出扁平路由表类型
 */
export type InferRoutes<T extends RoutesConfig> = Simplify<UnionToIntersection<FlattenRoutes<T>>>

/**
 * 路由匹配结果
 */
export interface RouteMatch<
  TParams extends Record<string, unknown> = Record<string, unknown>,
  TQuery extends Record<string, unknown> = Record<string, unknown>
> {
  /** 匹配的路由对象 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: Route<any, any, any>
  /** 解析后的路径参数 */
  params: TParams
  /** 解析后的 query 参数 */
  query: TQuery
  /** 匹配的路径 */
  path: string
}

/**
 * History 适配器接口
 */
export interface HistoryAdapter {
  /** 获取当前路径 */
  getPath(): string
  /** 导航到新路径 */
  push(path: string): void
  /** 替换当前路径 */
  replace(path: string): void
  /** 订阅路径变化 */
  subscribe(listener: (path: string) => void): () => void
}

/**
 * 从 Route 提取参数类型
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteParams<T extends Route<any, any, any>> =
  T extends Route<infer P, any, any> ? P : never

/**
 * 导航选项
 */
export interface NavigateOptions<TQuery extends QuerySchema = Record<string, never>> {
  /** Query 参数 */
  query?: Partial<InferQueryParams<TQuery>>
}

/**
 * Router 实例接口
 */
export interface Router {
  /** 匹配路径 */
  match(path: string): RouteMatch | null

  /** 生成 href */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  href<P extends Record<string, unknown>, Q extends QuerySchema = Record<string, never>>(
    route: Route<P, Q, any>,
    params: P,
    options?: NavigateOptions<Q>
  ): string

  /** 导航 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  push<P extends Record<string, unknown>, Q extends QuerySchema = Record<string, never>>(
    route: Route<P, Q, any>,
    params: P,
    options?: NavigateOptions<Q>
  ): void

  /** 替换导航 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replace<P extends Record<string, unknown>, Q extends QuerySchema = Record<string, never>>(
    route: Route<P, Q, any>,
    params: P,
    options?: NavigateOptions<Q>
  ): void

  /** 订阅路由变化 */
  subscribe(listener: (match: RouteMatch | null) => void): () => void

  /** 获取当前匹配 */
  readonly current: RouteMatch | null
}
