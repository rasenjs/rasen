/**
 * @format
 * Entry point for React Native app
 *
 * 这个示例展示如何使用 Rasen 的 React Native 绑定
 * 直接与 Fabric 架构交互，完全不依赖 React。
 *
 * 注意：这是一个概念验证示例，展示了 Rasen 如何
 * 直接调用 React Native 底层的 Fabric UI Manager API。
 */

import { AppRegistry } from 'react-native';
import { createApp } from './src/App';

// 使用 registerRunnable 直接注册应用
// 这个 API 不需要 React，直接接收 rootTag
AppRegistry.registerRunnable('RasenExample', ({ rootTag }) => {
  console.log('[Rasen] Mounting app to rootTag:', rootTag);

  // 使用 Rasen 直接挂载应用到 rootTag
  // Rasen 会直接调用 Fabric UI Manager 创建原生视图
  const unmount = createApp(rootTag);

  // 存储卸载函数供调试使用
  if (typeof global !== 'undefined') {
    global.__rasenUnmount = unmount;
  }

  // 返回可运行对象
  return {
    run: () => {
      console.log('[Rasen] App is running');
    },
  };
});
