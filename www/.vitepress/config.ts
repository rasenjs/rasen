import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Rasen',
  description: 'A reactive rendering framework agnostic to both reactive systems and rendering targets',
  
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
  ],

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
          { text: '@rasenjs/canvas-2d', link: '/packages/canvas-2d' },
          { text: '@rasenjs/react-native', link: '/packages/react-native' },
          { text: '@rasenjs/html', link: '/packages/html' },
          { text: '@rasenjs/jsx-runtime', link: '/packages/jsx-runtime' },
        ]
      },
      {
        text: 'Links',
        items: [
          { text: 'GitHub', link: 'https://github.com/rasenjs/rasen' },
          { text: 'Changelog', link: 'https://github.com/rasenjs/rasen/releases' },
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
            { text: 'Getting Started', link: '/guide/getting-started' },
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Three-Phase Functions', link: '/guide/three-phase-functions' },
            { text: 'Reactive Runtime', link: '/guide/reactive-runtime' },
            { text: 'Render Targets', link: '/guide/render-targets' },
            { text: 'Components', link: '/guide/components' },
          ]
        },
        {
          text: 'Render Targets',
          items: [
            { text: 'DOM', link: '/guide/targets/dom' },
            { text: 'Canvas 2D', link: '/guide/targets/canvas-2d' },
            { text: 'React Native', link: '/guide/targets/react-native' },
            { text: 'HTML (SSR)', link: '/guide/targets/html-ssr' },
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'JSX Support', link: '/guide/advanced/jsx' },
            { text: 'Custom Render Targets', link: '/guide/advanced/custom-targets' },
            { text: 'Custom Reactive Runtime', link: '/guide/advanced/custom-reactive' },
          ]
        }
      ],
      '/api/': [
        {
          text: 'Core API',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'setReactiveRuntime', link: '/api/set-reactive-runtime' },
            { text: 'MountFunction', link: '/api/mount-function' },
            { text: 'Component Types', link: '/api/component-types' },
          ]
        }
      ],
      '/packages/': [
        {
          text: 'Packages',
          items: [
            { text: '@rasenjs/core', link: '/packages/core' },
            { text: '@rasenjs/dom', link: '/packages/dom' },
            { text: '@rasenjs/canvas-2d', link: '/packages/canvas-2d' },
            { text: '@rasenjs/react-native', link: '/packages/react-native' },
            { text: '@rasenjs/html', link: '/packages/html' },
            { text: '@rasenjs/jsx-runtime', link: '/packages/jsx-runtime' },
            { text: '@rasenjs/reactive-vue', link: '/packages/reactive-vue' },
            { text: '@rasenjs/reactive-signals', link: '/packages/reactive-signals' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/rasenjs/rasen' }
    ],

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
