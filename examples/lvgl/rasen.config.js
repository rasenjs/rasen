// Rasen LVGL Configuration
export default {
  // Module aliases for the bundler
  modules: {
    '@rasenjs/lvgl': '../../packages/lvgl/dist/index.js',
    '@rasenjs/reactive-signals': '../../packages/reactive-signals/dist/index.js'
  },

  // Display configuration
  display: {
    width: 480,
    height: 320,
    colorDepth: 16 // 16-bit color for embedded
  },

  // Target-specific settings
  targets: {
    esp32: {
      heap: 512 * 1024 // 512KB heap for JS
    },
    stm32: {
      heap: 256 * 1024 // 256KB heap for JS
    },
    rpi: {
      framebuffer: '/dev/fb0'
    }
  }
}
