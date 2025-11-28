import { setReactiveRuntime } from '@rasenjs/core'
import { createSignalsRuntime, ref } from '@rasenjs/reactive-signals'
import { div, h1, button, span, mount } from '@rasenjs/dom'

// 初始化 Signals 响应式运行时
setReactiveRuntime(createSignalsRuntime())

const count = ref(0)

const app = div(
  { style: { textAlign: 'center' } },
  h1('Simple Counter'),
  div(
    { class: 'counter' },
    span({ textContent: count })
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
