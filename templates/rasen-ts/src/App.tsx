/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { ref, computed } from '@rasenjs/reactive-signals'

// 导入组件
import { Counter } from './components/Counter'
import { TodoList } from './components/TodoList'
import { Timer } from './components/Timer'
import { ThemeToggle } from './components/ThemeToggle'
import { Tabs } from './components/Tabs'

// 全局主题状态
export const isDark = ref(true)

export const App = () => {
  const activeTab = ref('counter')

  const tabs = [
    { id: 'counter', label: '🔢 Counter', icon: '计数器' },
    { id: 'todo', label: '📝 Todo', icon: '待办事项' },
    { id: 'timer', label: '⏱️ Timer', icon: '计时器' },
  ]

  return (
    <div class="app">
      {/* Header */}
      <header class="header">
        <div class="header-content">
          <div class="logo-section">
            <img src="/logo.svg" class="logo" alt="Rasen logo" />
            <div class="brand">
              <h1 class="title">Rasen</h1>
              <span class="tagline">らせん · Spiral Reactive Framework</span>
            </div>
          </div>
          <div class="header-actions">
            <ThemeToggle />
            <a href="https://github.com/rasenjs/rasen" target="_blank" class="github-link">
              GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section class="hero">
        <div class="hero-content">
          <h2 class="hero-title">
            Build Reactive UIs with
            <span class="gradient-text"> Zero Compromise</span>
          </h2>
          <p class="hero-desc">
            Framework-agnostic reactive core. Multiple render targets. 
            Fine-grained reactivity. TypeScript first.
          </p>
          <div class="hero-features">
            <div class="feature">
              <span class="feature-icon">🎯</span>
              <span>Agnostic Core</span>
            </div>
            <div class="feature">
              <span class="feature-icon">⚡</span>
              <span>Fine-grained</span>
            </div>
            <div class="feature">
              <span class="feature-icon">🖼️</span>
              <span>Multi-target</span>
            </div>
            <div class="feature">
              <span class="feature-icon">📦</span>
              <span>Lightweight</span>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <main class="main">
        <section class="demo-section">
          <h3 class="section-title">Interactive Examples</h3>
          <p class="section-desc">
            Explore Rasen's reactive capabilities through these live demos
          </p>

          <Tabs tabs={tabs} activeTab={activeTab} />

          <div class="demo-content">
            <div class={computed(() => `demo-panel ${activeTab.value === 'counter' ? 'active' : 'hidden'}`)}>
              <Counter />
            </div>
            <div class={computed(() => `demo-panel ${activeTab.value === 'todo' ? 'active' : 'hidden'}`)}>
              <TodoList />
            </div>
            <div class={computed(() => `demo-panel ${activeTab.value === 'timer' ? 'active' : 'hidden'}`)}>
              <Timer />
            </div>
          </div>
        </section>

        {/* Code Example Section */}
        <section class="code-section">
          <h3 class="section-title">Simple & Intuitive</h3>
          <div class="code-example">
            <div class="code-header">
              <span class="code-file">Counter.tsx</span>
              <span class="code-lang">TSX</span>
            </div>
            <pre class="code-block">
              <code>{`import { ref, computed } from '@rasenjs/reactive-signals'

export const Counter = () => {
  const count = ref(0)
  const double = computed(() => count.value * 2)

  return (
    <div>
      <p>Count: {count}</p>
      <p>Double: {double}</p>
      <button onClick={() => count.value++}>
        Increment
      </button>
    </div>
  )
}`}</code>
            </pre>
          </div>
        </section>

        {/* Features Grid */}
        <section class="features-section">
          <h3 class="section-title">Why Rasen?</h3>
          <div class="features-grid">
            <div class="feature-card">
              <div class="feature-card-icon">🔄</div>
              <h4>Reactive Runtime Agnostic</h4>
              <p>Use Vue's reactivity, Signals, or bring your own reactive system.</p>
            </div>
            <div class="feature-card">
              <div class="feature-card-icon">🎨</div>
              <h4>Multiple Render Targets</h4>
              <p>DOM, Canvas 2D, React Native, and more with the same API.</p>
            </div>
            <div class="feature-card">
              <div class="feature-card-icon">⚡</div>
              <h4>Fine-grained Updates</h4>
              <p>Only update what changed. No virtual DOM diffing overhead.</p>
            </div>
            <div class="feature-card">
              <div class="feature-card-icon">🔧</div>
              <h4>TypeScript First</h4>
              <p>Full type safety with excellent IDE support out of the box.</p>
            </div>
          </div>
        </section>
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
}
