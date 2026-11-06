import { defineConfig } from 'vite'
import { rasenCompile } from '@rasenjs/compiler'
import { DOM_TAGS } from '@rasenjs/dom'
import AutoImport from 'unplugin-auto-import/vite'


export default defineConfig({
  plugins: [
    rasenCompile.vite(),
    AutoImport({
      include: [/\.tsx$/],
      imports: [
        { '@rasenjs/dom': [...DOM_TAGS] },
        { '@rasenjs/canvas-2d': ['rect', 'image', 'text', 'group', 'sprite'] },
      ],
    }),
  ],
  resolve: {
    dedupe: ['@rasenjs/core']
  },
  optimizeDeps: {
    exclude: ['@rasenjs/core', '@rasenjs/dom', '@rasenjs/canvas-2d']
  },
  server: {
    port: 3010,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
