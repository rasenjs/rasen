/**
 * Repro attempt: the browser symptom.
 *
 * In the plain (CSR) path the RouterView swap is fine — `match` unmounts the
 * previous branch. In the real app the SSR markup is hydrated and then the
 * route changes; that is the combination reported as "the page container does
 * not switch" (the old view stays, the new one is appended).
 *
 * So: hand-write server markup, hydrate it, then navigate and assert the old
 * view is gone.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { com } from '@rasenjs/core'
import { div, mount, hydrate } from '@rasenjs/dom'
import { createRouter, route, createMemoryHistory } from '@rasenjs/router'
import { createRouterView } from '@rasenjs/router-dom'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'

useReactiveRuntime()

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('RouterView after hydration', () => {
  let container: HTMLElement

  beforeEach(() => {
    // Server-rendered markup for: header / RouterView(home) / footer.
    // Minified exactly like real SSR output — interior whitespace would add
    // text nodes the client walker does not expect (hydration index drift).
    // `<!-- m -->` is the marker `match` emits through the host hooks: the
    // client claims it while hydrating (see the SSR assertion in the test),
    // so a fixture without it makes the walker mis-claim.
    document.body.innerHTML =
      '<div id="app"><div class="app">' +
      '<div class="header">header</div>' +
      '<div class="content"><!-- m --><div class="view-container"><div class="home-view">home</div></div></div>' +
      '<div class="footer">footer</div>' +
      '</div></div>'
    container = document.getElementById('app')!
  })

  it('replaces the hydrated branch on navigation', async () => {
    const history = createMemoryHistory('/')
    const routesConfig = { home: route('/'), about: route('/about') }
    const router = createRouter(routesConfig, { history })

    const HomeView = com(() =>
      div({ class: 'view-container' }, div({ class: 'home-view' }, 'home'))
    )
    const AboutView = com(() =>
      div({ class: 'view-container' }, div({ class: 'about-view' }, 'about'))
    )

    const RouterView = createRouterView(router, {
      home: () => HomeView(),
      about: () => AboutView(),
    })

    const Root = com(() =>
      div(
        { class: 'app' },
        div({ class: 'header' }, 'header'),
        div({ class: 'content' }, RouterView()),
        div({ class: 'footer' }, 'footer')
      )
    )

    hydrate(Root(), container)

    const app = container.querySelector('.app')!
    expect(app.querySelectorAll('.home-view').length).toBe(1)

    router.push(router.routes.about)
    await flush()

    expect(app.querySelectorAll('.home-view').length).toBe(0)
    expect(app.querySelectorAll('.about-view').length).toBe(1)
    // the footer survived and is still last
    const order = Array.from(app.children).map((c) => c.className)
    expect(order[order.length - 1]).toBe('footer')
  })
})
