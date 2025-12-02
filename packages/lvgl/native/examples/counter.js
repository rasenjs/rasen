// Counter example for Rasen LVGL
// ref, div, label, button, run 已经在全局作用域预定义

function App() {
  var count = ref(0)

  return div({
    class:
      'flex flex-col items-center justify-center size-full bg-gray-900 gap-4',
    children: [
      label({
        class: 'text-2xl text-white',
        children: function () {
          return 'Count: ' + count.value
        }
      }),
      div({
        class: 'flex flex-row gap-2',
        children: [
          button({
            class: 'px-4 py-2 bg-blue-500 rounded-lg',
            onClick: function () {
              count.value--
            },
            children: [label({ class: 'text-white', children: '-' })]
          }),
          button({
            class: 'px-4 py-2 bg-blue-500 rounded-lg',
            onClick: function () {
              count.value++
            },
            children: [label({ class: 'text-white', children: '+' })]
          })
        ]
      })
    ]
  })
}

run(App)
