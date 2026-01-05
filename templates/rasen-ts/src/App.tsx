/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { ref, computed } from '@rasenjs/reactive-signals'
import { com } from '@rasenjs/core'
import { createRouterView, createLink } from '@rasenjs/router-dom'

// Import router and routes
import { router, routes } from './router'

// Import views
import { HomeView } from './views/HomeView'
import { CounterView } from './views/CounterView'
import { TodoView } from './views/TodoView'
import { TimerView } from './views/TimerView'
import { AboutView } from './views/AboutView'

// Import components
import { ThemeToggle } from './components/ThemeToggle'

// Global theme state
export const isDark = ref(true)

// Create router components
const RouterView = createRouterView(router, {
  home: () => HomeView(),
  counter: () => CounterView(),
  todo: () => TodoView(),
  timer: () => TimerView(),
  about: () => AboutView(),
})

const Link = createLink(router)

export const App = com(() => {
  const currentPath = computed(() => router.currentRoute.value?.path || '/')

  return (
    <div class="app">
      {/* Header */}
      <header class="header">
        <div class="header-content">
          <div class="logo-section">
            <Link to={routes.home} class="logo-link">
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
            to={routes.home} 
            class={computed(() => currentPath.value === '/' ? 'nav-link active' : 'nav-link')}
          >
            🏠 Home
          </Link>
          <Link 
            to={routes.counter} 
            class={computed(() => currentPath.value === '/counter' ? 'nav-link active' : 'nav-link')}
          >
            🔢 Counter
          </Link>
          <Link 
            to={routes.todo} 
            class={computed(() => currentPath.value === '/todo' ? 'nav-link active' : 'nav-link')}
          >
            📝 Todo
          </Link>
          <Link 
            to={routes.timer} 
            class={computed(() => currentPath.value === '/timer' ? 'nav-link active' : 'nav-link')}
          >
            ⏱️ Timer
          </Link>
          <Link 
            to={routes.about} 
            class={computed(() => currentPath.value === '/about' ? 'nav-link active' : 'nav-link')}
          >
            ℹ️ About
          </Link>
        </div>
      </nav>

      {/* Main Content with Router View */}
      <main class="main">
        <RouterView />
      </main>

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
