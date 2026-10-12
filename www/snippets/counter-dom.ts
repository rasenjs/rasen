import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, button, p, mount } from '@rasenjs/dom'
import { ref } from '@vue/reactivity'

useReactiveRuntime()

const count = ref(0)

const Counter = () =>
  div(
    { style: { textAlign: 'center', padding: '20px' } },
    // a ref in a child position becomes a reactive text node
    p({ style: { fontSize: '48px', margin: '20px' } }, count),
    div(
      {},
      button({ style: { padding: '10px 20px', marginRight: '10px' }, onClick: () => count.value-- }, '-'),
      button({ style: { padding: '10px 20px' }, onClick: () => count.value++ }, '+')
    )
  )

mount(Counter(), document.getElementById('app')!)
