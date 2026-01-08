/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { ref, computed, type Ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { com } from '@rasenjs/core'
import type { HistoryAdapter } from '@rasenjs/router'
import { createRouter, route } from '@rasenjs/router'
import { createRouterView, createRouterLink } from '@rasenjs/web'

// Import views
import { HomeView } from './views/HomeView'
import { CounterView } from './views/CounterView'
import { TodoView } from './views/TodoView'
import { TimerView } from './views/TimerView'
import { AboutView } from './views/AboutView'

// Import components
import { ThemeToggle } from './components/ThemeToggle'

// Global theme state (initialized in createApp)
export let isDark: Ref<boolean>

// Define routes configuration
const routesConfig = {
  home: route('/'),
  counter: route('/counter'),
  todo: route('/todo'),
  timer: route('/timer'),
  about: route('/about'),
}

/**
 * Create isomorphic App component
 * @param history - History adapter (BrowserHistory for client, MemoryHistory for SSR)
 */
export function createApp(history: HistoryAdapter) {
  // CRITICAL: Ensure reactive runtime is set before any reactive operations
  // This works because @rasenjs/core is externalized (not in vite.config noExternal)
  useReactiveRuntime()
  
  // Initialize global theme state (will be reused across SSR and client)
  if (!isDark) {
    isDark = ref(true)
  }
  
  // Create router with the provided history
  const router = createRouter(routesConfig, { history })
  
  // Create router components
  const RouterView = createRouterView(router, {
    home: () => HomeView(),
    counter: () => CounterView(),
    todo: () => TodoView(),
    timer: () => TimerView(),
    about: () => AboutView(),
  })

  const Link = createRouterLink(router)

  return com(() => {
    const currentPath = computed(() => router.current?.path || '/')

  return (
    <div class="app">
      {/* Header */}
      <header class="header">
        <div class="header-content">
          <div class="logo-section">
            <Link to={router.routes.home} class="logo-link">
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
            to={router.routes.home} 
            class={computed(() => currentPath.value === '/' ? 'nav-link active' : 'nav-link')}
          >
            🏠 Home
          </Link>
          <Link 
            to={router.routes.counter} 
            class={computed(() => currentPath.value === '/counter' ? 'nav-link active' : 'nav-link')}
          >
            🔢 Counter
          </Link>
          <Link 
            to={router.routes.todo} 
            class={computed(() => currentPath.value === '/todo' ? 'nav-link active' : 'nav-link')}
          >
            📝 Todo
          </Link>
          <Link 
            to={router.routes.timer} 
            class={computed(() => currentPath.value === '/timer' ? 'nav-link active' : 'nav-link')}
          >
            ⏱️ Timer
          </Link>
          <Link 
            to={router.routes.about} 
            class={computed(() => currentPath.value === '/about' ? 'nav-link active' : 'nav-link')}
          >
            ℹ️ About
          </Link>
        </div>
      </nav>

      {/* Router View */}
      <RouterView />

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
}
