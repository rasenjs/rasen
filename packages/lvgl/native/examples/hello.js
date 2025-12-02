// Hello World example for Rasen LVGL
// div, label, run 已经在全局作用域预定义

function App() {
  return div({
    class:
      'flex flex-col items-center justify-center size-full bg-[#1a1a2e] gap-4',
    children: [
      label({
        class: 'text-3xl text-white',
        children: 'Hello, LVGL!'
      }),
      label({
        class: 'text-base text-[#888888]',
        children: 'Running on Rasen + QuickJS'
      }),
      div({
        class: 'flex flex-row gap-2 p-4',
        children: [
          div({ class: 'size-8 bg-red-500 rounded-full' }),
          div({ class: 'size-8 bg-green-500 rounded-full' }),
          div({ class: 'size-8 bg-blue-500 rounded-full' })
        ]
      })
    ]
  })
}

run(App)
