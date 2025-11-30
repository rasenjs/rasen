import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: './index.html',
        shapes: './shapes.html',
        paths: './paths.html',
        transforms: './transforms.html',
        text: './text.html',
        advanced: './advanced.html',
        performance: './performance.html'
      }
    }
  }
})
