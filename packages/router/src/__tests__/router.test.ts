import { describe, it, expect, beforeAll } from 'vitest'
import { z } from 'zod'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-signals'
import { route, template, createRoutes, createRouter, createMemoryHistory } from '../index'

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
        detail: route(template`${{ id: z.string() }}`),
      },
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
        detail: route(template`${{ id: z.string() }}`),
      },
    })

    expect(routes.home.fullPath).toBe('/home')
    expect(routes.posts.list.fullPath).toBe('/posts/list')
    expect(routes.posts.detail.fullPath).toBe('/posts/detail/:id')
  })

  it('should handle absolute paths', () => {
    const routes = createRoutes({
      home: route(template`/`),
      user: route(template`/users/${{ id: z.string() }}`),
    })

    expect(routes.home.fullPath).toBe('/')
    expect(routes.user.fullPath).toBe('/users/:id')
  })

  it('should throw on empty key', () => {
    expect(() => {
      createRoutes({
        '': route(),
      })
    }).toThrow('Empty key is not allowed')
  })
})

describe('createRouter', () => {
  const routes = createRoutes({
    home: route(template`/`),
    user: route(template`/users/${{ id: z.string() }}`),
    post: route(template`/posts/${{ id: z.coerce.number() }}`),
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
    expect(postMatch?.params).toEqual({ id: 42 })  // coerced to number
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

    expect(router.href(routes.user, { id: '123' }, { query: { tab: 'profile' } }))
      .toBe('/users/123?tab=profile')
    expect(router.href(routes.post, { id: 42 }, { query: { page: 1, sort: 'date' } }))
      .toBe('/posts/42?page=1&sort=date')
  })

  it('should navigate with history using route object', () => {
    const history = createMemoryHistory('/')
    const router = createRouter(routes, { history })

    expect(router.current?.route).toBe(routes.home)

    router.push(routes.user, { id: '123' })
    expect(router.current?.route).toBe(routes.user)
    expect(router.current?.params).toEqual({ id: '123' })
    expect(history.getPath()).toBe('/users/123')
  })

  it('should navigate with query parameters', () => {
    const history = createMemoryHistory('/')
    const router = createRouter(routes, { history })

    router.push(routes.user, { id: '123' }, { query: { tab: 'settings' } })
    expect(router.current?.route).toBe(routes.user)
    expect(router.current?.params).toEqual({ id: '123' })
    expect(router.current?.query).toEqual({ tab: 'settings' })
    expect(history.getPath()).toBe('/users/123?tab=settings')
  })

  it('should subscribe to route changes', () => {
    const history = createMemoryHistory('/')
    const router = createRouter(routes, { history })

    const matches: (typeof router.current)[] = []
    const unsubscribe = router.subscribe((match) => {
      matches.push(match)
    })

    router.push(routes.user, { id: '123' })
    router.push(routes.post, { id: 42 })

    expect(matches).toHaveLength(2)
    expect(matches[0]?.route).toBe(routes.user)
    expect(matches[1]?.route).toBe(routes.post)

    unsubscribe()
  })
})

describe('nested routes', () => {
  it('should work with deeply nested routes', () => {
    const routes = createRoutes({
      admin: {
        dashboard: {
          stats: route(),
          users: route(template`${{ id: z.string() }}`),
        },
      },
    })

    expect(routes.admin.dashboard.stats.fullPath).toBe('/admin/dashboard/stats')
    expect(routes.admin.dashboard.users.fullPath).toBe('/admin/dashboard/users/:id')

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
        home: route(template`/`),           // absolute → /
        dashboard: route(),                  // relative → /app/dashboard
        settings: route(template`/settings`), // absolute → /settings
      },
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
