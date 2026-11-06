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
        { '@rasenjs/gfx': ['firstPersonCamera', 'mesh', 'box', 'billboard', 'group', 'rect', 'skybox', 'each'] },
        { './weapon': ['weapon'] },
      ],
    }),
  ],
  resolve: { dedupe: ['@rasenjs/core'] },
  optimizeDeps: { exclude: ['@rasenjs/core', '@rasenjs/dom', '@rasenjs/gfx', '@rasenjs/math'] },
  server: { port: 3012, open: true, fs: { allow: ['../..', '/Users/wuhaofeng/Projects/@rasen'] } },
  build: { outDir: 'dist', sourcemap: true },
})
