/**
 * @rasenjs/router-html
 *
 * HTML/SSR 专用的路由组件
 *
 * 提供开箱即用的 SSR 路由组件：
 * - 静态渲染的 RouterView（无响应式）
 * - 静态 Link 组件（使用 <a> 元素）
 * - API 与 @rasenjs/router-dom 完全一致，实现同构代码
 *
 * @example
 * ```typescript
 * // 同构代码 - App.ts
 * import { createRouter, route } from '@rasenjs/router'
 * import { createRouterView, createRouterLink } from '@rasenjs/router-html' // SSR
 * // import { createRouterView, createRouterLink } from '@rasenjs/router-dom' // 客户端
 *
 * const routes = {
 *   home: route('/'),
 *   about: route('/about'),
 * }
 *
 * export function createApp(history) {
 *   const router = createRouter({ history, routes })
 *   const RouterView = createRouterView(router, {
 *     home: () => HomeView(),
 *     about: () => AboutView(),
 *   })
 *   const Link = createRouterLink(router)
 *   
 *   return () => div({},
 *     Link({ to: routes.home }, 'Home'),
 *     Link({ to: routes.about }, 'About'),
 *     RouterView()
 *   )
 * }
 * ```
 */

// Re-export everything from @rasenjs/router
export * from '@rasenjs/router'

// Import router types
import type { Router, RouteMatch } from '@rasenjs/router'
import type { Mountable } from '@rasenjs/core'
import type { StringHost } from '@rasenjs/html'

// Import HTML elements
import { a } from '@rasenjs/html'

// Import router component factories and types
import {
  createRouterLink as createRouterLinkFactory,
  layout,
  type ViewsConfig,
  type LayoutComponent
} from '@rasenjs/router/components'

// Re-export component types
export { layout, type ViewsConfig, type LayoutComponent }

/**
 * 创建 RouterView 组件（HTML/SSR 版）
 *
 * 静态渲染当前匹配的路由，无响应式
 * API 与 @rasenjs/router-dom 的 createRouterView 完全一致
 */
export function createRouterView<TRoutes extends Record<string, unknown>>(
  router: Router<TRoutes>,
  views: ViewsConfig<TRoutes, StringHost>,
  options: {
    default?: () => Mountable<StringHost>
  } = {}
): () => Mountable<StringHost> {
  // Build route fullPath -> view key mapping
  const routes = router.routes
  const routeToKey = new Map<string, string>()
  
  function collect(routeObj: any, prefix: string = '') {
    for (const key of Object.keys(routeObj)) {
      const routeValue = routeObj[key]
      const fullKey = prefix ? `${prefix}.${key}` : key
      
      if (routeValue && routeValue._isRoute === true) {
        // Use fullPath as key instead of route object
        routeToKey.set(routeValue.fullPath, fullKey)
      } else if (routeValue && typeof routeValue === 'object') {
        collect(routeValue, fullKey)
      }
    }
  }
  
  collect(routes, '')
  
  return () => {
    return (host: StringHost) => {
      // SSR mode: render once, no reactivity needed
      const matched = router.current
      
      if (matched?.route) {
        // Use fullPath instead of route object reference
        const viewKey = routeToKey.get(matched.route.fullPath) as keyof TRoutes
        
        if (viewKey && views[viewKey]) {
          const viewFactory = views[viewKey]
          // Check if it's a function
          if (typeof viewFactory === 'function') {
            // viewFactory returns Mountable directly
            const mountable = viewFactory(matched.params as any)
            mountable(host)
          }
        } else if (options.default) {
          // Use default view
          options.default()(host)
        }
      } else if (options.default) {
        // No matched route, use default view
        options.default()(host)
      }
      
      // SSR does not need unmount
      return undefined
    }
  }
}

/**
 * 创建 Link 组件（HTML/SSR 版）
 *
 * 使用 <a> 元素，渲染静态 href，无事件处理
 * API 与 @rasenjs/router-dom 的 createRouterLink 完全一致
 */
export function createRouterLink<TRoutes extends Record<string, unknown>>(router: Router<TRoutes>) {
  // HTML 的 a 元素 props 类型（与 DOM 兼容）
  type AnchorProps = {
    href?: string
    class?: string
    className?: string
    style?: Record<string, string | number>
    attrs?: Record<string, string | number | boolean>
    [key: string]: any
  }
  
  return createRouterLinkFactory<TRoutes, StringHost, AnchorProps>(router, a)
}

/**
 * @deprecated Use createRouterLink instead
 */
export const createLink = createRouterLink

/**
 * 创建 LeaveGuard 组件（HTML/SSR 版）
 *
 * SSR 中不需要离开守卫（无导航），但保持 API 一致性
 * 返回空组件
 */
export function createLeaveGuard<TRoutes extends Record<string, unknown>>(
  _router: Router<TRoutes>
): <Params extends Record<string, unknown> = Record<string, never>>(props: {
  guard: (to: RouteMatch, params: Params) => boolean | Promise<boolean>
  children?: Array<Mountable<StringHost>>
}) => Mountable<StringHost> {
  // SSR 中直接渲染 children，不需要守卫逻辑
  return (props) => {
    return (host: StringHost) => {
      // 直接挂载 children（如果有）
      if (props.children) {
        for (const child of props.children) {
          child(host)
        }
      }
      return undefined
    }
  }
}
