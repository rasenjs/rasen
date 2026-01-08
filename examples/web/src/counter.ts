import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { div, h1, button, span, mount } from '@rasenjs/dom'

// 初始化 Signals 响应式运行时
useReactiveRuntime()

const count = ref(0)

const app = div(
  { style: { textAlign: 'center' } },
  h1('Simple Counter'),
  div(
    { class: 'counter', style: { fontSize: '48px' } },
    span({ children: () => `${count.value}` })
  ),
  div(
    button(
      {
        class: 'decrement',
        onClick: () => count.value--
      },
      '- Decrement'
    ),
    button(
      {
        class: 'increment',
        onClick: () => count.value++
      },
      '+ Increment'
    )
  ),
  div(
    button(
      {
        class: 'reset',
        onClick: () => count.value = 0
      },
      'Reset'
    )
  )
)

mount(app, document.getElementById('app')!)
