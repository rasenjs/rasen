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

// Import match host hooks for SSR
import { matchHostHooks } from '@rasenjs/html'

// Import router component factories and types
import {
  createRouterView as createRouterViewFactory,
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
 * 静态渲染当前匹配的路由，但输出 match 标记以支持客户端水合
 * API 与 @rasenjs/router-dom 的 createRouterView 完全一致
 * 
 * 内部使用 @rasenjs/router 的 createRouterView 工厂 + SSR match hooks
 * match 组件会自动处理 marker 的插入，无需手动管理
 */
export function createRouterView<TRoutes extends Record<string, unknown>>(
  router: Router<TRoutes>,
  views: ViewsConfig<TRoutes, StringHost>,
  options: {
    default?: () => Mountable<StringHost>
  } = {}
): () => Mountable<StringHost> {
  return createRouterViewFactory<TRoutes, StringHost, string>(router, views, {
    ...options,
    hostHooks: matchHostHooks
  })
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
