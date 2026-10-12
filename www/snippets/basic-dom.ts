import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, button, p, mount } from '@rasenjs/dom'
import { ref, computed } from '@vue/reactivity'

// 1. Install the reactive runtime once, at startup
useReactiveRuntime()

// 2. Reactive state
const count = ref(0)
const label = computed(() => `Count: ${count.value}`)

// 3. A component returns a mountable. `children` accepts a flat array of
//    strings, refs and mountables — a ref child is a reactive text node.
const Counter = () =>
  div(
    { style: { textAlign: 'center', padding: '20px' } },
    p({ style: { fontSize: '32px' } }, label),
    button({ onClick: () => count.value++ }, 'Increment')
  )

// 4. Mount it
mount(Counter(), document.getElementById('app')!)
