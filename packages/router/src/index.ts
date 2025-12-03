/**
 * @rasenjs/router
 * 
 * Headless router - Framework-agnostic routing
 */

export { route, template, template as tpl, isRouteInput, createRoute } from './route'
export { createRoutes, type TransformRoutes } from './routes'
export { createRouter } from './router'
export { createBrowserHistory, createHashHistory, createMemoryHistory } from './history'

export type {
  Route,
  RouteInput,
  RouteMatch,
  RouteOptions,
  RoutesConfig,
  QuerySchema,
  HistoryAdapter,
  Router,
  RouteParams,
  InferQueryParams
} from './types'

// Re-export Template type from shared
export type { Template } from '@rasenjs/shared'
