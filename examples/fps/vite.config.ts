import { defineConfig } from 'vite'
import { rasenHMR } from '@rasenjs/vite-plugin-rasen'

export default defineConfig({
  plugins: [rasenHMR()],
  resolve: { dedupe: ['@rasenjs/core'] },
  optimizeDeps: { exclude: ['@rasenjs/core', '@rasenjs/dom', '@rasenjs/gfx', '@rasenjs/math'] },
  server: { port: 3012, open: true, fs: { allow: ['../..', '/Users/wuhaofeng/Projects/@rasen'] } },
  build: { outDir: 'dist', sourcemap: true },
})
