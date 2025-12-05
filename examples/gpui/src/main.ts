import { div, text, button, run } from '@rasenjs/gpui'
import { ref } from '@rasenjs/reactive-signals'
import { com } from '@rasenjs/core'

// Rasen GPUI Demo - Following three-phase pattern
const App = com(() => {
  // === Setup Phase ===
  const count = ref(0)
  
  // === Return Mount Function (which is a div component) ===
  return div({
    class: "flex flex-col gap-4 bg-[#1a1a2e] size-full justify-center items-center",
    children: [
      // Title
      text({
        class: "text-4xl text-white font-bold",
        children: "🌀 Rasen",
      }),
      text({
        class: "text-lg text-[#7c7c9c]",
        children: "Reactive Rendering Framework",
      }),
      
      // Counter section
      div({
        class: "flex flex-col items-center gap-3 mt-6 p-6 bg-[#16213e] rounded-xl",
        children: [
          text({
            class: "text-sm text-[#888888]",
            children: "Reactive Counter",
          }),
          // Pass ref directly - Rasen way!
          text({
            class: "text-5xl text-white font-bold",
            children: count,  // <-- ref, not count.value
          }),
          // Buttons
          div({
            class: "flex gap-3 mt-4",
            children: [
              button({
                class: "px-4 py-2 bg-[#e94560] rounded-lg text-white",
                onClick: () => count.value--,
                children: [
                  text({ children: "−", class: "text-xl" })
                ]
              }),
              button({
                class: "px-4 py-2 bg-[#0f3460] rounded-lg text-white",
                onClick: () => count.value++,
                children: [
                  text({ children: "+", class: "text-xl" })
                ]
              }),
            ],
          }),
        ],
      }),
      
      // Features
      div({
        class: "flex flex-col gap-2 mt-6 p-6 bg-[#16213e] rounded-xl",
        children: [
          text({ class: "text-white font-semibold", children: "Rasen + GPUI Features:" }),
          text({ class: "text-[#7c7c9c]", children: "• Three-phase lifecycle (setup → mount → unmount)" }),
          text({ class: "text-[#7c7c9c]", children: "• Signal-based reactivity with ref()" }),
          text({ class: "text-[#7c7c9c]", children: "• Tailwind-style class strings" }),
          text({ class: "text-[#7c7c9c]", children: "• GPU-accelerated native rendering" }),
        ],
      }),
      
      // Footer
      text({
        class: "text-sm text-[#555] mt-8",
        children: "Powered by Rasen × GPUI",
      }),
    ],
  })
})

run(App)
