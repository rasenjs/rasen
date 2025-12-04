/**
 * @rasenjs/router/components
 *
 * Platform-agnostic router components
 *
 * 完全平台无关：可用于 DOM、React Native、Canvas 等任何渲染目标
 * 使用 data 属性（如 data-active）代替 class，更抽象
 * 使用 core 的 switch 组件实现 RouterView
 */

import { switchCase, getReactiveRuntime, type SwitchHostHooks, type Mountable } from '@rasenjs/core'
import type { 
  Router, 
  Route, 
  RouteMatch,
  QuerySchema,
  InferQueryParams
} from '../types'

// ============================================================================
// 响应式包装
// ============================================================================

/**
 * 为路由创建响应式包装（可选）
 * 
 * 如果存在响应式运行时，会创建一个 ref 来存储当前匹配，
 * 这样 RouterView 可以自动响应路由变化。
 * 
 * @example
 * ```typescript
 * const router = createRouter(routes, { history })
 * const reactiveRouter = makeRouterReactive(router)
 * 
 * const RouterView = createRouterView(reactiveRouter, views)
 * ```
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function makeRouterReactive<TRoutes extends Record<string, any>>(
  router: Router<TRoutes>
): Router<TRoutes> {
  const runtime = getReactiveRuntime()
  if (!runtime) {
    // 没有响应式运行时，直接返回原路由
    return router
  }

  // 创建响应式的当前匹配
  const currentMatchRef = runtime.ref<RouteMatch | null>(null)
  
  // 初始化
  currentMatchRef.value = router.current

  // 监听所有路由变化
  router.afterEach((to) => {
    currentMatchRef.value = to
  })

  // 返回一个代理对象，让 current 返回响应式值
  return {
    ...router,
    get current() {
      return currentMatchRef.value
    }
  }
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 子元素类型
 */
export type Child<Host> = string | Mountable<Host>

/**
 * 锚点组件的 Props
 * 使用 dataActive 代替 class，更平台无关
 */
export interface AnchorProps {
  href: string
  /** 是否处于激活状态（响应式） */
  dataActive?: boolean | (() => boolean)
  /** 点击处理 */
  onClick: (e: {
    preventDefault: () => void
    metaKey?: boolean
    ctrlKey?: boolean
    shiftKey?: boolean
    altKey?: boolean
  }) => void
}

/**
 * 锚点组件
 *
 * 接受 (props, ...children) 或 (...args) 形式
 * 与 @rasenjs/dom 的 a 组件兼容
 */
export type Anchor<Host> = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => Mountable<Host>

// ============================================================================
// Link 组件
// ============================================================================

/**
 * Link 组件 Props
 * 
 * 支持两种导航方式，具有完整的类型推断：
 * 1. 通过 Route 对象（类型安全）- params 根据 Route 的参数类型自动可选/必需
 * 2. 通过字符串路由键（类型安全）- params 根据实际传入自动可选/必需
 */

/** Link Props - 通过 Route 对象（无参数或自动判断） */
export interface LinkPropsRoute<
  P extends Record<string, unknown> = Record<string, never>,
  Q extends QuerySchema = Record<string, never>,
  Host = unknown
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  to: Route<P, Q, any>
  params?: P extends Record<string, never> ? never : P
  query?: Partial<InferQueryParams<Q>>
  children?: Array<Child<Host>>
}

/** Link Props - 通过字符串键（无参数） */
export interface LinkPropsKey<Host = unknown> {
  to: string
  params?: never
  query?: Record<string, unknown>
  children?: Array<Child<Host>>
}

/** Link Props - 通过字符串键（有参数） */
export interface LinkPropsKeyWithParams<Host = unknown> {
  to: string
  params: Record<string, unknown>
  query?: Record<string, unknown>
  children?: Array<Child<Host>>
}

/**
 * 创建 Link 组件
 *
 * @param router - 路由器实例
 * @param Anchor - 锚点组件（需要支持 data-active 属性）
 *
 * @example
 * ```typescript
 * const router = createRouter({
 *   home: '/',
 *   user: tpl`/users/${{ id: z.string() }}`,
 * })
 *
 * const Link = createRouterLink(router, a)
 *
 * // 通过 Route 对象：无参数时 params 可选
 * Link({ to: routes.home, children: ['Home'] })
 *
 * // 通过 Route 对象：有参数时 params 必需
 * Link({ to: routes.user, params: { id: '123' } }, 'User')
 *
 * // 通过字符串键
 * Link({ to: 'home', children: ['Home'] })
 * Link({ to: 'user', params: { id: '123' } }, 'User')
 * ```
 */
export function createRouterLink<TRoutes extends Record<string, unknown>, Host>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: Router<TRoutes>,
  Anchor: Anchor<Host>
) {
  // 重载签名 - 顺序很重要，更具体的重载应该在前面
  
  function Link(
    props: LinkPropsKeyWithParams<Host>,
    ...restChildren: Array<Child<Host>>
  ): Mountable<Host>

  function Link(
    props: LinkPropsKey<Host>,
    ...restChildren: Array<Child<Host>>
  ): Mountable<Host>

  function Link<
    P extends Record<string, unknown>,
    Q extends QuerySchema = Record<string, never>
  >(
    props: LinkPropsRoute<P, Q, Host>,
    ...restChildren: Array<Child<Host>>
  ): Mountable<Host>

  // 实现
  function Link(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: any,
    ...restChildren: Array<Child<Host>>
  ): Mountable<Host> {
    const { to, params, query, children: propsChildren } = props

    // 支持两种方式：props.children 或 rest 参数
    const children = propsChildren ?? restChildren

    // 构建 options
    const options = params !== undefined || query !== undefined
      ? { params, query }
      : undefined

    // 生成 href
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const href = (router.href as any)(to, options)

    // 点击处理
    const onClick = (e: {
      preventDefault: () => void
      metaKey?: boolean
      ctrlKey?: boolean
      shiftKey?: boolean
      altKey?: boolean
    }) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return
      }
      e.preventDefault()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(router.push as any)(to, options)
    }

    // 响应式的 isActive
    const isActive = () => {
      if (!router.current) return false
      if (typeof to === 'string') {
        // 字符串键暂不支持精确匹配判断，后续可改进
        return false
      }
      return router.current.route === to
    }

    return Anchor({ href, dataActive: isActive, onClick }, ...children)
  }

  return Link
}

// Alias for backward compatibility
export const createLink = createRouterLink

// ============================================================================
// RouterView 组件
// ============================================================================

/**
 * Layout Symbol - 用于在嵌套视图配置中定义布局组件
 */
export const layout = Symbol('router-layout')

/**
 * Layout 组件类型
 * 接收 children（子路由视图）作为参数
 */
export type LayoutComponent<Host> = (
  children: () => Mountable<Host>
) => Mountable<Host>

/**
 * 从 Route 结构生成 Views 配置类型
 *
 * @example
 * ```typescript
 * const routes = createRoutes({
 *   home: route(),
 *   user: route(tpl`/users/${{ id: z.string() }}`),
 *   posts: {
 *     list: route(),
 *     detail: route(tpl`${{ id: z.coerce.number() }}`),
 *   }
 * })
 *
 * // ViewsConfig 将是：
 * // {
 * //   home: () => Mountable<Host>
 * //   user: (params: { id: string }) => Mountable<Host>
 * //   posts: {
 * //     [layout]?: (children) => Mountable<Host>  // 可选布局
 * //     list: () => Mountable<Host>
 * //     detail: (params: { id: number }) => Mountable<Host>
 * //   }
 * // }
 * ```
 */
export type ViewsConfig<TRoutes, Host> = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  [K in keyof TRoutes]: TRoutes[K] extends Route<infer P, infer _Q, infer _M>
    ? keyof P extends never
      ? () => Mountable<Host>
      : (params: P) => Mountable<Host>
    : TRoutes[K] extends object
      ? ViewsConfig<TRoutes[K], Host> & { [layout]?: LayoutComponent<Host> }
      : never
}

/**
 * 创建 RouterView 组件
 *
 * 使用 core 的 switch 组件实现多分支渲染
 * 支持通过 [layout] Symbol 定义嵌套布局
 *
 * @param router - 路由器实例（包含 routes 配置）
 * @param views - 与 routes 结构匹配的视图配置
 * @param options.default - 默认视图（无匹配时）
 * @param options.hooks - 平台操作钩子
 *
 * @example
 * ```typescript
 * import { layout } from '@rasenjs/router/components'
 *
 * const routes = createRoutes({
 *   home: route(),
 *   dashboard: {
 *     overview: route(),
 *     settings: route(),
 *   }
 * })
 *
 * const router = createRouter(routes, { history })
 *
 * const RouterView = createRouterView(router, {
 *   home: () => HomeView(),
 *   dashboard: {
 *     // 布局组件：包裹所有 dashboard 子路由
 *     [layout]: (children) => DashboardLayout({ children }),
 *     overview: () => OverviewView(),
 *     settings: () => SettingsView(),
 *   }
 * }, {
 *   default: () => NotFoundView(),
 * })
 *
 * // 使用
 * div({}, RouterView())
 * ```
 */
export function createRouterView<TRoutes extends Record<string, unknown>, Host = unknown, N = unknown>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: Router<TRoutes>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  views: ViewsConfig<TRoutes, Host> & Record<string, any>,
  options?: {
    default?: () => Mountable<Host>
    hostHooks?: SwitchHostHooks<Host, N>
  }
): () => Mountable<Host> {
  // 从 router 获取 routes 配置
  const routes = router.routes

  /* eslint-disable @typescript-eslint/no-explicit-any */
  // 收集所有 Route 到视图的映射
  const routeToView = new Map<
    Route<any, any, any>,
    (params: any) => Mountable<Host>
  >()
  const routeToKey = new Map<Route<any, any, any>, string>()
  // 收集每个路由所在层级的布局
  const routeToLayouts = new Map<
    Route<any, any, any>,
    LayoutComponent<Host>[]
  >()
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // 递归遍历 routes 和 views
  function collect(
    routeObj: object,
    viewObj: object,
    prefix: string = '',
    parentLayouts: LayoutComponent<Host>[] = []
  ) {
    // 检查当前层级是否有 layout
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentLayout = (viewObj as any)[layout] as
      | LayoutComponent<Host>
      | undefined
    const layouts = currentLayout
      ? [...parentLayouts, currentLayout]
      : parentLayouts

    for (const key of Object.keys(routeObj)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const routeValue = (routeObj as any)[key]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewValue = (viewObj as any)[key]

      const fullKey = prefix ? `${prefix}.${key}` : key

      if (routeValue && routeValue._isRoute === true) {
        // 这是一个 Route
        if (typeof viewValue === 'function') {
          routeToView.set(routeValue, viewValue)
          routeToKey.set(routeValue, fullKey)
          routeToLayouts.set(routeValue, layouts)
        }
      } else if (
        routeValue &&
        typeof routeValue === 'object' &&
        viewValue &&
        typeof viewValue === 'object'
      ) {
        // 嵌套对象
        collect(routeValue, viewValue, fullKey, layouts)
      }
    }
  }

  collect(routes, views, '', [])

  // 包装视图，应用所有父级布局（从外到内）
  function wrapWithLayouts(
    viewFactory: () => Mountable<Host>,
    layouts: LayoutComponent<Host>[]
  ): Mountable<Host> {
    if (layouts.length === 0) {
      return viewFactory()
    }

    // 从内到外包装
    let wrapped = viewFactory
    for (let i = layouts.length - 1; i >= 0; i--) {
      const layoutFn = layouts[i]
      const inner = wrapped
      wrapped = () => layoutFn(inner)
    }

    return wrapped()
  }

  return function RouterView(): Mountable<Host> {
    // 构建 switch 的 cases
    const cases: Record<string, () => Mountable<Host>> = {}

    for (const [route, viewFactory] of routeToView) {
      const key = routeToKey.get(route)!
      const layouts = routeToLayouts.get(route) || []

      cases[key] = () => {
        const match = router.current
        const params = match?.params ?? {}
        return wrapWithLayouts(() => viewFactory(params), layouts)
      }
    }

    return switchCase({
      value: () => {
        const currentRoute = router.current?.route
        if (!currentRoute) return undefined
        return routeToKey.get(currentRoute)
      },
      cases,
      default: options?.default,
      ...options?.hostHooks
    })
  }
}

// ============================================================================
// LeaveGuard 组件
// ============================================================================

/**
 * LeaveGuard Props
 */
export interface LeaveGuardProps {
  /**
   * 守卫函数
   * 返回 true 允许导航，返回 false 或 string 取消导航
   */
  guard: (
    to: RouteMatch,
    from: RouteMatch | null
  ) => boolean | string | void | Promise<boolean | string | void>
}

/**
 * 创建 leaveGuard 组件
 *
 * 在组件挂载时注册离开守卫，卸载时自动移除
 * 守卫只在**离开当前页面**时触发，不会在进入时触发
 *
 * @param router - 路由器实例
 *
 * @example
 * ```typescript
 * const leaveGuard = createLeaveGuard(router)
 *
 * function SettingsView(): Mountable<HTMLElement> {
 *   const formDirty = ref(false)
 *
 *   return div(
 *     leaveGuard({
 *       guard: (to, from) => {
 *         if (formDirty.value) {
 *           return confirm('有未保存的更改，确定离开？')
 *         }
 *         return true
 *       }
 *     }),
 *     form(...)
 *   )
 * }
 * ```
 */
export function createLeaveGuard<TRoutes extends Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: Router<TRoutes>
): (props: LeaveGuardProps) => Mountable<unknown> {
  return function leaveGuard(props: LeaveGuardProps): Mountable<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mountFn = (_host: any) => {
      // 记录挂载时的路由（这是我们要保护的页面）
      const mountedRoute = router.current?.route

      // mount：注册到 beforeLeave
      const unregister = router.beforeLeave((to, from) => {
        // 只有当离开的是挂载时的路由时才触发守卫
        if (from?.route === mountedRoute) {
          return props.guard(to, from)
        }
        // 其他情况允许导航
        return true
      })

      // unmount：取消注册
      return unregister
    }
    return mountFn as unknown as Mountable<unknown>
  }
}
