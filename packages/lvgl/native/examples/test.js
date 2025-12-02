// Simple test for Rasen LVGL

function App() {
  return label({
    class: 'text-3xl text-white',
    children: 'Hello LVGL!'
  })
}

run(App)
