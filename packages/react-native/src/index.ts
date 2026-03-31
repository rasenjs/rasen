/**
 * Rasen React Native - DOM-like API
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

import { AppRegistry } from 'react-native'
import { RNDocument } from './node'
import type { Host } from './components/component'
import type { Mountable } from '@rasenjs/core'

// 导出组件
export { view, text, each, touchable, touchableOpacity } from './components'

export type AppComponent = () => Mountable<Host>

/**
 * 注册应用
 * 
 * @param appName - 应用名称
 * @param App - 应用组件函数
 * @returns 重新渲染函数
 */
export function registerApp(
  appName: string,
  App: AppComponent
): () => void {
  let rerenderFn: (() => void) | null = null
  
  AppRegistry.registerRunnable(appName, ({ rootTag }: { rootTag: number }) => {
    // Get or create singleton document
    const document = RNDocument.getOrCreate(rootTag)
    
    rerenderFn = () => {
      const appMountable = App()
      const unmount = appMountable(document.body)
      
      // Complete Fabric submission via body method
      document.body.completeFabric()
      
      return unmount
    }
    
    // 首次渲染
    rerenderFn()
  })
  
  // 返回重新渲染函数
  return () => {
    if (rerenderFn) {
      rerenderFn()
    }
  }
}
