/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { com } from '@rasenjs/core'

export const HomeView = com(() => {
  return (
    <div class="view-container">
      <div class="hero-section">
        <h2 class="hero-title">
          Welcome to
          <span class="gradient-text"> Rasen</span>
        </h2>
        <p class="hero-desc">
          Framework-agnostic reactive core. Multiple render targets.
          Fine-grained reactivity. TypeScript first.
        </p>
        <div class="hero-features">
          <div class="feature">
            <span class="feature-icon">🎯</span>
            <div class="feature-content">
              <h3>Agnostic Core</h3>
              <p>Works with any reactive library</p>
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon">⚡</span>
            <div class="feature-content">
              <h3>Fine-grained</h3>
              <p>Precise reactivity updates</p>
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon">🖼️</span>
            <div class="feature-content">
              <h3>Multi-target</h3>
              <p>DOM, Canvas, React Native, and more</p>
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon">📦</span>
            <div class="feature-content">
              <h3>Lightweight</h3>
              <p>Small bundle size, big performance</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
