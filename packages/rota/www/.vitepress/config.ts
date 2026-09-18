import { defineConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../..')

/**
 * Rota's own site.
 *
 * The library sources are aliased in rather than read from `dist`: the site is
 * the fastest way to look at a component while changing it, and a stale build
 * would quietly show the previous version.
 *
 * Anchored regex aliases: Vite's string form is a prefix replacement, so
 * `'@rasenjs/rota'` would also swallow subpaths like `@rasenjs/rota/dom`.
 */
export default defineConfig({
  title: 'Rota',
  description:
    'Headless UI components for Rasen — accessible behaviour, zero styling',

  vite: {
    resolve: {
      alias: [
        { find: /^@rasenjs\/rota$/, replacement: resolve(repo, 'packages/rota/src/index.ts') },
        { find: /^@rasenjs\/core$/, replacement: resolve(repo, 'packages/core/src/index.ts') },
        { find: /^@rasenjs\/dom$/, replacement: resolve(repo, 'packages/dom/src/index.ts') },
        {
          find: /^@rasenjs\/reactive-vue$/,
          replacement: resolve(repo, 'packages/reactive-vue/src/index.ts')
        }
      ]
    },
    optimizeDeps: {
      // Aliased sources must not be pre-bundled, or an edit keeps serving the
      // previous copy out of node_modules/.vite.
      exclude: ['@rasenjs/rota', '@rasenjs/dom', '@rasenjs/core', '@rasenjs/reactive-vue']
    }
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Components', link: '/components/' },
      { text: 'Styling', link: '/guide/styling' },
      { text: 'Rasen', link: 'https://github.com/rasenjs/rasen' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Styling', link: '/guide/styling' },
            { text: 'State & reactivity', link: '/guide/state' },
            { text: 'Accessibility', link: '/guide/accessibility' }
          ]
        }
      ],
      '/components/': [
        {
          text: 'Components',
          items: [
            { text: 'Overview', link: '/components/' },
            { text: 'Accordion', link: '/components/accordion' },
            { text: 'AlertDialog', link: '/components/alert-dialog' },
            { text: 'AspectRatio', link: '/components/aspect-ratio' },
            { text: 'Avatar', link: '/components/avatar' },
            { text: 'Checkbox', link: '/components/checkbox' },
            { text: 'Collapsible', link: '/components/collapsible' },
            { text: 'NumberField', link: '/components/number-field' },
            { text: 'PinInput', link: '/components/pin-input' },
            { text: 'Progress', link: '/components/progress' },
            { text: 'Separator', link: '/components/separator' },
            { text: 'Switch', link: '/components/switch' },
            { text: 'Tabs', link: '/components/tabs' },
            { text: 'TagsInput', link: '/components/tags-input' }
          ]
        }
      ]
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/rasenjs/rasen' }],
    search: { provider: 'local' },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Rasen Contributors'
    }
  }
})
