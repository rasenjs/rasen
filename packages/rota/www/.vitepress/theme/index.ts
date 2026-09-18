import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import RotaDemo from './components/RotaDemo.vue'
import ComponentGrid from './components/ComponentGrid.vue'
import './rota-site.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Available in every markdown page: <RotaDemo name="switch" />
    app.component('RotaDemo', RotaDemo)
    app.component('ComponentGrid', ComponentGrid)
  }
} satisfies Theme
