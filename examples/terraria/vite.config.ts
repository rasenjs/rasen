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
        { '@rasenjs/canvas-2d': ['rect', 'circle', 'text', 'group'] },
      ],
    }),
  ],
  resolve: {
    dedupe: ['@rasenjs/core'],
  },
  optimizeDeps: {
    exclude: [
      '@rasenjs/core',
      '@rasenjs/dom',
      '@rasenjs/canvas-2d',
      '@rasenjs/reactive-signals',
    ],
  },
  server: {
    port: 3014,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
