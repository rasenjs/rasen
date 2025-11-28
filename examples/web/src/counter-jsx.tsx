/**
 * JSX Counter Example
 * 使用 TSX 语法编写的计数器示例
 */

/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { setReactiveRuntime } from '@rasenjs/core'
import { createSignalsRuntime, ref, computed } from '@rasenjs/reactive-signals'
import { mount } from '@rasenjs/dom'

// 设置响应式运行时
setReactiveRuntime(createSignalsRuntime())

// 响应式状态

// JSX 组件 - 使用 ref 保持响应性
const Counter = () => {
  // 创建响应式文本内容
  const count = ref(0)
  const double = computed(() => count.value * 2)
  
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h2>JSX Counter Example</h2>
      <p style={{ fontSize: '24px' }}>Count: {count}</p>
      <p style={{ fontSize: '18px', color: '#666' }}>Double: {double}</p>
      <button onClick={() => count.value++}>Increment</button>
      <button onClick={() => count.value--} style={{ marginLeft: '10px' }}>
        Decrement
      </button>
      <button onClick={() => count.value = 0} style={{ marginLeft: '10px' }}>
        Reset
      </button>
    </div>
  )
}

// 挂载
const container = document.getElementById('app')
if (container) {
  mount(Counter(), container)
}
