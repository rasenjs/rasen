/**
 * @rasenjs/lynx — Rasen renderer for Lynx (main-thread rendering)
 *
 * Renders Rasen's three-phase components onto the Lynx element tree by
 * calling the Element PAPIs directly. Structural components (each/when/
 * match) work through core's HostHooks contract with pure-JS markers.
 *
 * ```ts
 * import { mountLynx, view, text } from '@rasenjs/lynx'
 *
 * const App = () =>
 *   view({ children: text({ children: 'Hello Lynx' }) })
 *
 * const unmount = mountLynx(App())
 * ```
 */

export * from './papi'
export * from './node'
export { lynxHostHooks } from './host-hooks'
export * from './element'
export * from './components'
export { mountLynx } from './mount'
