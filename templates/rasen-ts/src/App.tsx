/**
 * Isomorphic root component.
 *
 * One factory serves both entries: the SSR entry hands it a memory history,
 * the client entry a browser history. Routes, views and reactive bindings are
 * therefore written once and used on both sides.
 */
import { Signal } from 'signal-polyfill'
import { com } from '@rasenjs/core'
import type { HistoryAdapter } from '@rasenjs/router'
import { createRouter, route } from '@rasenjs/router'
import { createRouterView, createRouterLink } from '@rasenjs/web'

import { ThemeToggle } from './components/ThemeToggle'
import { HomeView } from './views/HomeView'
import { CounterView } from './views/CounterView'
import { TodoView } from './views/TodoView'
import { TimerView } from './views/TimerView'
import { AboutView } from './views/AboutView'

const routesConfig = {
  home: route('/'),
  counter: route('/counter'),
  todo: route('/todo'),
  timer: route('/timer'),
  about: route('/about')
}

const NotFound = () => (
  <div class="view-container">
    <div class="view-header">
      <h2 class="view-title">404</h2>
      <p class="view-desc">No route matches this URL.</p>
    </div>
  </div>
)

/**
 * Root component. Declared with com() at module scope so the component
 * lifetime (effectScope, HMR remount) is managed by the framework.
 */
const App = com((history: HistoryAdapter) => {
  const router = createRouter(routesConfig, { history })

  // The router's `current` is a plain property, not a signal. Mirror
  // navigation into a signal so class bindings can subscribe to it.
  const path = new Signal.State(router.current?.path ?? '/')
  router.afterEach((to) => path.set(to.path))

  const RouterView = createRouterView(
    router,
    {
      home: () => HomeView(),
      counter: () => CounterView(),
      todo: () => TodoView(),
      timer: () => TimerView(),
      about: () => AboutView()
    },
    { default: () => NotFound() }
  )

  const Link = createRouterLink(router)

  // Destructuring matters: the compiler wraps complex attribute expressions
  // (`to={router.routes.home}`) in a getter, and Link needs the Route object
  // itself. A plain identifier is passed through untouched.
  const { home, counter, todo, timer, about } = router.routes

  return (
    <div class="app">
      {/* Header */}
      <header class="header">
        <div class="header-content">
          <div class="logo-section">
            <Link to={home} class="logo-link">
              <img src="/logo.svg" class="logo" alt="Rasen logo" />
              <div class="brand">
                <h1 class="title">Rasen</h1>
                <span class="tagline">らせん · Spiral Reactive Framework</span>
              </div>
            </Link>
          </div>
          <div class="header-actions">
            <ThemeToggle />
            <a href="https://github.com/rasenjs/rasen" target="_blank" class="github-link">
              GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav class="nav">
        <div class="nav-content">
          <Link
            to={home}
            class={() => (path.get() === '/' ? 'nav-link active' : 'nav-link')}
          >
            🏠 Home
          </Link>
          <Link
            to={counter}
            class={() => (path.get() === '/counter' ? 'nav-link active' : 'nav-link')}
          >
            🔢 Counter
          </Link>
          <Link
            to={todo}
            class={() => (path.get() === '/todo' ? 'nav-link active' : 'nav-link')}
          >
            📝 Todo
          </Link>
          <Link
            to={timer}
            class={() => (path.get() === '/timer' ? 'nav-link active' : 'nav-link')}
          >
            ⏱️ Timer
          </Link>
          <Link
            to={about}
            class={() => (path.get() === '/about' ? 'nav-link active' : 'nav-link')}
          >
            ℹ️ About
          </Link>
        </div>
      </nav>

      {/* Router View
          A dedicated outlet element matters: a structural component mounts
          its content by appending to its host, so `<RouterView />` placed
          directly inside `.app` would append after the footer. Giving it an
          outlet whose last child it owns keeps the server-rendered order and
          the client-mounted order identical. */}
      <div class="route-outlet">
        <RouterView />
      </div>

      {/* Footer */}
      <footer class="footer">
        <div class="footer-content">
          <p>
            Built with <span class="heart">❤️</span> using Rasen
          </p>
          <p class="footer-hint">
            Edit <code>src/App.tsx</code> to start building
          </p>
        </div>
      </footer>
    </div>
  )
})

/**
 * Create the mountable app for a history adapter.
 *
 * @param history - Browser history on the client, memory history during SSR
 */
export function createApp(history: HistoryAdapter) {
  return App(history)
}
