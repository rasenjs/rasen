import { describe, it, expect, beforeAll, vi } from 'vitest'
import { z } from 'zod'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-signals'
import {
  route,
  template,
  createRoutes,
  createRouter,
  createMemoryHistory,
  NavigationAbortedError
} from '../index'

// 初始化响应式运行时
beforeAll(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('route', () => {
  it('should create route input with no arguments', () => {
    const r = route()
    expect(r._isRouteInput).toBe(true)
    expect(r.template.pattern).toBe('')
  })

  it('should create route input with string path', () => {
    const r = route('/about')
    expect(r._isRouteInput).toBe(true)
    expect(r.template.pattern).toBe('/about')
  })

  it('should create route input with template', () => {
    const r = route(template`/users/${{ id: z.string() }}`)
    expect(r._isRouteInput).toBe(true)
    expect(r.template.pattern).toBe('/users/:id')
  })

  it('should create route input with options', () => {
    const r = route(template`/users/${{ id: z.string() }}`, {
      query: { page: z.coerce.number().optional() },
      meta: { title: 'User' }
    })
    expect(r._isRouteInput).toBe(true)
    expect(r.query).toHaveProperty('page')
    expect(r.meta).toEqual({ title: 'User' })
  })
})

describe('createRoutes', () => {
  it('should preserve nested structure', () => {
    const routes = createRoutes({
      home: route(),
      posts: {
        list: route(),
        detail: route(template`${{ id: z.string() }}`)
      }
    })

    // 嵌套结构保留
    expect(routes.home._isRoute).toBe(true)
    expect(routes.posts.list._isRoute).toBe(true)
    expect(routes.posts.detail._isRoute).toBe(true)
  })

  it('should calculate fullPath correctly', () => {
    const routes = createRoutes({
      home: route(),
      posts: {
        list: route(),
        detail: route(template`${{ id: z.string() }}`)
      }
    })

    expect(routes.home.fullPath).toBe('/home')
    expect(routes.posts.list.fullPath).toBe('/posts/list')
    expect(routes.posts.detail.fullPath).toBe('/posts/detail/:id')
  })

  it('should handle absolute paths', () => {
    const routes = createRoutes({
      home: route(template`/`),
      user: route(template`/users/${{ id: z.string() }}`)
    })

    expect(routes.home.fullPath).toBe('/')
    expect(routes.user.fullPath).toBe('/users/:id')
  })

  it('should throw on empty key', () => {
    expect(() => {
      createRoutes({
        '': route()
      })
    }).toThrow('Empty key is not allowed')
  })
})

describe('createRouter', () => {
  const routes = createRoutes({
    home: route(template`/`),
    user: route(template`/users/${{ id: z.string() }}`),
    post: route(template`/posts/${{ id: z.coerce.number() }}`)
  })

  it('should match routes', () => {
    const router = createRouter(routes)

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
    const router = createRouter(routes)

    const match = router.match('/users/123?tab=profile&sort=name')
    expect(match?.route).toBe(routes.user)
    expect(match?.params).toEqual({ id: '123' })
    expect(match?.query).toEqual({ tab: 'profile', sort: 'name' })
  })

  it('should handle array query parameters', () => {
    const router = createRouter(routes)

    const match = router.match('/users/123?tag=a&tag=b&tag=c')
    expect(match?.query).toEqual({ tag: ['a', 'b', 'c'] })
  })

  it('should return null for unmatched routes', () => {
    const router = createRouter(routes)
    expect(router.match('/unknown')).toBeNull()
  })

  it('should generate href with route object', () => {
    const router = createRouter(routes)

    expect(router.href(routes.home, {})).toBe('/')
    expect(router.href(routes.user, { id: '123' })).toBe('/users/123')
    expect(router.href(routes.post, { id: 42 })).toBe('/posts/42')
  })

  it('should generate href with query parameters', () => {
    const router = createRouter(routes)

    expect(
      router.href(routes.user, { id: '123' }, { query: { tab: 'profile' } })
    ).toBe('/users/123?tab=profile')
    expect(
      router.href(routes.post, { id: 42 }, { query: { page: 1, sort: 'date' } })
    ).toBe('/posts/42?page=1&sort=date')
  })

  it('should navigate with history using route object', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter(routes, { history })

    expect(router.current?.route).toBe(routes.home)

    await router.push(routes.user, { id: '123' })
    expect(router.current?.route).toBe(routes.user)
    expect(router.current?.params).toEqual({ id: '123' })
    expect(history.getPath()).toBe('/users/123')
  })

  it('should navigate with query parameters', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter(routes, { history })

    await router.push(
      routes.user,
      { id: '123' },
      { query: { tab: 'settings' } }
    )
    expect(router.current?.route).toBe(routes.user)
    expect(router.current?.params).toEqual({ id: '123' })
    expect(router.current?.query).toEqual({ tab: 'settings' })
    expect(history.getPath()).toBe('/users/123?tab=settings')
  })

  it('should subscribe to route changes', async () => {
    const history = createMemoryHistory('/')
    const router = createRouter(routes, { history })

    const matches: (typeof router.current)[] = []
    const unsubscribe = router.subscribe((match) => {
      matches.push(match)
    })

    await router.push(routes.user, { id: '123' })
    await router.push(routes.post, { id: 42 })

    expect(matches).toHaveLength(2)
    expect(matches[0]?.route).toBe(routes.user)
    expect(matches[1]?.route).toBe(routes.post)

    unsubscribe()
  })

  it('should expose routes config', () => {
    const router = createRouter(routes)
    expect(router.routes).toBe(routes)
  })
})

describe('nested routes', () => {
  it('should work with deeply nested routes', () => {
    const routes = createRoutes({
      admin: {
        dashboard: {
          stats: route(),
          users: route(template`${{ id: z.string() }}`)
        }
      }
    })

    expect(routes.admin.dashboard.stats.fullPath).toBe('/admin/dashboard/stats')
    expect(routes.admin.dashboard.users.fullPath).toBe(
      '/admin/dashboard/users/:id'
    )

    const router = createRouter(routes)

    const statsMatch = router.match('/admin/dashboard/stats')
    expect(statsMatch?.route).toBe(routes.admin.dashboard.stats)

    const usersMatch = router.match('/admin/dashboard/users/alice')
    expect(usersMatch?.route).toBe(routes.admin.dashboard.users)
    expect(usersMatch?.params).toEqual({ id: 'alice' })
  })

  it('should allow absolute path escape', () => {
    const routes = createRoutes({
      app: {
        home: route(template`/`), // absolute → /
        dashboard: route(), // relative → /app/dashboard
        settings: route(template`/settings`) // absolute → /settings
      }
    })

    expect(routes.app.home.fullPath).toBe('/')
    expect(routes.app.dashboard.fullPath).toBe('/app/dashboard')
    expect(routes.app.settings.fullPath).toBe('/settings')

    const router = createRouter(routes)
    expect(router.match('/')?.route).toBe(routes.app.home)
    expect(router.match('/app/dashboard')?.route).toBe(routes.app.dashboard)
    expect(router.match('/settings')?.route).toBe(routes.app.settings)
  })
})

describe('global hooks', () => {
  const routes = createRoutes({
    home: route(template`/`),
    about: route(template`/about`),
    user: route(template`/users/${{ id: z.string() }}`),
    admin: route(template`/admin`, { meta: { requiresAuth: true } })
  })

  describe('beforeEach', () => {
    it('should call beforeEach guard before navigation', async () => {
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

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
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

      router.beforeEach(() => false)

      await expect(router.push(routes.about)).rejects.toThrow(
        NavigationAbortedError
      )
      expect(router.current?.route).toBe(routes.home)
    })

    it('should block navigation when guard returns string', async () => {
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

      router.beforeEach(() => 'Not allowed')

      await expect(router.push(routes.about)).rejects.toThrow(
        NavigationAbortedError
      )
      await expect(router.push(routes.about)).rejects.toThrow('Not allowed')
      expect(router.current?.route).toBe(routes.home)
    })

    it('should redirect when guard returns a Route', async () => {
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

      router.beforeEach((to) => {
        if (to?.route.meta?.requiresAuth) {
          return routes.home
        }
      })

      await router.push(routes.admin)
      expect(router.current?.route).toBe(routes.home)
    })

    it('should run multiple guards in order', async () => {
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

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
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

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
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

      let callCount = 0
      const unsubscribe = router.beforeEach(() => {
        callCount++
      })

      await router.push(routes.about)
      expect(callCount).toBe(1)

      unsubscribe()
      await router.push(routes.user, { id: '123' })
      expect(callCount).toBe(1)
    })

    it('should support async guards', async () => {
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

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
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

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
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

      router.beforeEach(() => false)

      let afterCalled = false
      router.afterEach(() => {
        afterCalled = true
      })

      await expect(router.push(routes.about)).rejects.toThrow()
      expect(afterCalled).toBe(false)
    })

    it('should run multiple afterEach hooks', async () => {
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

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
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

      let callCount = 0
      const unsubscribe = router.afterEach(() => {
        callCount++
      })

      await router.push(routes.about)
      expect(callCount).toBe(1)

      unsubscribe()
      await router.push(routes.user, { id: '123' })
      expect(callCount).toBe(1)
    })
  })

  describe('onError', () => {
    it('should call onError when navigation fails', async () => {
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

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
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

      router.beforeEach(() => 'Custom error message')

      let capturedError: Error | null = null
      router.onError((error) => {
        capturedError = error
      })

      await expect(router.push(routes.about)).rejects.toThrow()
      expect(capturedError).toBeInstanceOf(NavigationAbortedError)
      expect((capturedError as NavigationAbortedError).message).toBe(
        'Custom error message'
      )
    })

    it('should allow unsubscribing error handler', async () => {
      const history = createMemoryHistory('/')
      const router = createRouter(routes, { history })

      router.beforeEach(() => false)

      let callCount = 0
      const unsubscribe = router.onError(() => {
        callCount++
      })

      await expect(router.push(routes.about)).rejects.toThrow()
      expect(callCount).toBe(1)

      unsubscribe()
      await expect(router.push(routes.user, { id: '123' })).rejects.toThrow()
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
