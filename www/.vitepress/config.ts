import { defineConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  title: 'Rasen',
  description:
    'A reactive rendering framework agnostic to both reactive systems and rendering targets',

  // Ignore dead links from included README files (they use relative paths for the monorepo)
  ignoreDeadLinks: true,

  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }]],

  vite: {
    resolve: {
      alias: {
        '@snippets': resolve(__dirname, '../snippets')
      }
    }
  },

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'API', link: '/api/' },
      { text: 'Examples', link: '/examples/' },
      {
        text: 'Packages',
        items: [
          { text: '@rasenjs/core', link: '/packages/core' },
          { text: '@rasenjs/dom', link: '/packages/dom' },
          { text: '@rasenjs/web', link: '/packages/web' },
          { text: '@rasenjs/html', link: '/packages/html' },
          { text: '@rasenjs/router', link: '/packages/router' },
          { text: '@rasenjs/compiler', link: '/packages/compiler' },
          { text: '@rasenjs/canvas-2d', link: '/packages/canvas-2d' },
          { text: '@rasenjs/rn-dom', link: '/packages/rn-dom' },
          { text: '@rasenjs/rota', link: '/packages/rota' },
          { text: '@rasenjs/tw', link: '/packages/tw' },
          { text: 'All packages', link: '/packages/' }
        ]
      },
      {
        text: 'Links',
        items: [
          { text: 'GitHub', link: 'https://github.com/rasenjs/rasen' },
          {
            text: 'npm',
            link: 'https://www.npmjs.com/org/rasenjs'
          },
          {
            text: 'Changelog',
            link: 'https://github.com/rasenjs/rasen/blob/main/CHANGELOG.md'
          }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Rasen?', link: '/guide/introduction' },
            { text: 'Design Philosophy', link: '/guide/design-philosophy' },
            { text: 'Getting Started', link: '/guide/getting-started' }
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            {
              text: 'Three-Phase Functions',
              link: '/guide/three-phase-functions'
            },
            { text: 'Reactive Runtime', link: '/guide/reactive-runtime' },
            { text: 'Render Targets', link: '/guide/render-targets' },
            { text: 'Components', link: '/guide/components' }
          ]
        },
        {
          text: 'Styling',
          items: [
            { text: 'Tailwind Classes (@rasenjs/tw)', link: '/guide/tw' }
          ]
        },
        {
          text: 'Render Targets',
          items: [
            { text: 'DOM', link: '/guide/targets/dom' },
            { text: 'Canvas 2D', link: '/guide/targets/canvas-2d' },
            { text: 'React Native', link: '/guide/targets/react-native' },
            { text: 'HTML (SSR)', link: '/guide/targets/html-ssr' }
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'JSX & the Compiler', link: '/guide/advanced/jsx' },
            {
              text: 'Custom Render Targets',
              link: '/guide/advanced/custom-targets'
            },
            {
              text: 'Custom Reactive Runtime',
              link: '/guide/advanced/custom-reactive'
            }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [{ text: 'Overview', link: '/api/' }]
        }
      ],
      '/packages/': [
        {
          text: 'Framework',
          items: [
            { text: '@rasenjs/core', link: '/packages/core' },
            { text: '@rasenjs/compiler', link: '/packages/compiler' },
            { text: '@rasenjs/dom', link: '/packages/dom' },
            { text: '@rasenjs/html', link: '/packages/html' },
            { text: '@rasenjs/web', link: '/packages/web' }
          ]
        },
        {
          text: 'Routing',
          items: [{ text: '@rasenjs/router', link: '/packages/router' }]
        },
        {
          text: 'Reactivity',
          items: [
            { text: '@rasenjs/reactive-vue', link: '/packages/reactive-vue' },
            {
              text: '@rasenjs/reactive-signals',
              link: '/packages/reactive-signals'
            },
            {
              text: '@rasenjs/reactive-nanostores',
              link: '/packages/reactive-nanostores'
            }
          ]
        },
        {
          text: 'Rendering Targets',
          items: [
            { text: '@rasenjs/canvas-2d', link: '/packages/canvas-2d' },
            { text: '@rasenjs/rn-dom', link: '/packages/rn-dom' },
            { text: '@rasenjs/react-native', link: '/packages/react-native' }
          ]
        },
        {
          text: 'Utilities',
          items: [
            { text: '@rasenjs/tw', link: '/packages/tw' },
            { text: '@rasenjs/rota', link: '/packages/rota' },
            { text: '@rasenjs/animation', link: '/packages/animation' },
            { text: '@rasenjs/math', link: '/packages/math' },
            { text: '@rasenjs/assets', link: '/packages/assets' }
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Interactive Playground', link: '/examples/playground' }
          ]
        }
      ]
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/rasenjs/rasen' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Rasen Contributors'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/rasenjs/rasen/edit/main/www/:path',
      text: 'Edit this page on GitHub'
    }
  }
})
