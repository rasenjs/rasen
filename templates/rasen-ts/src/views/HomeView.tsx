/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { com } from '@rasenjs/core'

export const HomeView = com(() => {
  return (
    <div>
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

      {/* Main Content */}
      <main class="main">
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
    </div>
  )
})
