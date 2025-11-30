import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import CodeBlock from './components/CodeBlock.vue'
import CodeTabs from './components/CodeTabs.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Register global components for use in markdown
    app.component('CodeBlock', CodeBlock)
    app.component('CodeTabs', CodeTabs)
  }
} satisfies Theme
