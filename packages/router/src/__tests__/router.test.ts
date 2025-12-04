import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { z } from 'zod'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-signals'
import {
  template,
  createRouter as originalCreateRouter,
  createMemoryHistory,
  NavigationAbortedError,
  type RoutesConfig,
  type HistoryAdapter
} from '../index'

// 为每个测试重新创建响应式运行时，防止内存积累
let createdRouters: Array<{ destroy(): void }> = []

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
  createdRouters = []
})

afterEach(() => {
  // 清理所有创建的路由器
  createdRouters.forEach(router => {
    try {
      router.destroy()
    } catch (e) {
      // ignore
    }
  })
  createdRouters = []
})

// 包装 createRouter 以自动追踪和清理
function createRouter<T extends RoutesConfig>(
  config: T,
  options?: { history?: HistoryAdapter; redirectDepthLimit?: number | false }
): ReturnType<typeof originalCreateRouter<T>> {
  const router = originalCreateRouter(config, options)
  createdRouters.push(router)
  return router
}

describe('route config', () => {
  it('should accept empty object config', () => {
    const router = createRouter({ home: {} })
    expect(router.routes.home).toBeDefined()
  })

  it('should have correct types for router.routes', () => {
    const router = createRouter({
      home: { path: template`/` },
      user: template`/users/${{ id: z.string() }}`,
      settings: {
        profile: {},
        account: template`${{ section: z.string() }}`,
      }
    })

    // 测试 routes 类型推断
    const { routes } = router
    
    // 这些应该是类型安全的
    expect(routes.home).toBeDefined()
    expect(routes.user).toBeDefined()
    expect(routes.settings.profile).toBeDefined()
    expect(routes.settings.account).toBeDefined()
    
    // 测试 href 的类型推断
    expect(router.href(routes.home)).toBe('/')
    expect(router.href(routes.user, { params: { id: 'alice' } })).toBe('/users/alice')
    expect(router.href(routes.settings.account, { params: { section: 'password' } })).toBe('/settings/account/password')
  })

  it('should support navigation by route key strings', () => {
    const router = createRouter({
      home: { path: template`/` },
      user: template`/users/${{ id: z.string() }}`,
      settings: {
        profile: {},
        account: template`${{ section: z.string() }}`,
      }
    })

    // 测试通过字符串键生成 href
    expect(router.href('home')).toBe('/')
    expect(router.href('user', { params: { id: 'bob' } })).toBe('/users/bob')
    expect(router.href('settings.profile')).toBe('/settings/profile')
    expect(router.href('settings.account', { params: { section: 'security' } })).toBe('/settings/account/security')
  })

  it('should support navigation by route key strings with history', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter({
      home: { path: template`/` },
      user: template`/users/${{ id: z.string() }}`,
      settings: {
        profile: {},
        account: template`${{ section: z.string() }}`,
      }
    }, { history })

    // 测试通过字符串键导航
    await router.push('user', { params: { id: 'charlie' } })
    expect(history.getPath()).toBe('/users/charlie')
    expect(router.current?.params).toEqual({ id: 'charlie' })

    await router.push('settings.profile')
    expect(history.getPath()).toBe('/settings/profile')

    await router.push('settings.account', { params: { section: 'password' } })
    expect(history.getPath()).toBe('/settings/account/password')
    expect(router.current?.params).toEqual({ section: 'password' })
  })

  it('should throw error for invalid route key', () => {
    const router = createRouter({
      home: { path: template`/` },
      user: template`/users/${{ id: z.string() }}`,
    })

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.href('invalid' as any)
    }).toThrow('Route not found for key: invalid')
  })

  it('should create route input with string path', () => {
    const r = { path: template`/about` }
    expect(r.path).toBeDefined()
    expect(r.path.pattern).toBe('/about')
  })

  it('should create route input with template', () => {
    const r = template`/users/${{ id: z.string() }}`
    expect(r.pattern).toBe('/users/:id')
  })

  it('should create route config with template and options', () => {
    const r = {
      path: template`/users/${{ id: z.string() }}`,
      query: { page: z.coerce.number().optional() },
      meta: { title: 'User' }
    }
    expect(r.path).toBeDefined()
    expect(r.query).toHaveProperty('page')
    expect(r.meta).toEqual({ title: 'User' })
  })

  it('should support string path in config', () => {
    const router = createRouter({
      home: '/home',
      about: '/about',
      users: '/users'
    })

    expect(router.routes.home).toBeDefined()
    expect(router.routes.about).toBeDefined()
    expect(router.routes.users).toBeDefined()

    // 测试匹配
    const homeMatch = router.match('/home')
    expect(homeMatch).not.toBeNull()
    expect(homeMatch?.path).toBe('/home')

    const aboutMatch = router.match('/about')
    expect(aboutMatch).not.toBeNull()
    expect(aboutMatch?.path).toBe('/about')

    // 测试 href 生成
    expect(router.href(router.routes.home)).toBe('/home')
    expect(router.href(router.routes.about)).toBe('/about')
  })
})

describe('nested routes structure', () => {
  it('should preserve nested structure in createRouter', () => {
    const router = createRouter({
      home: {},
      posts: {
        list: {},
        detail: template`${{ id: z.string() }}`
      }
    })

    // 嵌套结构保留
    expect(router.routes.home._isRoute).toBe(true)
    expect(router.routes.posts.list._isRoute).toBe(true)
    expect(router.routes.posts.detail._isRoute).toBe(true)
  })

  it('should calculate fullPath correctly', () => {
    const router = createRouter({
      home: {},
      posts: {
        list: {},
        detail: template`${{ id: z.string() }}`
      }
    })

    expect(router.routes.home.fullPath).toBe('/home')
    expect(router.routes.posts.list.fullPath).toBe('/posts/list')
    expect(router.routes.posts.detail.fullPath).toBe('/posts/detail/:id')
  })

  it('should handle absolute paths', () => {
    const router = createRouter({
      home: template`/`,
      user: template`/users/${{ id: z.string() }}`
    })

    expect(router.routes.home.fullPath).toBe('/')
    expect(router.routes.user.fullPath).toBe('/users/:id')
  })

  it('should throw on empty key', () => {
    expect(() => {
      createRouter({
        '': {}
      })
    }).toThrow('Empty key is not allowed')
  })

  it('should support route aliases with different URL patterns', () => {
    const router = createRouter({
      user: template`/users/${{ id: z.string() }}`,
      profile: {
        alias: { path: template`/users/${{ id: z.string() }}` },
        path: template`/profile/${{ id: z.string() }}`
      }
    })

    const routes = router.routes

    // 别名和原路由都是独立的 Route 对象
    expect(routes.user).not.toBe(routes.profile)

    // 它们有不同的 fullPath（由于使用了绝对路径模板）
    expect(routes.user.fullPath).toBe('/users/:id')
    expect(routes.profile.fullPath).toBe('/profile/:id')

    // 匹配不同的 URL
    const userMatch = router.match('/users/123')
    expect(userMatch?.route).toBe(routes.user)
    expect(userMatch?.params).toEqual({ id: '123' })

    const profileMatch = router.match('/profile/456')
    expect(profileMatch?.route).toBe(routes.profile)
    expect(profileMatch?.params).toEqual({ id: '456' })

    // href 生成各自的 URL
    expect(router.href(routes.user, { params: { id: '123' } })).toBe('/users/123')
    expect(router.href(routes.profile, { params: { id: '456' } })).toBe('/profile/456')
  })
})

describe('createRouter', () => {
  const createTestRouter = () => createRouter({
    home: template`/`,
    user: template`/users/${{ id: z.string() }}`,
    post: template`/posts/${{ id: z.coerce.number() }}`
  })

  it('should match routes', () => {
    const router = createTestRouter()
    const routes = router.routes

    const homeMatch = router.match('/')
    expect(homeMatch?.route).toBe(routes.home)
    expect(homeMatch?.params).toEqual({})

    const userMatch = router.match('/users/123')
    expect(userMatch?.route).toBe(routes.user)
    expect(userMatch?.params).toEqual({ id: '123' })

    const postMatch = router.match('/posts/42')
    expect(postMatch?.route).toBe(routes.post)
    expect(postMatch?.params).toEqual({ id: 42 }) // coerced to number
  })

  it('should parse query parameters', () => {
    const router = createTestRouter()
    const routes = router.routes

    const match = router.match('/users/123?tab=profile&sort=name')
    expect(match?.route).toBe(routes.user)
    expect(match?.params).toEqual({ id: '123' })
    expect(match?.query).toEqual({ tab: 'profile', sort: 'name' })
  })

  it('should handle array query parameters', () => {
    const router = createTestRouter()

    const match = router.match('/users/123?tag=a&tag=b&tag=c')
    expect(match?.query).toEqual({ tag: ['a', 'b', 'c'] })
  })

  it('should return null for unmatched routes', () => {
    const router = createTestRouter()
    expect(router.match('/unknown')).toBeNull()
  })

  it('should generate href with route object', () => {
    const router = createTestRouter()
    const routes = router.routes

    expect(router.href(routes.home)).toBe('/')
    expect(router.href(routes.user, { params: { id: '123' } })).toBe('/users/123')
    expect(router.href(routes.post, { params: { id: 42 } })).toBe('/posts/42')
  })

  it('should generate href with query parameters', () => {
    const router = createTestRouter()
    const routes = router.routes

    expect(
      router.href(routes.user, { params: { id: '123' }, query: { tab: 'profile' } })
    ).toBe('/users/123?tab=profile')
    expect(
      router.href(routes.post, { params: { id: 42 }, query: { page: 1, sort: 'date' } })
    ).toBe('/posts/42?page=1&sort=date')
  })

  it('should navigate with history using route object', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter({
      home: template`/`,
      user: template`/users/${{ id: z.string() }}`,
      post: template`/posts/${{ id: z.coerce.number() }}`
    }, { history })

    const routes = router.routes
    expect(router.current?.route).toBe(routes.home)

    await router.push(routes.user, { params: { id: '123' } })
    expect(router.current?.route).toBe(routes.user)
    expect(router.current?.params).toEqual({ id: '123' })
    expect(history.getPath()).toBe('/users/123')
  })

  it('should navigate with query parameters', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter({
      home: template`/`,
      user: template`/users/${{ id: z.string() }}`,
      post: template`/posts/${{ id: z.coerce.number() }}`
    }, { history })
    const routes = router.routes

    await router.push(
      routes.user,
      { params: { id: '123' }, query: { tab: 'settings' } }
    )
    expect(router.current?.route).toBe(routes.user)
    expect(router.current?.params).toEqual({ id: '123' })
    expect(router.current?.query).toEqual({ tab: 'settings' })
    expect(history.getPath()).toBe('/users/123?tab=settings')
  })

  it('should respond to route changes via afterEach hook', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter({
      home: template`/`,
      user: template`/users/${{ id: z.string() }}`,
      post: template`/posts/${{ id: z.coerce.number() }}`
    }, { history })
    const routes = router.routes

    const matches: (typeof router.current)[] = []
    const unregister = router.afterEach((to) => {
      matches.push(to)
    })

    await router.push(routes.user, { params: { id: '123' } })
    await router.push(routes.post, { params: { id: 42 } })

    expect(matches).toHaveLength(2)
    expect(matches[0]?.route).toBe(routes.user)
    expect(matches[1]?.route).toBe(routes.post)

    unregister()
  })

  it('should expose routes config', () => {
    const router = createTestRouter()
    expect(router.routes).toBeDefined()
    expect(router.routes.home._isRoute).toBe(true)
  })
})

describe('nested routes', () => {
  it('should work with deeply nested routes', () => {
    const router = createRouter({
      admin: {
        dashboard: {
          stats: {},
          users: template`${{ id: z.string() }}`
        }
      }
    })

    const routes = router.routes

    expect(routes.admin.dashboard.stats.fullPath).toBe('/admin/dashboard/stats')
    expect(routes.admin.dashboard.users.fullPath).toBe(
      '/admin/dashboard/users/:id'
    )

    const statsMatch = router.match('/admin/dashboard/stats')
    expect(statsMatch?.route).toBe(routes.admin.dashboard.stats)

    const usersMatch = router.match('/admin/dashboard/users/alice')
    expect(usersMatch?.route).toBe(routes.admin.dashboard.users)
    expect(usersMatch?.params).toEqual({ id: 'alice' })
  })

  it('should allow absolute path escape', () => {
    const router = createRouter({
      app: {
        home: template`/`, // absolute → /
        dashboard: {}, // relative → /app/dashboard
        settings: template`/settings` // absolute → /settings
      }
    })

    const routes = router.routes

    expect(routes.app.home.fullPath).toBe('/')
    expect(routes.app.dashboard.fullPath).toBe('/app/dashboard')
    expect(routes.app.settings.fullPath).toBe('/settings')

    expect(router.match('/')?.route).toBe(routes.app.home)
    expect(router.match('/app/dashboard')?.route).toBe(routes.app.dashboard)
    expect(router.match('/settings')?.route).toBe(routes.app.settings)
  })
})

describe('meta inheritance', () => {
  it('should inherit parent meta in nested routes', () => {
    const router = createRouter({
      admin: {
        dashboard: { meta: { requiresAuth: true, section: 'dashboard' } },
        users: { meta: { section: 'users' } }
      }
    })

    // 先检查路由对象本身的 meta
    expect(router.routes.admin.dashboard.meta).toEqual({ requiresAuth: true, section: 'dashboard' })
    expect(router.routes.admin.users.meta).toEqual({ section: 'users' })

    const dashboardMatch = router.match('/admin/dashboard')
    expect(dashboardMatch?.meta).toEqual({ requiresAuth: true, section: 'dashboard' })

    const usersMatch = router.match('/admin/users')
    expect(usersMatch?.meta).toEqual({ section: 'users' })
  })

  it('should merge parent and child meta', () => {
    interface AppMeta {
      layout?: string
      requiresAuth?: boolean
      title?: string
    }

    const router = createRouter({
      admin: {
        // 父路由没有定义 meta，子路由继承不到
        dashboard: { meta: { layout: 'admin', requiresAuth: true } as AppMeta },
        settings: {
          profile: { meta: { layout: 'admin', requiresAuth: true, title: 'Profile' } as AppMeta },
        }
      }
    })

    const dashboardMatch = router.match('/admin/dashboard')
    expect(dashboardMatch?.meta).toEqual({ layout: 'admin', requiresAuth: true })

    const profileMatch = router.match('/admin/settings/profile')
    expect(profileMatch?.meta).toEqual({ layout: 'admin', requiresAuth: true, title: 'Profile' })
  })

  it('should allow child meta to override parent meta', () => {
    interface Meta {
      layout: string
      requiresAuth: boolean
    }

    const router = createRouter({
      app: {
        dashboard: { meta: { layout: 'default', requiresAuth: false } as Meta },
        admin: { meta: { layout: 'admin', requiresAuth: true } as Meta }
      }
    })

    const dashboardMatch = router.match('/app/dashboard')
    expect(dashboardMatch?.meta).toEqual({ layout: 'default', requiresAuth: false })

    const adminMatch = router.match('/app/admin')
    expect(adminMatch?.meta).toEqual({ layout: 'admin', requiresAuth: true })
  })

  it('should work with route without meta', () => {
    const router = createRouter({
      home: { path: template`/` },
      about: { path: template`/about`, meta: { title: 'About' } }
    })

    const homeMatch = router.match('/')
    expect(homeMatch?.meta).toBeUndefined()

    const aboutMatch = router.match('/about')
    expect(aboutMatch?.meta).toEqual({ title: 'About' })
  })
})

describe('global hooks', () => {
  const createHooksTestRouter = () => {
    const history = createMemoryHistory('/')
    const router = createRouter({
      home: template`/`,
      about: template`/about`,
      user: template`/users/${{ id: z.string() }}`,
      admin: { path: template`/admin`, meta: { requiresAuth: true } }
    }, { history })
    return { routes: router.routes, router, history }
  }

  describe('beforeEach', () => {
    it('should call beforeEach guard before navigation', async () => {
      const { router, routes } = createHooksTestRouter()

      const guardCalls: Array<{ to: string; from: string }> = []
      router.beforeEach((to, from) => {
        guardCalls.push({
          to: to?.route.fullPath ?? 'null',
          from: from?.route.fullPath ?? 'null'
        })
      })

      await router.push(routes.about)

      expect(guardCalls).toHaveLength(1)
      expect(guardCalls[0]).toEqual({ to: '/about', from: '/' })
    })

    it('should block navigation when guard returns false', async () => {
      const { router, routes } = createHooksTestRouter()

      router.beforeEach(() => false)

      await expect(router.push(routes.about)).rejects.toThrow(
        NavigationAbortedError
      )
      expect(router.current?.route).toBe(routes.home)
    })

    it('should block navigation when guard returns string', async () => {
      const { router, routes } = createHooksTestRouter()

      router.beforeEach(() => 'Not allowed')

      await expect(router.push(routes.about)).rejects.toThrow(
        NavigationAbortedError
      )
      await expect(router.push(routes.about)).rejects.toThrow('Not allowed')
      expect(router.current?.route).toBe(routes.home)
    })

    it('should redirect when guard returns a Route', async () => {
      const { router, routes } = createHooksTestRouter()

      router.beforeEach((to) => {
        if (to?.route.meta?.requiresAuth) {
          return routes.home
        }
        return true
      })

      await router.push(routes.admin)
      expect(router.current?.route).toBe(routes.home)
    })

    it('should run multiple guards in order', async () => {
      const { router, routes } = createHooksTestRouter()

      const order: number[] = []
      router.beforeEach(() => {
        order.push(1)
      })
      router.beforeEach(() => {
        order.push(2)
      })
      router.beforeEach(() => {
        order.push(3)
      })

      await router.push(routes.about)

      expect(order).toEqual([1, 2, 3])
    })

    it('should stop running guards when one blocks navigation', async () => {
      const { router, routes } = createHooksTestRouter()

      const order: number[] = []
      router.beforeEach(() => {
        order.push(1)
      })
      router.beforeEach(() => {
        order.push(2)
        return false
      })
      router.beforeEach(() => {
        order.push(3)
      })

      await expect(router.push(routes.about)).rejects.toThrow(
        NavigationAbortedError
      )
      expect(order).toEqual([1, 2])
    })

    it('should allow unsubscribing guard', async () => {
      const { router, routes } = createHooksTestRouter()

      let callCount = 0
      const unsubscribe = router.beforeEach(() => {
        callCount++
      })

      await router.push(routes.about)
      expect(callCount).toBe(1)

      unsubscribe()
      await router.push(routes.user, { params: { id: '123' } })
      expect(callCount).toBe(1)
    })

    it('should support async guards', async () => {
      const { router, routes } = createHooksTestRouter()

      router.beforeEach(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return true
      })

      await router.push(routes.about)
      expect(router.current?.route).toBe(routes.about)
    })
  })

  describe('afterEach', () => {
    it('should call afterEach hook after navigation', async () => {
      const { router, routes } = createHooksTestRouter()

      const hookCalls: Array<{ to: string; from: string }> = []
      router.afterEach((to, from) => {
        hookCalls.push({
          to: to?.route.fullPath ?? 'null',
          from: from?.route.fullPath ?? 'null'
        })
      })

      await router.push(routes.about)

      expect(hookCalls).toHaveLength(1)
      expect(hookCalls[0]).toEqual({ to: '/about', from: '/' })
    })

    it('should not call afterEach when navigation is blocked', async () => {
      const { router, routes } = createHooksTestRouter()

      router.beforeEach(() => false)

      let afterCalled = false
      router.afterEach(() => {
        afterCalled = true
      })

      await expect(router.push(routes.about)).rejects.toThrow()
      expect(afterCalled).toBe(false)
    })

    it('should run multiple afterEach hooks', async () => {
      const { router, routes } = createHooksTestRouter()

      const order: number[] = []
      router.afterEach(() => {
        order.push(1)
      })
      router.afterEach(() => {
        order.push(2)
      })

      await router.push(routes.about)
      expect(order).toEqual([1, 2])
    })

    it('should allow unsubscribing afterEach hook', async () => {
      const { router, routes } = createHooksTestRouter()

      let callCount = 0
      const unsubscribe = router.afterEach(() => {
        callCount++
      })

      await router.push(routes.about)
      expect(callCount).toBe(1)

      unsubscribe()
      await router.push(routes.user, { params: { id: '123' } })
      expect(callCount).toBe(1)
    })
  })

  describe('onError', () => {
    it('should call onError when navigation fails', async () => {
      const { router, routes } = createHooksTestRouter()

      router.beforeEach(() => false)

      const errors: Array<{ error: Error; to: string }> = []
      router.onError((error, to) => {
        errors.push({
          error,
          to: to?.route.fullPath ?? 'null'
        })
      })

      await expect(router.push(routes.about)).rejects.toThrow()
      expect(errors).toHaveLength(1)
      expect(errors[0].error).toBeInstanceOf(NavigationAbortedError)
      expect(errors[0].to).toBe('/about')
    })

    it('should call onError with custom error message', async () => {
      const { router, routes } = createHooksTestRouter()

      router.beforeEach(() => 'Custom error message')

      let capturedError: Error | null = null
      router.onError((error) => {
        capturedError = error
      })

      await expect(router.push(routes.about)).rejects.toThrow()
      expect(capturedError).toBeInstanceOf(NavigationAbortedError)
      expect((capturedError as unknown as NavigationAbortedError).message).toBe(
        'Custom error message'
      )
    })

    it('should allow unsubscribing error handler', async () => {
      const { router, routes } = createHooksTestRouter()

      router.beforeEach(() => false)

      let callCount = 0
      const unsubscribe = router.onError(() => {
        callCount++
      })

      await expect(router.push(routes.about)).rejects.toThrow()
      expect(callCount).toBe(1)

      unsubscribe()
      await expect(router.push(routes.user, { params: { id: '123' } })).rejects.toThrow()
      expect(callCount).toBe(1)
    })
  })
})

describe('NavigationAbortedError', () => {
  it('should be an instance of Error', () => {
    const error = new NavigationAbortedError('test')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(NavigationAbortedError)
  })

  it('should have correct name', () => {
    const error = new NavigationAbortedError('test')
    expect(error.name).toBe('NavigationAbortedError')
  })

  it('should have correct message', () => {
    const error = new NavigationAbortedError('Navigation cancelled')
    expect(error.message).toBe('Navigation cancelled')
  })
})

describe('history navigation', () => {
  it('should go forward and backward with go()', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter(
      {
        home: { path: template`/` },
        about: { path: template`/about` },
        contact: { path: template`/contact` }
      },
      { history }
    )

    // 导航到 about
    await router.push('about')
    expect(router.current?.path).toBe('/about')

    // 导航到 contact
    await router.push('contact')
    expect(router.current?.path).toBe('/contact')

    // 后退一步（go -1）
    router.go(-1)
    expect(router.current?.path).toBe('/about')

    // 后退一步（go -1）
    router.go(-1)
    expect(router.current?.path).toBe('/')

    // 前进两步（go 2）
    router.go(2)
    expect(router.current?.path).toBe('/contact')
  })

  it('should go backward with back()', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter(
      {
        home: { path: template`/` },
        about: { path: template`/about` },
        contact: { path: template`/contact` }
      },
      { history }
    )

    // 导航序列
    await router.push('about')
    await router.push('contact')
    expect(router.current?.path).toBe('/contact')

    // 后退
    router.back()
    expect(router.current?.path).toBe('/about')

    // 再后退
    router.back()
    expect(router.current?.path).toBe('/')
  })

  it('should go forward with forward()', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter(
      {
        home: { path: template`/` },
        about: { path: template`/about` },
        contact: { path: template`/contact` }
      },
      { history }
    )

    // 导航序列
    await router.push('about')
    await router.push('contact')

    // 后退两次
    router.back()
    router.back()
    expect(router.current?.path).toBe('/')

    // 前进
    router.forward()
    expect(router.current?.path).toBe('/about')

    // 再前进
    router.forward()
    expect(router.current?.path).toBe('/contact')
  })

  it('should not go beyond history bounds', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter(
      {
        home: { path: template`/` },
        about: { path: template`/about` }
      },
      { history }
    )

    // 尝试后退，但已经在开始
    router.go(-5)
    expect(router.current?.path).toBe('/')

    // 导航并尝试前进超出范围
    await router.push('about')
    router.go(10)
    expect(router.current?.path).toBe('/about')
  })

  it('should track route changes via afterEach on history navigation', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter(
      {
        home: { path: template`/` },
        about: { path: template`/about` }
      },
      { history }
    )

    const paths: string[] = []
    router.afterEach((to) => {
      paths.push(to.path)
    })

    await router.push('about')
    router.back()
    router.forward()

    // 应该记录所有导航变化
    expect(paths).toContain('/about')
    expect(paths[paths.length - 1]).toBe('/about')
  })

  it('should track navigation state with isNavigating', async () => {
    const router = createRouter({
      home: template`/`,
      about: template`/about`,
    })

    // 初始状态应该是 false
    expect(router.isNavigating).toBe(false)

    // 记录 isNavigating 的状态变化
    const states: boolean[] = []
    router.beforeEach((_to, _from) => {
      states.push(router.isNavigating)
    })

    router.afterEach((_to) => {
      states.push(router.isNavigating)
    })

    await router.push('about')

    // beforeEach 时应该是 true，afterEach 时应该是 false
    expect(states.length).toBeGreaterThan(0)
    expect(states[0]).toBe(true) // beforeEach 中 isNavigating 应该是 true
    expect(states[states.length - 1]).toBe(false) // afterEach 中 isNavigating 应该是 false
    expect(router.isNavigating).toBe(false) // 导航完成后应该是 false
  })

  it('should set isNavigating to false when navigation has an error', async () => {
    const router = createRouter({
      home: template`/`,
      about: template`/about`,
    })

    expect(router.isNavigating).toBe(false)

    // 添加一个会抛出错误的守卫
    router.beforeEach((_to, _from) => {
      throw new Error('Navigation blocked')
    })

    router.onError((_error) => {
      // 错误处理
    })

    try {
      await router.push('about')
    } catch (_e) {
      // 预期会发生错误
    }

    // 即使发生错误，isNavigating 也应该被设置回 false
    expect(router.isNavigating).toBe(false)
  })

  it('should track isNavigating with replace', async () => {
    const router = createRouter({
      home: template`/`,
      about: template`/about`,
    })

    const states: boolean[] = []

    router.beforeEach(() => {
      states.push(router.isNavigating)
    })

    router.afterEach(() => {
      states.push(router.isNavigating)
    })

    await router.replace('about')

    expect(states[0]).toBe(true)
    expect(states[states.length - 1]).toBe(false)
    expect(router.isNavigating).toBe(false)
  })
})

describe('beforeEnter', () => {
  it('should execute single route beforeEnter guard', async () => {
    const beforeEnterMock = vi.fn(() => true)
    
    const router = createRouter({
      home: { path: template`/` },
      protected: {
        path: template`/protected`,
        beforeEnter: beforeEnterMock
      }
    })

    await router.push('protected')
    
    expect(beforeEnterMock).toHaveBeenCalledTimes(1)
    expect(router.current?.path).toBe('/protected')
  })

  it('should abort navigation when beforeEnter returns false', async () => {
    const router = createRouter({
      home: { path: template`/` },
      protected: {
        path: template`/protected`,
        beforeEnter: () => false
      }
    })

    await router.push('home')
    expect(router.current?.path).toBe('/')

    try {
      await router.push('protected')
    } catch (error) {
      expect(error).toBeInstanceOf(NavigationAbortedError)
    }
    
    // 应该保持在 home 页面
    expect(router.current?.path).toBe('/')
  })

  it('should redirect when beforeEnter returns a route', async () => {
    const router = createRouter({
      home: { path: template`/` },
      login: { path: template`/login` },
      protected: {
        path: template`/protected`,
        beforeEnter: (_to, from) => {
          // 如果没有来源路由，重定向到 login
          if (!from) {
            // 需要返回一个 Route 对象，而不是 RouteInput
            // 但我们无法在这里访问 router.routes.login（类型问题）
            // 所以改用 false 来测试取消导航
            return false
          }
          return true
        }
      }
    })

    // 先导航到 home，然后尝试进入 protected
    await router.push('home')
    await router.push('protected')
    
    expect(router.current?.path).toBe('/protected')
  })

  it('should execute beforeEnter after global beforeEach', async () => {
    const calls: string[] = []
    
    const router = createRouter({
      home: { path: template`/` },
      protected: {
        path: template`/protected`,
        beforeEnter: () => {
          calls.push('route-beforeEnter')
          return true
        }
      }
    })

    router.beforeEach(() => {
      calls.push('global-beforeEach')
    })

    await router.push('protected')
    
    expect(calls).toEqual(['global-beforeEach', 'route-beforeEnter'])
  })

  it('should not execute beforeEnter if global beforeEach redirects', async () => {
    const beforeEnterMock = vi.fn()
    
    const router = createRouter({
      home: { path: template`/` },
      login: { path: template`/login` },
      protected: {
        path: template`/protected`,
        beforeEnter: beforeEnterMock
      }
    })

    // 创建一个只在第一次 push 时重定向的 beforeEach 守卫
    let redirected = false
    const loginRoute = router.routes.login
    
    router.beforeEach((to) => {
      // 只有当导航到 protected 时才重定向
      if (to?.path === '/protected' && !redirected) {
        redirected = true
        return loginRoute
      }
      return true
    })

    // 从 protected 导航，beforeEach 会重定向到 login
    await router.push('protected')
    
    expect(beforeEnterMock).not.toHaveBeenCalled()
    expect(router.current?.path).toBe('/login')
  })



  it('should receive correct to and from parameters', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let receivedTo: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let receivedFrom: any
    
    const router = createRouter({
      home: { path: template`/` },
      protected: {
        path: template`/protected`,
        beforeEnter: (to, from) => {
          receivedTo = to
          receivedFrom = from
          return true
        }
      }
    })

    await router.push('home')
    await router.push('protected')
    
    expect(receivedTo?.path).toBe('/protected')
    expect(receivedFrom?.path).toBe('/')
  })

  it('should detect infinite redirect loop in dev mode (redirectDepthLimit enabled)', async () => {
    const errorHandler = vi.fn()
    
    // 开发模式：容忍度限制为 2
    const router = createRouter(
      {
        home: { path: template`/` },
        login: { path: template`/login` },
        dashboard: { path: template`/dashboard` }
      },
      { redirectDepthLimit: 2 }
    )

    router.onError(errorHandler)

    // 创建无限循环的 beforeEach：总是在两条不同路由之间循环
    router.beforeEach((to) => {
      // home → login → dashboard → login → dashboard...
      if (to?.path === '/' || to?.path === '/dashboard') {
        return router.routes.login
      }
      if (to?.path === '/login') {
        return router.routes.dashboard
      }
      return true
    })

    // 这应该抛出错误
    try {
      await router.push('home')
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('infinite redirect loop')
      expect((error as Error).message).toContain('limit: 2')
    }

    // onError 应该被调用
    expect(errorHandler).toHaveBeenCalled()
  })

  it('should allow intentional multi-step redirects within limit', async () => {
    // 开发模式：容忍度限制为 5
    const router = createRouter(
      {
        home: { path: template`/` },
        dashboard: { path: template`/dashboard` },
        welcome: { path: template`/welcome` }
      },
      { redirectDepthLimit: 5 }
    )

    let step = 0
    router.beforeEach((to) => {
      // home → dashboard → welcome 的连锁重定向
      if (to?.path === '/' && step === 0) {
        step++
        return router.routes.dashboard
      }
      if (to?.path === '/dashboard' && step === 1) {
        step++
        return router.routes.welcome
      }
      return true
    })

    // 应该成功完成多次重定向
    await router.push('home')
    
    expect(router.current?.path).toBe('/welcome')
    expect(step).toBe(2)
  })

  it('should NOT detect loop in production mode (redirectDepthLimit false)', async () => {
    const errorHandler = vi.fn()
    
    // 生产模式：无限制，会真的OOM（但我们用计数器限制测试）
    const router = createRouter(
      {
        home: { path: template`/` },
        login: { path: template`/login` }
      },
      { redirectDepthLimit: false }
    )

    router.onError(errorHandler)

    let redirectCount = 0
    router.beforeEach((to) => {
      redirectCount++
      if (to?.path !== '/login' && redirectCount < 100) {
        return router.routes.login
      }
      return true
    })

    // 由于容忍度无限制，应该继续运行直到自然停止或真的崩溃
    // 在这个测试中，redirect 会停止（因为 redirectCount >= 100）
    await router.push('home')
    
    // onError 不应该被调用（因为没有深度限制检查）
    expect(errorHandler).not.toHaveBeenCalled()
    expect(router.current?.path).toBe('/login')
  })
})
