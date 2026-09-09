import { defineConfig } from 'vite'
import { rasenHMR } from '@rasenjs/vite-plugin-rasen'

export default defineConfig({
  plugins: [rasenHMR()],
  resolve: { dedupe: ['@rasenjs/core'] },
  optimizeDeps: { exclude: ['@rasenjs/core', '@rasenjs/dom', '@rasenjs/gfx', '@rasenjs/math'] },
  server: { port: process.env.PORT ? Number(process.env.PORT) : 3014, open: true, fs: { allow: ['../..', '/Users/wuhaofeng/Projects/@rasen'] } },
  build: { outDir: 'dist', sourcemap: true },
})
