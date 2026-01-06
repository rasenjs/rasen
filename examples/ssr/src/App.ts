/**
 * Isomorphic App component
 * 
 * This file uses conditional imports based on build target:
 * - SSR: @rasenjs/html, @rasenjs/router-html
 * - Client: @rasenjs/dom, @rasenjs/router-dom
 * 
 * The alias is configured in vite.config.ts
 */
import type { HistoryAdapter } from '@rasenjs/router'
import { createRouter } from '@rasenjs/router'
import { createRouterView, createRouterLink } from '@rasenjs/web'
import { div, nav, h1, p, a } from '@rasenjs/web'
import { routes } from './routes'
import { HomeView } from './views/Home'
import { AboutView } from './views/About'
import { UserView } from './views/User'

export function createApp(history: HistoryAdapter) {
  const router = createRouter(routes, {
    history
  })
  
  const RouterView = createRouterView(router, {
    home: HomeView,
    about: AboutView,
    user: UserView
  }, {
    default: () => div({ class: 'not-found' }, '404 - Page Not Found')
  })
  
  const Link = createRouterLink(router)
  
  return () => div(
    {},
    nav(
      { class: 'navbar' },
      Link({ to: router.routes.home, class: 'nav-link' }, 'Home'),
      Link({ to: router.routes.about, class: 'nav-link' }, 'About'),
      Link({ to: router.routes.user, params: { id: '123' }, class: 'nav-link' }, 'User 123')
    ),
    div(
      { class: 'content' },
      RouterView()
    ),
    div(
      { class: 'footer' },
      p('Powered by Rasen Framework')
    )
  )
}
