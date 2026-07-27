/**
 * HMR Test
 */

import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { com } from '@rasenjs/core'
import { mount, div, h1, button, p } from '@rasenjs/dom'

useReactiveRuntime()

const App = com(() => {
  const count = ref(0)

  return div({ style: 'padding:20px;font-family:sans-serif;' },
    h1('Rasen HMR Test'),
    p(`Count: ${count.value}`),
    p({ style: 'color:#666' }, `Double: ${count.value * 2}`),
    button({ onClick: () => count.value++ }, '+ Increment'),
    button({ onClick: () => count.value--, style: 'margin-left:8px' }, '- Decrement'),
    button({ onClick: () => count.value = 0, style: 'margin-left:8px' }, 'Reset'),
    p({ id: 'hmr-status', style: 'margin-top:20px;padding:10px;background:#9c27b0;color:white;border-radius:4px' },
      '🎉 HMR test 2 - purple - confirmed!')
  )
})

mount(App(), document.getElementById('app')!)
