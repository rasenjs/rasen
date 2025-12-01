/**
 * Rasen GPUI Configuration
 */
export default {
  modules: {
    '@rasenjs/gpui': '../../packages/gpui/dist/index.js',
    '@rasenjs/reactive-signals': '../../packages/reactive-signals/dist/index.js',
  },
  window: {
    title: 'Rasen GPUI App',
    width: 800,
    height: 600,
  },
}
