import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, button, mount } from '@rasenjs/dom'
import { ref } from 'vue'

setReactiveRuntime(createReactiveRuntime())

const count = ref(0)

const Counter = () =>
  div({
    style: { textAlign: 'center', padding: '20px' },
    children: [
      div({
        style: { fontSize: '48px', margin: '20px' },
        textContent: () => `${count.value}`
      }),
      div({
        children: [
          button({
            textContent: '-',
            style: { padding: '10px 20px', marginRight: '10px' },
            on: { click: () => count.value-- }
          }),
          button({
            textContent: '+',
            style: { padding: '10px 20px' },
            on: { click: () => count.value++ }
          })
        ]
      })
    ]
  })

mount(Counter(), document.getElementById('app')!)
