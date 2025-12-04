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
  /** 单路由进入守卫 */
  beforeEnter?: BeforeEachCallback
}

/**
 * 路由定义输入（用户传入，基于 Template）
 */
export interface RouteInput<
  TParams extends Record<string, unknown> = Record<string, never>,
  TQuery extends QuerySchema = Record<string, never>,
  TMeta = unknown
> {
  readonly path: Template<TParams>
  readonly query?: TQuery
  readonly meta?: TMeta
  readonly beforeEnter?: BeforeEachCallback
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
  /** 单路由进入守卫 */
  readonly beforeEnter?: BeforeEachCallback
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
 * 路由配置对象
 */
export interface RouteConfig<
  TParams extends Record<string, unknown> = Record<string, never>,
  TQuery extends QuerySchema = Record<string, never>,
  TMeta = unknown
> {
  /** 路径模板或字符串 */
  readonly path?: Template<TParams> | string
  /** Query 参数 schema */
  readonly query?: TQuery
  /** 路由元数据 */
  readonly meta?: TMeta
  /** 单路由进入守卫 */
  readonly beforeEnter?: BeforeEachCallback
}

/**
 * 路由别名配置 - 指向另一个路由的不同 URL 模式
 */
export interface RouteAliasConfig<
  TParams extends Record<string, unknown> = Record<string, never>,
  TQuery extends QuerySchema = Record<string, never>,
  TMeta = unknown
> {
  /** 目标路由配置（实际的路由配置） */
  readonly alias: RouteConfig<TParams, TQuery, TMeta>
  /** 别名路径（访问这个路径会使用 alias 中的配置） */
  readonly path: Template<TParams> | string
}

/**
 * 嵌套路由配置
 * 支持多种格式：
 * 1. RouteInput（通过 route() 创建，向后兼容）
 * 2. Template 对象（直接使用 template 字面量）
 * 3. RouteConfig（推荐的对象格式，用 path 定义主路由）
 * 4. RouteAliasConfig（路由别名，用 alias 和 path 定义）
 * 5. string（字符串路径，如 '/home'）
 * 6. 嵌套的 RoutesConfig
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type RoutesConfig = {
  [key: string]: 
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    | RouteInput<any, any, any> 
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    | Template<any>
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    | RouteConfig<any, any, any>
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    | RouteAliasConfig<any, any, any>
    | string
    | RoutesConfig
}

/**
 * 判断是否为 RouteInput
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IsRouteInput<T> = T extends RouteInput<any, any, any> ? true : false

/**
 * 判断是否为 Template
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IsTemplate<T> = T extends Template<any> ? true : false

/**
 * 判断是否为 RouteConfig
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IsRouteConfig<T> = T extends RouteConfig<any, any, any> ? true : false

/**
 * 判断是否为 RouteAliasConfig
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IsRouteAliasConfig<T> = T extends RouteAliasConfig<any, any, any> ? true : false

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
export type FlattenRoutes<
  T extends RoutesConfig,
  Prefix extends string = ''
> = {
  [K in keyof T & string]: IsRouteInput<T[K]> extends true
    ? T[K] extends RouteInput<infer P, infer Q, infer M>
      ? { [Key in `${Prefix}${K}`]: Route<P, Q, M> }
      : never
    : IsTemplate<T[K]> extends true
      ? T[K] extends Template<infer P>
        ? { [Key in `${Prefix}${K}`]: Route<P, Record<string, never>, unknown> }
        : never
      : IsRouteConfig<T[K]> extends true
        ? T[K] extends RouteConfig<infer P, infer Q, infer M>
          ? { [Key in `${Prefix}${K}`]: Route<P, Q, M> }
          : never
        : IsRouteAliasConfig<T[K]> extends true
          ? T[K] extends RouteAliasConfig<infer P, infer Q, infer M>
            ? { [Key in `${Prefix}${K}`]: Route<P, Q, M> }
            : never
          : T[K] extends RoutesConfig
          ? FlattenRoutes<T[K], `${Prefix}${K}.`>
          : never
}[keyof T & string]

/**
 * 合并联合类型为交叉类型
 */
type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never

/**
 * 简化交叉类型的显示
 */
type Simplify<T> = { [K in keyof T]: T[K] }

/**
 * 从嵌套配置推导出扁平路由表类型
 */
export type InferRoutes<T extends RoutesConfig> = Simplify<
  UnionToIntersection<FlattenRoutes<T>>
>

/**
 * 将嵌套的路由配置转换为嵌套的 Route 对象结构
 */
export type TransformRoutes<T extends RoutesConfig> = {
  [K in keyof T]: T[K] extends RouteInput<infer P, infer Q, infer M>
    ? Route<P, Q, M>
    : T[K] extends Template<infer P>
      ? Route<P, Record<string, never>, unknown>
      : T[K] extends string
        ? Route<Record<string, never>, Record<string, never>, unknown>
        : T[K] extends { path: Template<infer P> }
          ? Route<P, Record<string, never>, unknown>
          : T[K] extends { path?: Template<infer P> }
            ? Route<P, Record<string, never>, unknown>
            : T[K] extends RouteConfig<infer P, infer Q, infer M>
              ? Route<P, Q, M>
              : T[K] extends RouteAliasConfig<infer P, infer Q, infer M>
                ? Route<P, Q, M>
                : T[K] extends RoutesConfig
                  ? TransformRoutes<T[K]>
                  : never
}

/**
 * 生成所有可能的路由键路径（用点分隔的嵌套路径）
 * 
 * @example
 * ```typescript
 * type Config = {
 *   home: RouteInput<{}>
 *   settings: {
 *     profile: RouteInput<{}>
 *     account: RouteInput<{}>
 *   }
 * }
 * 
 * type Keys = RouteKeys<TransformRoutes<Config>>
 * // 'home' | 'settings.profile' | 'settings.account'
 * ```
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type RouteKeys<T, Depth extends number = 5> = [Depth] extends [0]
  ? never
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  : T extends Route<any, any, any>
    ? never
    : {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        [K in keyof T & string]: T[K] extends Route<any, any, any>
          ? K
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          : T[K] extends Record<string, any>
            ? K | `${K}.${RouteKeys<T[K], [-1, 0, 1, 2, 3, 4][Depth]>}`
            : never
      }[keyof T & string]

/**
 * 根据路由键路径获取对应的 Route 类型
 * 
 * @example
 * ```typescript
 * type R = GetRouteByKey<TransformRoutes<Config>, 'settings.profile'>
 * // Route<{}, {}, unknown>
 * ```
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type GetRouteByKey<T, K extends string> = K extends `${infer First}.${infer Rest}`
  ? First extends keyof T
    ? GetRouteByKey<T[First], Rest>
    : never
  : K extends keyof T
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    ? T[K] extends Route<any, any, any>
      ? T[K]
      : never
    : never

/**
 * 路由匹配结果
 */
export interface RouteMatch<
  TParams extends Record<string, unknown> = Record<string, unknown>,
  TQuery extends Record<string, unknown> = Record<string, unknown>,
  TMeta = unknown
> {
  /** 匹配的路由对象 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: Route<any, any, any>
  /** 解析后的路径参数 */
  params: TParams
  /** 解析后的 query 参数 */
  query: TQuery
  /** 合并后的 meta 信息（包含父路由的 meta） */
  meta: TMeta
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
  /** 在历史记录中前进/后退 n 步 */
  go(n: number): void
  /** 订阅路径变化 */
  subscribe(listener: (path: string) => void): () => void
}

/**
 * 从 Route 提取参数类型
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type RouteParams<T extends Route<any, any, any>> =
  T extends Route<infer P, any, any> ? P : never
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * 导航选项
 */
export interface NavigateOptions<
  TParams extends Record<string, unknown> = Record<string, never>,
  TQuery extends QuerySchema = Record<string, never>
> {
  /** 路径参数 */
  params?: TParams extends Record<string, never> ? never : TParams
  /** Query 参数 */
  query?: Partial<InferQueryParams<TQuery>>
}

/**
 * 判断 options 是否必需
 * - 如果 params 非空或 query 非空，则 options 必需
 * - 否则 options 可选
 */
export type IsOptionsRequired<
  TParams extends Record<string, unknown>,
  TQuery extends QuerySchema
> = TParams extends Record<string, never>
  ? TQuery extends Record<string, never>
    ? false
    : true
  : true

// ============================================================================
// 导航错误
// ============================================================================

/**
 * 导航取消错误
 *
 * 用于表示导航被主动取消（不是真的出错）
 *
 * @example
 * ```typescript
 * router.beforeEach((to, from) => {
 *   if (!confirm('确定离开？')) {
 *     throw new NavigationAbortedError('用户取消')
 *   }
 * })
 *
 * // 或者返回 false / string，内部会自动包装
 * router.beforeEach((to, from) => {
 *   if (!confirm('确定离开？')) {
 *     return false  // 等同于 throw new NavigationAbortedError()
 *   }
 *   return '用户取消'  // 等同于 throw new NavigationAbortedError('用户取消')
 * })
 * ```
 */
export class NavigationAbortedError extends Error {
  constructor(message = 'Navigation aborted') {
    super(message)
    this.name = 'NavigationAbortedError'
  }
}

// ============================================================================
// 全局钩子类型
// ============================================================================

/**
 * 导航守卫返回值
 * - void / undefined / true: 允许导航
 * - false: 取消导航 → 内部包装为 NavigationAbortedError
 * - string: 取消导航，带消息 → 内部包装为 NavigationAbortedError(message)
 * - Route: 重定向到另一个路由
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type NavigationGuardReturn =
  | boolean
  | Route<any, any, any>
  | string
  | void
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * beforeEach 回调函数
 * 可以返回 false 取消导航，返回字符串作为错误消息，返回 Route 进行重定向，或返回 true/undefined 继续导航
 */
export type BeforeEachCallback = (
  to: RouteMatch,
  from: RouteMatch | null
) => NavigationGuardReturn | Promise<NavigationGuardReturn>

/**
 * beforeLeave 回调函数
 * 与 BeforeEachCallback 相同签名
 */
export type BeforeLeaveCallback = BeforeEachCallback

/**
 * afterEach 回调函数
 */
export type AfterEachCallback = (
  to: RouteMatch,
  from: RouteMatch | null
) => void

/**
 * onError 回调函数
 */
export type OnErrorCallback = (
  error: Error,
  to: RouteMatch | null,
  from: RouteMatch | null
) => void

// ============================================================================
// Router 接口
// ============================================================================

/**
 * Router 实例接口
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export interface Router<TRoutes = Record<string, any>> {
  /** 路由配置 */
  readonly routes: TRoutes

  /** 匹配路径 */
  match(path: string): RouteMatch | null

  /* eslint-disable @typescript-eslint/no-explicit-any */
  /** 生成 href - 通过 Route 对象（无 params 时 options 可选）*/
  href<Q extends QuerySchema = Record<string, never>>(
    route: Route<Record<string, never>, Q, any>,
    options?: NavigateOptions<Record<string, never>, Q>
  ): string
  
  /** 生成 href - 通过 Route 对象（有 params 时 options 必需）*/
  href<
    P extends Record<string, unknown>,
    Q extends QuerySchema = Record<string, never>
  >(
    route: Route<P, Q, any>,
    options: NavigateOptions<P, Q>
  ): string
  
  /** 生成 href - 通过路由键字符串 */
  href(
    key: RouteKeys<TRoutes> extends string ? RouteKeys<TRoutes> : never,
    ...args: any[]
  ): string

  /** 导航 - 通过 Route 对象（无 params 时 options 可选）*/
  push<Q extends QuerySchema = Record<string, never>>(
    route: Route<Record<string, never>, Q, any>,
    options?: NavigateOptions<Record<string, never>, Q>
  ): Promise<void>
  
  /** 导航 - 通过 Route 对象（有 params 时 options 必需）*/
  push<
    P extends Record<string, unknown>,
    Q extends QuerySchema = Record<string, never>
  >(
    route: Route<P, Q, any>,
    options: NavigateOptions<P, Q>
  ): Promise<void>

  /** 导航 - 通过路由键字符串 */
  push(
    key: RouteKeys<TRoutes> extends string ? RouteKeys<TRoutes> : never,
    ...args: any[]
  ): Promise<void>

  /** 替换导航 - 通过 Route 对象（无 params 时 options 可选）*/
  replace<Q extends QuerySchema = Record<string, never>>(
    route: Route<Record<string, never>, Q, any>,
    options?: NavigateOptions<Record<string, never>, Q>
  ): Promise<void>
  
  /** 替换导航 - 通过 Route 对象（有 params 时 options 必需）*/
  replace<
    P extends Record<string, unknown>,
    Q extends QuerySchema = Record<string, never>
  >(
    route: Route<P, Q, any>,
    options: NavigateOptions<P, Q>
  ): Promise<void>

  /** 替换导航 - 通过路由键字符串 */
  replace(
    key: RouteKeys<TRoutes> extends string ? RouteKeys<TRoutes> : never,
    ...args: any[]
  ): Promise<void>
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /** 在历史记录中前进/后退 n 步 */
  go(n: number): void

  /** 后退一步 */
  back(): void

  /** 前进一步 */
  forward(): void

  /** 获取当前匹配 */
  readonly current: RouteMatch | null

  // ========== 全局钩子 ==========

  /** 注册前置守卫，返回取消函数 */
  beforeEach(callback: BeforeEachCallback): () => void

  /** 注册离开守卫，返回取消函数 */
  beforeLeave(callback: BeforeLeaveCallback): () => void

  /** 注册后置钩子，返回取消函数 */
  afterEach(callback: AfterEachCallback): () => void

  /** 注册错误处理器，返回取消函数 */
  onError(callback: OnErrorCallback): () => void

  /** 销毁路由，清理资源（如 history 订阅） */
  destroy(): void

  /** 导航是否进行中 */
  readonly isNavigating: boolean
}
