/**
 * Rasen React Native
 *
 * 使用方式：
 *
 * ```javascript
 * // index.js
 * import { registerApp, view, text } from '@rasenjs/react-native';
 *
 * const App = () => view({
 *   style: { flex: 1, justifyContent: 'center', alignItems: 'center' },
 *   children: [
 *     text({ children: 'Hello Rasen!' })
 *   ]
 * });
 *
 * registerApp('MyApp', App);
 * ```
 */

// 导出类型
export * from './types'

// 导出 RenderContext 相关
export {
  type Node,
  type Container,
  type ChildSet,
  type UpdatePayload,
  type Props,
  type ViewConfig,
  type Instance,
  type TextInstance,
  type HostContext,
  type HostConfig,
  type RenderContext,
  createRenderContext,
  getChildContext,
  createInstance,
  createTextInstance,
  appendChild,
  commitUpdate,
  commitTextUpdate,
  createChildSet,
  appendChildToSet,
  completeRoot,
  mountToContainer,
  resetTagCounter,
  initEventSystem,
  initEventListener,
  getInstanceMap,
  registerInstance,
  unregisterInstance,
  getParentTag,
} from './render-context'

// 导出组件
export * from './components'

// 导出工具函数
export * from './utils'

import type { HostConfig } from './render-context'
import type { RNComponent, RNMountFunction } from './components'
import { createRenderContext, createChildSet, appendChildToSet, completeRoot, initEventSystem } from './render-context'

// React Native 依赖 - 使用静态 import
import { AppRegistry } from 'react-native'
// @ts-expect-error - React Native internal module
import ReactNativePrivateInterface from 'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface'
// 触发 ViewConfig 注册
import 'react-native/Libraries/Text/TextNativeComponent'
import 'react-native/Libraries/Components/View/ViewNativeComponent'

// ============================================================================
// App Registration API
// ============================================================================

/**
 * 应用组件类型
 * 返回一个挂载函数（即 `RNMountFunction`）。该函数在内部接收 `RenderContext` 并执行渲染/提交操作。
 */
export type AppComponent = () => RNMountFunction

/**
 * 挂载应用并返回可手动触发的重新渲染函数。
 *
 * 说明：
 * - 初始化事件系统（`initEventSystem`）。
 * - 通过 `AppRegistry.registerRunnable` 注册一个 runnable（名称为 `RasenReactNativeApp`），在 runnable 被触发时会：
 *   - 使用 `ReactNativePrivateInterface` 作为 `HostConfig`（内部 React Native 私有接口）并基于 `rootTag` 创建 `RenderContext`。
 *   - 调用传入的 `component`，拿到要挂载的实例（可以是单个实例或数组），将它们收集到 `ChildSet` 并通过 `completeRoot` 提交到原生层。
 * - 挂载通过 `AppRegistry` 注册的 runnable 执行首次渲染和后续内部渲染，但不会向外部返回可调用的 `rerender` 函数。
 *
 * @param component - 应用组件（应返回一个挂载函数，见 `RNComponent`）
 *
 * @example
 * ```ts
 * import { mount, view, text } from '@rasenjs/react-native';
 *
 * const App = () => view({
 *   style: { flex: 1, backgroundColor: '#fff' },
 *   children: [ text({ children: 'Hello Rasen!' }) ]
 * });
 *
 * // 将 App 传入 mount，注册后的 runnable 会在应用启动时进行渲染
 * mount(App);
 * ```
 */
export function mount(
  component: RNComponent,
): void {
  // 初始化事件系统
  initEventSystem()
  
  let rerenderFn: (() => void) | null = null
  
  // 使用顶部导入的 AppRegistry
  AppRegistry.registerRunnable('RasenReactNativeApp', ({ rootTag }: { rootTag: number }) => {
    // 使用顶部导入的 ReactNativePrivateInterface 作为 hostConfig
    const hostConfig = ReactNativePrivateInterface as HostConfig
    const ctx = createRenderContext(hostConfig, rootTag)

    // 创建重新渲染函数
    rerenderFn = () => {
        // 创建根 RenderContext

      // 渲染组件
      const result = component()(ctx)

      // 收集实例
      const instances = Array.isArray(result) ? result : [result]

      // 提交到原生层
      const childSet = createChildSet(rootTag)
      for (const instance of instances) {
        appendChildToSet(childSet, instance)
      }
      completeRoot(rootTag, childSet)
    }
    
    // 首次渲染
    rerenderFn()
  })
  
  // 不对外返回 rerender，渲染由 AppRegistry 注册的 runnable 内部触发
}
