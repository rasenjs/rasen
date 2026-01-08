/**
 * @rasenjs/router
 *
 * Headless router - Framework-agnostic routing
 */

export {
  route,
  template,
  template as tpl,
  isRouteInput,
  createRoute
} from './route'
export { createRouter } from './router'
export {
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory
} from './history'

export type {
  Route,
  RouteInput,
  RouteConfig,
  RouteMatch,
  RouteOptions,
  RoutesConfig,
  QuerySchema,
  HistoryAdapter,
  Router,
  RouteParams,
  InferQueryParams,
  // 钩子类型
  BeforeEachCallback,
  NavigationGuardReturn,
  BeforeLeaveCallback,
  AfterEachCallback,
  OnErrorCallback
} from './types'

// 导出错误类
export { NavigationAbortedError } from './types'

// Re-export Template type from core/utils
export type { Template } from '@rasenjs/core/utils'

