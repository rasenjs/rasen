/**
 * @rasenjs/router/components 测试
 *
 * 测试平台无关的 Link 和 RouterView 组件
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi
} from 'vitest'
import { z } from 'zod'
import {
  template,
  createRouter,
  createMemoryHistory,
  NavigationAbortedError
} from '../index'
import {
  createRouterLink,
  createRouterView,
  createLeaveGuard,
  layout,
  type Anchor,
  type AnchorProps,
  type Child
} from '../components'
import type { Mountable } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'

// 为每个测试重新创建响应式运行时，防止内存积累
beforeEach(() => {
  useReactiveRuntime()
})

// 创建测试用的路由
function createTestRouter() {
  const history = createMemoryHistory('/')
  const router = createRouter({
    home: template`/`,
    about: template`/about`,
    user: template`/users/${{ id: z.string() }}`,
    post: template`/posts/${{ id: z.coerce.number() }}`
  }, { history })

  return { routes: router.routes, router, history }
}

// 简单的 anchor 组件（模拟平台的 anchor 实现）
const TestAnchor: Anchor<HTMLElement> = (
  props: AnchorProps,
  ...children: Array<Child<HTMLElement>>
) => {
  return (host: HTMLElement) => {
    const anchor = document.createElement('a')
    anchor.href = props.href

    // 处理 dataActive（可能是静态值或 getter）
    const updateActive = () => {
      const isActive =
        typeof props.dataActive === 'function'
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
        childUnmounts.push(child(anchor, undefined))
      }
    }

    host.appendChild(anchor)

    return () => {
      anchor.removeEventListener('click', props.onClick as EventListener)
      childUnmounts.forEach((u) => u?.())
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

    const mountFn = Link({ to: routes.home }, 'Home')
    expect(typeof mountFn).toBe('function')
  })

  it('should mount an anchor element with correct href', () => {
    const { router, routes } = createTestRouter()
    const Link = createRouterLink(router, TestAnchor)

    const mountFn = Link({ to: routes.home }, 'Home')
    const unmount = mountFn(container, undefined)

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
    const unmount = mountFn(container, undefined)

    const anchor = container.querySelector('a')
    expect(anchor?.href).toContain('/users/alice')

    unmount?.()
  })

  it('should set data-active when route matches', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/about')

    const Link = createRouterLink(router, TestAnchor)
    const mountFn = Link({ to: routes.about }, 'About')
    const unmount = mountFn(container, undefined)

    const anchor = container.querySelector('a')
    expect(anchor?.hasAttribute('data-active')).toBe(true)

    unmount?.()
  })

  it('should not set data-active when route does not match', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const Link = createRouterLink(router, TestAnchor)
    const mountFn = Link({ to: routes.about }, 'About')
    const unmount = mountFn(container, undefined)

    const anchor = container.querySelector('a')
    expect(anchor?.hasAttribute('data-active')).toBe(false)

    unmount?.()
  })

  it('should navigate on click', async () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const Link = createRouterLink(router, TestAnchor)
    const mountFn = Link({ to: routes.about }, 'About')
    const unmount = mountFn(container, undefined)

    const anchor = container.querySelector('a')

    // 模拟点击
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor?.dispatchEvent(event)

    // 等待异步导航完成
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(history.getPath()).toBe('/about')

    unmount?.()
  })

  it('should not navigate on click with modifier keys', () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const Link = createRouterLink(router, TestAnchor)
    const mountFn = Link({ to: routes.about }, 'About')
    const unmount = mountFn(container, undefined)

    const anchor = container.querySelector('a')

    // 模拟 Ctrl+点击
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true
    })
    anchor?.dispatchEvent(event)

    // 路径不应改变
    expect(history.getPath()).toBe('/')

    unmount?.()
  })

  it('should cleanup on unmount', () => {
    const { router, routes } = createTestRouter()
    const Link = createRouterLink(router, TestAnchor)

    const mountFn = Link({ to: routes.home }, 'Home')
    const unmount = mountFn(container, undefined)

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

    const mountFn = Link({ to: routes.home }, icon, ' Home')
    const unmount = mountFn(container, undefined)

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
    const { router } = createTestRouter()
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
      }
    }
    const RouterView = createRouterView<typeof router.routes, HTMLElement>(router, views)

    const mountFn = RouterView()
    expect(typeof mountFn).toBe('function')
  })

  it('should render the matched view', () => {
    const { router, history } = createTestRouter()
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
      }
    }
    const RouterView = createRouterView<typeof router.routes, HTMLElement>(router, views)

    const unmount = RouterView()(container, undefined)

    expect(container.querySelector('.home-view')?.textContent).toBe('Home')

    unmount?.()
  })

  it('should render default when no route matches', () => {
    const { router, history } = createTestRouter()
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
      }
    }
    const RouterView = createRouterView(router, views, {
      default: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        div.className = 'not-found'
        div.textContent = '404'
        host.appendChild(div)
        return () => div.remove()
      }
    })

    const unmount = RouterView()(container, undefined)

    expect(container.querySelector('.not-found')?.textContent).toBe('404')

    unmount?.()
  })

  it('should pass params to view component', () => {
    const { router, history } = createTestRouter()
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
      user:
        ({ id }: { id: string }) =>
        (host: HTMLElement) => {
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
      }
    }
    const RouterView = createRouterView<typeof router.routes, HTMLElement>(router, views)

    const unmount = RouterView()(container, undefined)

    expect(container.querySelector('.user-view')?.textContent).toBe(
      'User: alice'
    )

    unmount?.()
  })

  it('should cleanup on unmount', () => {
    const { router, history } = createTestRouter()
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
      }
    }
    const RouterView = createRouterView<typeof router.routes, HTMLElement>(router, views)

    const unmount = RouterView()(container, undefined)

    expect(container.querySelector('.home-view')).not.toBeNull()

    unmount?.()

    expect(viewUnmountSpy).toHaveBeenCalled()
  })

  it('should support layout with nested routes', () => {
    const history = createMemoryHistory('/')
    const router = createRouter({
      home: template`/`,
      dashboard: {
        overview: {},
        settings: {}
      }
    }, { history })
    
    const layoutSpy = vi.fn()

    const views = {
      home: () => (host: HTMLElement) => {
        const div = document.createElement('div')
        div.className = 'home'
        host.appendChild(div)
        return () => div.remove()
      },
      dashboard: {
        [layout]:
          (children: () => Mountable<HTMLElement>) => (host: HTMLElement) => {
            layoutSpy()
            const wrapper = document.createElement('div')
            wrapper.className = 'dashboard-layout'
            host.appendChild(wrapper)
            const unmountChild = children()(wrapper, undefined)
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
        }
      }
    }

    const RouterView = createRouterView<typeof router.routes, HTMLElement>(router, views)

    // 导航到 dashboard/overview
    history.push('/dashboard/overview')

    const unmount = RouterView()(container, undefined)

    // 应该调用了 layout
    expect(layoutSpy).toHaveBeenCalled()
    // 应该有 dashboard-layout 包裹 overview
    expect(
      container.querySelector('.dashboard-layout .overview')
    ).not.toBeNull()

    unmount?.()
  })
})

describe('createLeaveGuard', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('should create a leaveGuard component that returns Mountable', () => {
    const { router } = createTestRouter()
    const leaveGuard = createLeaveGuard(router)

    const mountFn = leaveGuard({ guard: () => true })
    expect(typeof mountFn).toBe('function')
  })

  it('should register guard on mount', async () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const leaveGuard = createLeaveGuard(router)
    const guardSpy = vi.fn(() => true)

    const mountFn = leaveGuard({ guard: guardSpy })
    const unmount = mountFn(container, undefined)

    await router.push(routes.about)

    expect(guardSpy).toHaveBeenCalledTimes(1)

    unmount?.()
  })

  it('should unregister guard on unmount', async () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const leaveGuard = createLeaveGuard(router)
    const guardSpy = vi.fn(() => true)

    const mountFn = leaveGuard({ guard: guardSpy })
    const unmount = mountFn(container, undefined)

    await router.push(routes.about)
    expect(guardSpy).toHaveBeenCalledTimes(1)

    unmount?.()

    await router.push(routes.user, { params: { id: '123' } })
    expect(guardSpy).toHaveBeenCalledTimes(1) // still 1, not 2
  })

  it('should block navigation when guard returns false', async () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const leaveGuard = createLeaveGuard(router)
    const mountFn = leaveGuard({ guard: () => false })
    const unmount = mountFn(container, undefined)

    await expect(router.push(routes.about)).rejects.toThrow(
      NavigationAbortedError
    )
    expect(router.current?.route).toBe(routes.home)

    unmount?.()
  })

  it('should block navigation when guard returns string', async () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const leaveGuard = createLeaveGuard(router)
    const mountFn = leaveGuard({ guard: () => 'Unsaved changes' })
    const unmount = mountFn(container, undefined)

    await expect(router.push(routes.about)).rejects.toThrow(
      'Unsaved changes'
    )

    unmount?.()
  })

  it('should allow navigation when guard returns true', async () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const leaveGuard = createLeaveGuard(router)
    const mountFn = leaveGuard({ guard: () => true })
    const unmount = mountFn(container, undefined)

    await router.push(routes.about)
    expect(router.current?.route).toBe(routes.about)

    unmount?.()
  })

  it('should support async guard', async () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const leaveGuard = createLeaveGuard(router)
    const mountFn = leaveGuard({
      guard: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return true
      }
    })
    const unmount = mountFn(container, undefined)

    await router.push(routes.about)
    expect(router.current?.route).toBe(routes.about)

    unmount?.()
  })

  it('should receive to and from route matches', async () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const leaveGuard = createLeaveGuard(router)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedTo: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedFrom: any = null

    const mountFn = leaveGuard({
      guard: (to, from) => {
        capturedTo = to
        capturedFrom = from
        return true
      }
    })
    const unmount = mountFn(container, undefined)

    await router.push(routes.about)

    expect(capturedTo?.route).toBe(routes.about)
    expect(capturedFrom?.route).toBe(routes.home)

    unmount?.()
  })

  it('should only trigger when leaving the mounted route, not when entering', async () => {
    const { router, routes, history } = createTestRouter()
    // 从首页开始
    history.push('/')

    const leaveGuard = createLeaveGuard(router)
    const guardSpy = vi.fn(() => true)

    // 先导航到 about 页面
    await router.push(routes.about)

    // 然后在 about 页面挂载 leaveGuard
    const mountFn = leaveGuard({ guard: guardSpy })
    const unmount = mountFn(container, undefined)

    // 此时从 about 导航到 user 应该触发守卫
    await router.push(routes.user, { params: { id: '123' } })
    expect(guardSpy).toHaveBeenCalledTimes(1)

    // 继续从 user 导航到 home 不应该触发守卫（因为 leaveGuard 是在 about 页面挂载的）
    await router.push(routes.home)
    expect(guardSpy).toHaveBeenCalledTimes(1) // still 1

    unmount?.()
  })

  it('should not trigger guard when navigating between other routes', async () => {
    const { router, routes, history } = createTestRouter()
    history.push('/')

    const leaveGuard = createLeaveGuard(router)
    const guardSpy = vi.fn(() => true)

    // 在首页挂载 leaveGuard
    const mountFn = leaveGuard({ guard: guardSpy })
    const unmount = mountFn(container, undefined)

    // 离开首页到 about - 应该触发
    await router.push(routes.about)
    expect(guardSpy).toHaveBeenCalledTimes(1)

    // 从 about 到 user - 不应该触发（我们保护的是首页）
    await router.push(routes.user, { params: { id: '123' } })
    expect(guardSpy).toHaveBeenCalledTimes(1) // still 1

    unmount?.()
  })
})
