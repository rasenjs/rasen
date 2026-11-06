import { defineConfig } from 'vite'
import { resolve } from 'path'
import UnoCSS from 'unocss/vite'
import { rasenCompile } from '@rasenjs/compiler'
import { DOM_TAGS } from '@rasenjs/dom'
import AutoImport from 'unplugin-auto-import/vite'


export default defineConfig({
  root: __dirname,
  plugins: [
    UnoCSS(),
    rasenCompile.vite(),
    AutoImport({
      include: [/\.tsx$/],
      imports: [
        { '@rasenjs/dom': [...DOM_TAGS] },
        { '@rasenjs/canvas-2d': ['circle'] },
      ],
    }),
  ],
  server: {
    port: 5191,
    strictPort: true
  },
  resolve: {
    alias: {
      '@rasenjs/core': resolve(__dirname, '../../packages/core/src'),
      '@rasenjs/dom': resolve(__dirname, '../../packages/dom/src'),
      '@rasenjs/canvas-2d': resolve(__dirname, '../../packages/canvas-2d/src'),
      '@rasenjs/reactive-vue': resolve(__dirname, '../../packages/reactive-vue/src'),
      '@rasenjs/assets': resolve(__dirname, '../../packages/assets/src'),
      '@rasenjs/gfx': resolve(__dirname, '../../packages/gfx/src')
    }
  }
})
