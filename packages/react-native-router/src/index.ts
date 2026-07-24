/**
 * @rasenjs/react-native-router
 * 
 * React Native 路由实现
 * 
 * 基于 @rasenjs/router + @rasenjs/react-native
 * 提供开箱即用的 RN 路由组件：
 * - createRouterView: 路由视图组件
 * - createRouterLink: 路由链接组件（使用 touchableOpacity）
 * - createLeaveGuard: 离开守卫组件
 * 
 * @example
 * ```typescript
 * import { createRouter, createMemoryHistory } from '@rasenjs/router'
 * import { createRouterView, createRouterLink } from '@rasenjs/react-native-router'
 * import { route } from '@rasenjs/router'
 * import { view, text } from '@rasenjs/react-native'
 * 
 * const routes = createRouter({
 *   home: route(),
 *   user: route('/:id'),
 * })
 * 
 * const history = createMemoryHistory()
 * const router = createRouter(routes, { history })
 * 
 * const RouterView = createRouterView(router, {
 *   home: () => view({}, text({}, 'Home')),
 *   user: (params) => view({}, text({}, `User: ${params.id}`)),
 * })
 * 
 * const Link = createRouterLink(router)
 * 
 * // 使用
 * view({},
 *   Link({ to: 'home' }, text({}, 'Home')),
 *   Link({ to: 'user', params: { id: '123' } }, text({}, 'User')),
 *   RouterView()
 * )
 * ```
 */

export * from '@rasenjs/router'

import {
  createRouterView as createRouterViewFactory,
  createRouterLink as createRouterLinkFactory,
  createLeaveGuard as createLeaveGuardFactory,
  makeRouterReactive,
  layout,
  type ViewsConfig,
  type LayoutComponent
} from '@rasenjs/router/components'

import { touchableOpacity } from '@rasenjs/react-native'
import { hostHooks } from '@rasenjs/react-native'
import type { Mountable } from '@rasenjs/core'
import type { Router } from '@rasenjs/router'
import type { Host } from '@rasenjs/react-native'
import type { TouchableOpacityProps } from '@rasenjs/react-native'

export { layout, makeRouterReactive, type ViewsConfig, type LayoutComponent }

export function createRouterView<TRoutes extends Record<string, unknown>>(
  router: Router<TRoutes>,
  views: ViewsConfig<TRoutes, Host>,
  options: {
    default?: () => Mountable<Host>
  } = {}
) {
  return createRouterViewFactory<TRoutes, Host, unknown>(router, views, {
    ...options,
    hostHooks
  })
}

export function createRouterLink<TRoutes extends Record<string, unknown>>(router: Router<TRoutes>) {
  return createRouterLinkFactory<TRoutes, Host, TouchableOpacityProps>(router, touchableOpacity)
}

export const createLink = createRouterLink

export function createLeaveGuard<TRoutes extends Record<string, unknown>>(router: Router<TRoutes>) {
  return createLeaveGuardFactory(router)
}
