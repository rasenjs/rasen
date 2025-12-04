/**
 * lazy 组件示例
 * 
 * 演示如何使用 lazy 组件处理异步加载
 */

import { lazy, createLazy, div, h1, h2, p, span, button, a, when } from '@rasenjs/dom'
import { ref, computed } from '@rasenjs/reactive-signals'
import type { Mountable } from '@rasenjs/core'

/**
 * 异步加载的重组件（模拟网络请求）
 */
export async function HeavyComponent() {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  return div({
    children: [
      h2({ children: '✓ 重组件已加载' }),
      p({ children: '这个组件花了 2 秒加载' })
    ]
  })
}

/**
 * 示例 1: 基础 lazy 使用
 */
export function LazyBasic() {
  return lazy({
    loader: HeavyComponent,
    loading: () => span({ children: '⏳ 正在加载重组件...' }),
    error: (err) => span({ 
      style: 'color: red;',
      children: `❌ 加载失败: ${err.message}` 
    }),
    minDelay: 300
  })
}

/**
 * 示例 2: 异步模块加载
 */
export function LazyModuleLoading() {
  return lazy({
    loader: async () => {
      await new Promise(resolve => setTimeout(resolve, 1500))
      return h2({ children: '📦 动态模块已加载' })
    },
    loading: () => span({ children: '⏳ 加载模块中...' })
  })
}

/**
 * 示例 3: 带超时控制的 lazy
 */
export function LazyWithTimeout() {
  return lazy({
    loader: async () => {
      await new Promise(resolve => setTimeout(resolve, 3000))
      return span({ children: '数据已加载' })
    },
    loading: () => span({ children: '⏳ 加载中...' }),
    error: (err) => span({ 
      style: 'color: red;',
      children: `❌ ${err.message}` 
    }),
    timeout: 2000
  })
}

/**
 * 示例 4: 可复用的 lazy 工厂
 */
export function LazyFactory() {
  const LazyUserList = createLazy(
    async () => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      return div({
        children: [
          h2({ children: '👥 用户列表' }),
          div({
            children: ['User 1', 'User 2', 'User 3'].map(name =>
              div({ children: name, style: 'padding: 8px;' })
            )
          })
        ]
      })
    },
    {
      loading: () => span({ children: '📋 加载用户列表...' })
    }
  )
  
  return LazyUserList()
}

/**
 * 示例卡片组件
 */
function ExampleCard(props: {
  title: string
  description: string
  loader: () => Mountable<HTMLElement>
}) {
  const showContent = ref(false)
  
  return div({
    style: `
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin-bottom: 1.5rem;
    `,
    children: [
      h2({ 
        style: 'color: #555; font-size: 1.25rem; margin-top: 0;',
        children: props.title 
      }),
      p({ 
        style: 'color: #666; line-height: 1.6;',
        children: props.description 
      }),
      button({
        style: 'padding: 0.5rem 1rem; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;',
        children: computed(() => showContent.value ? '关闭' : '加载'),
        onClick: () => {
          showContent.value = !showContent.value
        }
      }),
      div({
        style: 'margin-top: 1rem; min-height: 50px; padding: 1rem; background: #fafafa; border-radius: 4px; border-left: 4px solid #007bff;',
        children: [
          when({
            condition: () => showContent.value,
            then: props.loader,
            else: () => span({ children: '' })
          })
        ]
      })
    ]
  })
}

/**
 * 主 Lazy 示例组件
 */
export function LazyExamples() {
  return div({
    style: `
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      background: #f5f5f5;
      min-height: 100vh;
    `,
    children: [
      a({
        href: '/',
        style: 'display: inline-block; margin-bottom: 1rem; color: #007bff; text-decoration: none;',
        children: '← Back to Examples'
      }),
      h1({
        style: 'color: #333; margin-bottom: 2rem;',
        children: '🌀 Lazy Loading Examples'
      }),
      ExampleCard({
        title: 'Basic Lazy Loading',
        description: 'Click to load a heavy component asynchronously',
        loader: LazyBasic
      }),
      ExampleCard({
        title: 'Lazy with Loading State',
        description: 'Shows loading indicator while component loads',
        loader: LazyBasic
      }),
      ExampleCard({
        title: 'Lazy Module Loading',
        description: 'Dynamically import and load a module',
        loader: LazyModuleLoading
      }),
      ExampleCard({
        title: 'Lazy with Timeout',
        description: 'Load component with timeout handling',
        loader: LazyWithTimeout
      }),
      ExampleCard({
        title: 'Lazy Factory Pattern',
        description: 'Use factory pattern for complex lazy loading',
        loader: LazyFactory
      })
    ]
  })
}
