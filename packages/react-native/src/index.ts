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

import type { HostConfig, RenderContext, Instance, TextInstance } from './render-context'
import type { RNMountFunction } from './components'
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
 * 返回 RNMountFunction 的函数
 */
export type AppComponent = () => RNMountFunction

/**
 * 注册应用
 * 
 * 这是 Rasen React Native 的主入口。自动处理：
 * - 获取 HostConfig
 * - 注册内置组件
 * - 初始化事件系统
 * - 调用 AppRegistry.registerRunnable
 * 
 * @param appName - 应用名称（需要与 app.json 中的 name 一致）
 * @param App - 应用组件函数
 * @returns 重新渲染函数
 * 
 * @example
 * ```ts
 * import { registerApp, view, text } from '@rasenjs/react-native';
 * 
 * const App = () => view({
 *   style: { flex: 1, backgroundColor: '#fff' },
 *   children: [
 *     text({ children: 'Hello Rasen!' })
 *   ]
 * });
 * 
 * const rerender = registerApp('MyApp', App);
 * 
 * // 需要更新时调用
 * rerender();
 * ```
 */
export function registerApp(
  appName: string,
  App: AppComponent
): () => void {
  // 初始化事件系统
  initEventSystem()
  
  let rerenderFn: (() => void) | null = null
  
  // 使用顶部导入的 AppRegistry
  AppRegistry.registerRunnable(appName, ({ rootTag }: { rootTag: number }) => {
    // 使用顶部导入的 ReactNativePrivateInterface 作为 hostConfig
    const hostConfig = ReactNativePrivateInterface as HostConfig
    
    // 创建重新渲染函数
    rerenderFn = () => {
      mount(hostConfig, rootTag, App())
    }
    
    // 首次渲染
    rerenderFn()
  })
  
  // 返回重新渲染函数（外部可调用）
  return () => {
    if (rerenderFn) {
      rerenderFn()
    }
  }
}

// ============================================================================
// Mount API (Low-level)
// ============================================================================

/**
 * 组件类型：接收 RenderContext，返回 Instance
 * 
 * @deprecated 使用 RNMountFunction 代替
 */
export type RasenComponent = (ctx: RenderContext) => Instance | TextInstance | (Instance | TextInstance)[]

/**
 * 挂载 Rasen 应用（底层 API）
 *
 * 大多数情况下应使用 `registerApp` 代替。
 * 此函数用于需要更细粒度控制的场景。
 *
 * @param hostConfig - ReactNativePrivateInterface
 * @param rootTag - 根视图标签
 * @param component - 组件（MountFunction 或返回 Instance 的函数）
 * @returns 卸载函数
 */
export function mount(
  hostConfig: HostConfig,
  rootTag: number,
  component: RNMountFunction | RasenComponent
): () => void {
  // 创建根 RenderContext
  const ctx = createRenderContext(hostConfig, rootTag)

  // 渲染组件
  const result = component(ctx)

  // 收集实例
  const instances = Array.isArray(result) ? result : [result]

  // 提交到原生层
  const childSet = createChildSet(rootTag)
  for (const instance of instances) {
    appendChildToSet(childSet, instance)
  }
  completeRoot(rootTag, childSet)

  // 返回卸载函数
  return () => {
    // TODO: 实现卸载逻辑
  }
}
