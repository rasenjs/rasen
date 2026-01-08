import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, button, mount } from '@rasenjs/dom'
import { ref, computed } from '@vue/reactivity'

// 1. Setup reactive runtime
useReactiveRuntime()

// 2. Create reactive state
const count = ref(0)

// 3. Define component
const Counter = () =>
  div({
    children: [
      div({ textContent: computed(() => `Count: ${count.value}`) }),
      button({
        textContent: 'Increment',
        on: { click: () => count.value++ }
      })
    ]
  })

// 4. Mount to DOM
mount(Counter(), document.getElementById('app')!)
