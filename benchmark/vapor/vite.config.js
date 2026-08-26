import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// vue 3.6.0-rc.5's npm entry (vue.runtime.esm-bundler.js) does not bundle the
// vapor runtime (@vue/runtime-vapor is not published as a standalone package),
// so built apps silently lose all reactive updates. Alias to the complete
// vapor browser build instead.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      vue: 'vue/dist/vue.runtime-with-vapor.esm-browser.prod.js',
    },
  },
})
