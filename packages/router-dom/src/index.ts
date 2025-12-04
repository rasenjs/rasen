/**
 * @rasenjs/router-dom
 *
 * DOM 专用的路由组件
 *
 * 提供开箱即用的 DOM 路由组件：
 * - 自动注入 DOM 操作钩子
 * - 预配置的 Link 组件（使用 <a> 元素）
 * - 预配置的 RouterView 组件（使用 DOM switchCase）
 *
 * @example
 * ```typescript
 * import { createRouter, createRoutes, route, tpl } from '@rasenjs/router'
 * import { createRouterView, createLink, layout } from '@rasenjs/router-dom'
 *
 * const routes = createRoutes({
 *   home: route(),
 *   about: route('/about'),
 * })
 *
 * const router = createRouter(routes, { history })
 *
 * const RouterView = createRouterView(router, {
 *   home: () => HomeView(),
 *   about: () => AboutView(),
 * })
 *
 * const Link = createLink(router)
 *
 * // 使用
 * div({},
 *   Link({ to: routes.home, params: {} }, 'Home'),
 *   Link({ to: routes.about, params: {} }, 'About'),
 *   RouterView()
 * )
 * ```
 */

// Re-export everything from @rasenjs/router
export * from '@rasenjs/router'

// Import router component factories
import {
  createRouterView as createRouterViewFactory,
  createRouterLink as createRouterLinkFactory,
  createLeaveGuard as createLeaveGuardFactory,
  layout,
  type ViewsConfig,
  type LayoutComponent,
  type LinkProps
} from '@rasenjs/router/components'

// Import DOM-specific things
import { a } from '@rasenjs/dom'
import { hostHooks } from '@rasenjs/dom'
import type { Mountable } from '@rasenjs/core'
import type { Router } from '@rasenjs/router'

// Import scroll restoration
import { useScrollRestoration, type ScrollPosition } from './scroll-restoration'

// Re-export component types and scroll restoration types
export { layout, type ViewsConfig, type LayoutComponent, type LinkProps }
export { useScrollRestoration, type ScrollPosition }

/**
 * 创建 RouterView 组件（DOM 版）
 *
 * 自动注入 DOM 操作钩子，无需手动配置
 */
export function createRouterView<TRoutes extends object>(
  router: Router,
  views: ViewsConfig<TRoutes, HTMLElement>,
  options: {
    default?: () => Mountable<HTMLElement>
  } = {}
) {
  return createRouterViewFactory<HTMLElement, Node>(router, views, {
    ...options,
    hostHooks
  })
}

/**
 * 创建 Link 组件（DOM 版）
 *
 * 使用 <a> 元素作为锚点，自动处理 data-active 属性
 */
export function createLink(router: Router) {
  return createRouterLinkFactory<HTMLElement>(router, a)
}

// Alias for compatibility
export const createRouterLink = createLink

/**
 * 创建 LeaveGuard 组件（DOM 版）
 *
 * 与 router 版本相同，因为不需要 DOM 特定操作
 */
export function createLeaveGuard(router: Router) {
  return createLeaveGuardFactory(router)
}
