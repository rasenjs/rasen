import { createRouter, createMemoryHistory } from 'vue-router'
import Home from './src/pages/Home.vue'
import About from './src/pages/About.vue'

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/about', name: 'about', component: About },
]

export const router = createRouter({
  history: createMemoryHistory(),
  routes,
})
