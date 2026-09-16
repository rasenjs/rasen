/**
 * Repro: RouterView must swap the view when the route changes.
 *
 * `createRouterView` returns `match({ value, cases })`, so the swap depends on
 * match receiving the platform's host hooks (createMarker / boundedHost /
 * insert). This drives the real router + the DOM wrapper to check that:
 *   1. the previous view is removed on navigation, and
 *   2. the view stays at its own position (before the footer), not appended.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { com } from '@rasenjs/core'
import { div } from '@rasenjs/dom'
import { mount } from '@rasenjs/dom'
import { createRouter, route, createMemoryHistory } from '@rasenjs/router'
import { createRouterView } from '@rasenjs/router-dom'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'

useReactiveRuntime()

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('RouterView swap', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    container = document.getElementById('app')!
  })

  it('removes the previous view and keeps the view before the footer', async () => {
    const history = createMemoryHistory('/')
    const routesConfig = {
      home: route('/'),
      about: route('/about'),
    }
    const router = createRouter(routesConfig, { history })

    const HomeView = com(() => div({ class: 'home-view' }, 'home'))
    const AboutView = com(() => div({ class: 'about-view' }, 'about'))

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

    mount(Root(), container)

    const app = container.querySelector('.app')!
    expect(app.querySelectorAll('.home-view').length).toBe(1)

    router.push(router.routes.about)
    await flush()

    expect(app.querySelectorAll('.home-view').length).toBe(0)
    expect(app.querySelectorAll('.about-view').length).toBe(1)

    // still in its own slot, before the footer
    const content = app.querySelector('.content')!
    expect(content.querySelectorAll('.about-view').length).toBe(1)
    const order = Array.from(app.children).map((c) => c.className)
    expect(order[order.length - 1]).toBe('footer')
  })
})
