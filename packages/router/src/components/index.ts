/**
 * @rasenjs/router/components
 * 
 * Platform-agnostic router components
 * 
 * 完全平台无关：可用于 DOM、React Native、Canvas 等任何渲染目标
 * 使用 data 属性（如 data-active）代替 class，更抽象
 * 使用 core 的 switch 组件实现 RouterView
 */

import { switchCase, type SwitchHostHooks, type Mountable } from '@rasenjs/core'
import type { Router, Route } from '../types'

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
  onClick: (e: { preventDefault: () => void; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) => void
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
 * Link 组件 Props（基础版）
 */
export interface LinkPropsBase<P extends Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  to: Route<P, any, any>
  params: P
}

/**
 * Link 组件 Props（带 children）
 */
export interface LinkProps<P extends Record<string, unknown>, Host = unknown> extends LinkPropsBase<P> {
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
 * const routes = createRoutes({
 *   home: route(),
 *   user: route(tpl`/users/${{ id: z.string() }}`),
 * })
 * 
 * const Link = createRouterLink(router, a)
 * 
 * // 使用方式 1：children 属性
 * Link({ to: routes.home, params: {}, children: ['Home'] })
 * 
 * // 使用方式 2：rest 参数
 * Link({ to: routes.user, params: { id: '123' } }, 'User')
 * ```
 */
export function createRouterLink<Host>(
  router: Router,
  Anchor: Anchor<Host>
) {
  return function Link<P extends Record<string, unknown>>(
    props: LinkProps<P, Host>,
    ...restChildren: Array<Child<Host>>
  ): Mountable<Host> {
    const { to: route, params, children: propsChildren } = props

    // 支持两种方式：props.children 或 rest 参数
    const children = propsChildren ?? restChildren

    const href = router.href(route, params)

    // 点击处理
    const onClick = (e: { preventDefault: () => void; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return
      }
      e.preventDefault()
      router.push(route, params)
    }

    // 响应式的 isActive
    const isActive = () => router.current?.route === route

    return Anchor({ href, dataActive: isActive, onClick }, ...children)
  }
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
export type LayoutComponent<Host> = (children: () => Mountable<Host>) => Mountable<Host>

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
 * @param router - 路由器实例
 * @param routes - 路由配置（来自 createRoutes）
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
 * const RouterView = createRouterView(router, routes, {
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
export function createRouterView<TRoutes extends object, Host, N = unknown>(
  router: Router,
  routes: TRoutes,
  views: ViewsConfig<TRoutes, Host>,
  options: {
    default?: () => Mountable<Host>
    hooks?: SwitchHostHooks<Host, N>
  } = {}
) {
  // 收集所有 Route 到视图的映射
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeToView = new Map<Route<any, any, any>, (params: any) => Mountable<Host>>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeToKey = new Map<Route<any, any, any>, string>()
  // 收集每个路由所在层级的布局
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeToLayouts = new Map<Route<any, any, any>, LayoutComponent<Host>[]>()
  
  // 递归遍历 routes 和 views
  function collect(
    routeObj: object,
    viewObj: object,
    prefix: string = '',
    parentLayouts: LayoutComponent<Host>[] = []
  ) {
    // 检查当前层级是否有 layout
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentLayout = (viewObj as any)[layout] as LayoutComponent<Host> | undefined
    const layouts = currentLayout ? [...parentLayouts, currentLayout] : parentLayouts
    
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
      } else if (routeValue && typeof routeValue === 'object' && viewValue && typeof viewValue === 'object') {
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
      default: options.default,
      ...options.hooks
    })
  }
}
