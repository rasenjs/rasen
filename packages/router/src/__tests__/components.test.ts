/**
 * @rasenjs/router/components 测试
 * 
 * 测试平台无关的 Link 和 RouterView 组件
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest'
import { z } from 'zod'
import { route, template, createRoutes, createRouter, createMemoryHistory } from '../index'
import { createRouterLink, createRouterView, layout, type Anchor, type AnchorProps, type Child, type ViewsConfig } from '../components'
import type { Mountable } from '@rasenjs/core'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-signals'

// 设置 reactive runtime
beforeAll(() => {
  setReactiveRuntime(createReactiveRuntime())
})

// 创建测试用的路由
function createTestRouter() {
  const routes = createRoutes({
    home: route(template`/`),
    about: route(template`/about`),
    user: route(template`/users/${{ id: z.string() }}`),
    post: route(template`/posts/${{ id: z.coerce.number() }}`),
  })

  const history = createMemoryHistory()
  const router = createRouter(routes, { history })

  return { routes, router, history }
}

// 简单的 anchor 组件（模拟平台的 anchor 实现）
const TestAnchor: Anchor<HTMLElement> = (props: AnchorProps, ...children: Array<Child<HTMLElement>>) => {
  return (host: HTMLElement) => {
    const anchor = document.createElement('a')
    anchor.href = props.href
    
    // 处理 dataActive（可能是静态值或 getter）
    const updateActive = () => {
      const isActive = typeof props.dataActive === 'function' 
        ? props.dataActive() 
        : props.dataActive
      if (isActive) {
        anchor.setAttribute('data-active', 'true')
      } else {
        anchor.removeAttribute('data-active')
      }
    }
    updateActive()

    anchor.addEventListener('click', props.onClick as EventListener)

    // 挂载 children
    const childUnmounts: Array<(() => void) | void> = []
    for (const child of children) {
      if (typeof child === 'string') {
        anchor.appendChild(document.createTextNode(child))
      } else if (typeof child === 'function') {
        childUnmounts.push(child(anchor))
      }
    }

    host.appendChild(anchor)

    return () => {
      anchor.removeEventListener('click', props.onClick as EventListener)
      childUnmounts.forEach(u => u?.())
      anchor.remove()
    }
  }
}

describe('createRouterLink', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('should create a Link component that returns Mountable', () => {
    const { router, routes } = createTestRouter()
    const Link = createRouterLink(router, TestAnchor)

    const mountFn = Link({ to: routes.home, params: {} }, 'Home')
    expect(typeof mountFn).toBe('function')
  })

  it('should mount an anchor element with correct href', () => {
    const { router, routes } = createTestRouter()
    const Link = createRouterLink(router, TestAnchor)

    const mountFn = Link({ to: routes.home, params: {} }, 'Home')
    const unmount = mountFn(container)

    const anchor = container.querySelector('a')
    expect(anchor).not.toBeNull()
    expect(anchor?.href).toContain('/')
    expect(anchor?.textContent).toBe('Home')

    unmount?.()
  })

  it('should generate correct href for routes with params', () => {
    const { router, routes } = createTestRouter()
    const Link = createRouterLink(router, TestAnchor)

    const mountFn = Link({ to: routes.user, params: { id: 'alice' } }, 'Alice')
    const unmount = mountFn(container)

    const anchor = container.querySelector('a')
    expect(anchor?.href).toContain('/users/alice')

    unmount?.()
  })

  it('should set data-active when route matches', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/about')
    
    const Link = createRouterLink(router, TestAnchor)
    const mountFn = Link({ to: routes.about, params: {} }, 'About')
    const unmount = mountFn(container)

    const anchor = container.querySelector('a')
    expect(anchor?.hasAttribute('data-active')).toBe(true)

    unmount?.()
  })

  it('should not set data-active when route does not match', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')
    
    const Link = createRouterLink(router, TestAnchor)
    const mountFn = Link({ to: routes.about, params: {} }, 'About')
    const unmount = mountFn(container)

    const anchor = container.querySelector('a')
    expect(anchor?.hasAttribute('data-active')).toBe(false)

    unmount?.()
  })

  it('should navigate on click', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')
    
    const Link = createRouterLink(router, TestAnchor)
    const mountFn = Link({ to: routes.about, params: {} }, 'About')
    const unmount = mountFn(container)

    const anchor = container.querySelector('a')
    
    // 模拟点击
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor?.dispatchEvent(event)

    expect(history.getPath()).toBe('/about')

    unmount?.()
  })

  it('should not navigate on click with modifier keys', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')
    
    const Link = createRouterLink(router, TestAnchor)
    const mountFn = Link({ to: routes.about, params: {} }, 'About')
    const unmount = mountFn(container)

    const anchor = container.querySelector('a')
    
    // 模拟 Ctrl+点击
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    anchor?.dispatchEvent(event)

    // 路径不应改变
    expect(history.getPath()).toBe('/')

    unmount?.()
  })

  it('should cleanup on unmount', () => {
    const { router, routes } = createTestRouter()
    const Link = createRouterLink(router, TestAnchor)

    const mountFn = Link({ to: routes.home, params: {} }, 'Home')
    const unmount = mountFn(container)

    expect(container.querySelector('a')).not.toBeNull()

    unmount?.()

    expect(container.querySelector('a')).toBeNull()
  })

  it('should support multiple children', () => {
    const { router, routes } = createTestRouter()
    const Link = createRouterLink(router, TestAnchor)

    const icon: Mountable<HTMLElement> = (host) => {
      const span = document.createElement('span')
      span.className = 'icon'
      span.textContent = '🏠'
      host.appendChild(span)
      return () => span.remove()
    }

    const mountFn = Link({ to: routes.home, params: {} }, icon, ' Home')
    const unmount = mountFn(container)

    const anchor = container.querySelector('a')
    expect(anchor?.querySelector('.icon')?.textContent).toBe('🏠')
    expect(anchor?.textContent).toContain('Home')

    unmount?.()
  })
})

describe('createRouterView', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('should create a RouterView component that returns Mountable', () => {
    const { router, routes } = createTestRouter()
    const views = {
      home: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
      about: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
      user: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
      post: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
    }
    const RouterView = createRouterView(router, routes, views)

    const mountFn = RouterView()
    expect(typeof mountFn).toBe('function')
  })

  it('should render the matched view', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const views = {
      home: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        div.className = 'home-view'
        div.textContent = 'Home'
        host.appendChild(div)
        return () => div.remove()
      },
      about: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
      user: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
      post: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
    }
    const RouterView = createRouterView(router, routes, views)

    const unmount = RouterView()(container)

    expect(container.querySelector('.home-view')?.textContent).toBe('Home')

    unmount?.()
  })

  it('should render default when no route matches', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/nonexistent')

    const views = {
      home: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        div.className = 'home-view'
        host.appendChild(div)
        return () => div.remove()
      },
      about: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
      user: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
      post: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
    }
    const RouterView = createRouterView(router, routes, views, {
      default: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        div.className = 'not-found'
        div.textContent = '404'
        host.appendChild(div)
        return () => div.remove()
      },
    })

    const unmount = RouterView()(container)

    expect(container.querySelector('.not-found')?.textContent).toBe('404')

    unmount?.()
  })

  it('should pass params to view component', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/users/alice')

    const views = {
      home: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
      about: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
      user: ({ id }: { id: string }) => (host: HTMLElement) => {
        const div = document.createElement('div')
        div.className = 'user-view'
        div.textContent = `User: ${id}`
        host.appendChild(div)
        return () => div.remove()
      },
      post: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => div.remove()
      },
    }
    const RouterView = createRouterView(router, routes, views)

    const unmount = RouterView()(container)

    expect(container.querySelector('.user-view')?.textContent).toBe('User: alice')

    unmount?.()
  })

  it('should cleanup on unmount', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const viewUnmountSpy = vi.fn()

    const views = {
      home: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        div.className = 'home-view'
        host.appendChild(div)
        return viewUnmountSpy
      },
      about: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => {}
      },
      user: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => {}
      },
      post: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        host.appendChild(div)
        return () => {}
      },
    }
    const RouterView = createRouterView(router, routes, views)

    const unmount = RouterView()(container)

    expect(container.querySelector('.home-view')).not.toBeNull()

    unmount?.()

    expect(viewUnmountSpy).toHaveBeenCalled()
  })

  it('should support layout with nested routes', () => {
    const routes = createRoutes({
      home: route(template`/`),
      dashboard: {
        overview: route(),
        settings: route(),
      },
    })
    const history = createMemoryHistory('/')
    const router = createRouter(routes, { history })

    const layoutSpy = vi.fn()
    
    const views = {
      home: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        div.className = 'home'
        host.appendChild(div)
        return () => div.remove()
      },
      dashboard: {
        [layout]: (children: () => Mountable<HTMLElement>) => (host: HTMLElement) => {
          layoutSpy()
          const wrapper = document.createElement('div')
          wrapper.className = 'dashboard-layout'
          host.appendChild(wrapper)
          const unmountChild = children()(wrapper)
          return () => {
            unmountChild?.()
            wrapper.remove()
          }
        },
        overview: () => (host: HTMLElement) => {
          const div = document.createElement('div')
          div.className = 'overview'
          host.appendChild(div)
          return () => div.remove()
        },
        settings: () => (host: HTMLElement) => {
          const div = document.createElement('div')
          div.className = 'settings'
          host.appendChild(div)
          return () => div.remove()
        },
      },
    }

    const RouterView = createRouterView(router, routes, views)
    
    // 导航到 dashboard/overview
    history.push('/dashboard/overview')
    
    const unmount = RouterView()(container)
    
    // 应该调用了 layout
    expect(layoutSpy).toHaveBeenCalled()
    // 应该有 dashboard-layout 包裹 overview
    expect(container.querySelector('.dashboard-layout .overview')).not.toBeNull()
    
    unmount?.()
  })
})
