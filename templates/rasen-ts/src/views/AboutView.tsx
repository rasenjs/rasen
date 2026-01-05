/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { com } from '@rasenjs/core'

export const AboutView = com(() => {
  return (
    <div class="view-container">
      <div class="about-section">
        <h2 class="view-title">About Rasen</h2>
        <div class="about-content">
          <section class="about-block">
            <h3>What is Rasen?</h3>
            <p>
              Rasen (らせん, meaning "spiral") is a reactive rendering framework
              designed for maximum flexibility and performance. It provides a
              framework-agnostic reactive core that can target multiple rendering
              platforms.
            </p>
          </section>

          <section class="about-block">
            <h3>Features</h3>
            <ul class="feature-list">
              <li>🎯 <strong>Framework Agnostic</strong> - Works with Vue, Signals, or any reactive library</li>
              <li>⚡ <strong>Fine-grained Reactivity</strong> - Only update what needs to change</li>
              <li>🖼️ <strong>Multi-target Rendering</strong> - DOM, Canvas 2D, WebGL, React Native, and more</li>
              <li>📦 <strong>Lightweight</strong> - Small bundle size with tree-shaking support</li>
              <li>🔒 <strong>Type Safe</strong> - Full TypeScript support with strict typing</li>
              <li>🚀 <strong>Performance</strong> - Optimized for speed and efficiency</li>
            </ul>
          </section>

          <section class="about-block">
            <h3>Architecture</h3>
            <p>
              Rasen follows a layered architecture with a reactive core at the center,
              surrounded by renderer implementations for different platforms. This design
              allows you to write your application logic once and render it anywhere.
            </p>
          </section>

          <section class="about-block">
            <h3>Links</h3>
            <div class="link-group">
              <a href="https://github.com/rasenjs/rasen" target="_blank" class="about-link">
                📦 GitHub Repository
              </a>
              <a href="https://rasenjs.dev" target="_blank" class="about-link">
                📚 Documentation
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
})
