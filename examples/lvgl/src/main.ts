import { div, label, button, bar, lvSwitch, run } from '@rasenjs/lvgl'
import { ref } from '@rasenjs/reactive-signals'

/**
 * Example LVGL Application
 *
 * This demonstrates the Rasen three-phase pattern with LVGL:
 * - Setup Phase: Create reactive state (refs)
 * - Mount Phase: Build the UI tree
 * - Unmount Phase: Cleanup
 */
const App = () => {
  // === Setup Phase ===
  const count = ref(0)
  const progress = ref(50)
  const ledOn = ref(false)

  // === Return Mount Function ===
  return div({
    class:
      'flex flex-col gap-4 bg-[#1a1a2e] size-full p-4 items-center justify-center',
    children: [
      // Title
      label({
        class: 'text-2xl text-white font-bold',
        children: 'LVGL + Rasen Demo'
      }),

      // Counter display
      div({
        class: 'flex flex-col items-center gap-2 bg-[#16213e] p-4 rounded-lg',
        children: [
          label({
            class: 'text-sm text-gray-500',
            children: 'Counter'
          }),
          label({
            class: 'text-4xl text-[#00ff88] font-bold',
            children: () => `${count.value}`
          }),

          // Button row
          div({
            class: 'flex gap-4',
            children: [
              button({
                class: 'bg-[#e94560] text-white px-6 py-3 rounded-lg',
                onClick: () => count.value--,
                children: [label({ children: '−' })]
              }),
              button({
                class: 'bg-[#0f3460] text-white px-6 py-3 rounded-lg',
                onClick: () => (count.value = 0),
                children: [label({ children: 'Reset' })]
              }),
              button({
                class: 'bg-[#00ff88] text-black px-6 py-3 rounded-lg',
                onClick: () => count.value++,
                children: [label({ children: '+' })]
              })
            ]
          })
        ]
      }),

      // Progress section
      div({
        class:
          'flex flex-col items-center gap-2 bg-[#16213e] p-4 rounded-lg w-[300px]',
        children: [
          label({
            class: 'text-sm text-gray-500',
            children: 'Progress'
          }),

          // Progress bar
          bar({
            class: 'w-full h-4 rounded-full',
            value: progress,
            min: 0,
            max: 100
          }),

          // Progress controls
          div({
            class: 'flex gap-2 items-center',
            children: [
              button({
                class:
                  'bg-[#16213e] text-white px-4 py-2 rounded border border-[#0f3460]',
                onClick: () =>
                  (progress.value = Math.max(0, progress.value - 10)),
                children: [label({ children: '◀' })]
              }),
              label({
                class: 'text-white text-lg w-[60px] text-center',
                children: () => `${progress.value}%`
              }),
              button({
                class:
                  'bg-[#16213e] text-white px-4 py-2 rounded border border-[#0f3460]',
                onClick: () =>
                  (progress.value = Math.min(100, progress.value + 10)),
                children: [label({ children: '▶' })]
              })
            ]
          })
        ]
      }),

      // LED Toggle section
      div({
        class: 'flex items-center gap-4 bg-[#16213e] p-4 rounded-lg',
        children: [
          label({
            class: 'text-white',
            children: 'LED Status:'
          }),
          lvSwitch({
            class: '',
            checked: ledOn,
            onChange: (checked) => (ledOn.value = checked)
          }),
          div({
            class: () =>
              `size-4 rounded-full ${ledOn.value ? 'bg-[#00ff88]' : 'bg-gray-500'}`
          }),
          label({
            class: 'text-white text-sm',
            children: () => (ledOn.value ? 'ON' : 'OFF')
          })
        ]
      })
    ]
  })
}

run(App)
