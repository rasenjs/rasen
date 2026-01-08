// tsconfig.json: { "jsx": "react-jsx", "jsxImportSource": "@rasenjs/dom" }
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { mount } from '@rasenjs/dom'
import { ref } from '@vue/reactivity'

useReactiveRuntime()

const Counter = () => {
  const count = ref(0)
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  )
}

mount(Counter(), document.getElementById('app')!)
