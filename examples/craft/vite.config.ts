import { defineConfig } from 'vite'
import { rasenCompile } from '@rasenjs/compiler'
import { DOM_TAGS } from '@rasenjs/dom'
import AutoImport from 'unplugin-auto-import/vite'


export default defineConfig({
  plugins: [
    rasenCompile.vite(),
    AutoImport({
      // Tags only exist where JSX is: a plain .ts module that happens to use
      // `dt` as a parameter (an HTML tag name!) must never see an injected
      // tag import.
      include: [/\.tsx$/],
      imports: [
        { '@rasenjs/dom': [...DOM_TAGS] },
        { '@rasenjs/gfx': ['mesh', 'box', 'billboard', 'group', 'rect'] },
      ],
    }),
  ],
  resolve: {
    dedupe: ['@rasenjs/core']
  },
  optimizeDeps: {
    exclude: ['@rasenjs/core', '@rasenjs/dom', '@rasenjs/gfx', '@rasenjs/math']
  },
  server: {
    port: 3011,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
