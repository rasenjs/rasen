import { defineConfig } from 'unocss'

export default defineConfig({
  // unocss's vite plugin only scans .html/.vue/.tsx etc. by default; our UI
  // classes live in .ts files, so we must opt .ts into the scan pipeline.
  content: {
    pipeline: {
      include: [/\.(ts|tsx|js|jsx|html|vue|svelte|mdx?)($|\?)/]
    }
  },
  theme: {
    colors: {
      brand: {
        50: '#eef2ff',
        100: '#e0e7ff',
        400: '#818cf8',
        500: '#6366f1',
        600: '#4f46e5',
        700: '#4338ca'
      }
    }
  }
})
