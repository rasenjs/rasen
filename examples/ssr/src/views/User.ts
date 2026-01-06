import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, h1, p, button } from '@rasenjs/web'

export const UserView = com(() => {
  const runtime = getReactiveRuntime()
  const count = runtime.ref(0)
  const increment = () => count.value++
  
  return div(
    { class: 'user-view' },
    h1('User Profile'),
    p('This is the user page'),
    p(() => `Counter: ${count.value}`),
    button({ onClick: increment }, 'Increment')
  )
})
