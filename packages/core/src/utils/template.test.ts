import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { template } from './template'

describe('template', () => {
  describe('parse', () => {
    it('should parse static template', () => {
      const tpl = template`/users`
      expect(tpl.parse('/users')).toEqual({})
      expect(tpl.parse('/posts')).toBeNull()
    })

    it('should parse single param', () => {
      const tpl = template`/users/${{ id: z.string() }}`
      expect(tpl.parse('/users/123')).toEqual({ id: '123' })
      expect(tpl.parse('/users/abc')).toEqual({ id: 'abc' })
      expect(tpl.parse('/posts/123')).toBeNull()
    })

    it('should parse multiple params', () => {
      const tpl = template`/users/${{ userId: z.string() }}/posts/${{ postId: z.string() }}`
      expect(tpl.parse('/users/abc/posts/123')).toEqual({ userId: 'abc', postId: '123' })
    })

    it('should coerce to number', () => {
      const tpl = template`/posts/${{ id: z.coerce.number() }}`
      const result = tpl.parse('/posts/123')
      expect(result).toEqual({ id: 123 })
      expect(typeof result?.id).toBe('number')
    })

    it('should reject invalid number', () => {
      const tpl = template`/posts/${{ id: z.coerce.number().int() }}`
      expect(tpl.parse('/posts/12.5')).toBeNull()
    })

    it('should validate enum', () => {
      const tpl = template`/status/${{ status: z.enum(['active', 'inactive']) }}`
      expect(tpl.parse('/status/active')).toEqual({ status: 'active' })
      expect(tpl.parse('/status/inactive')).toEqual({ status: 'inactive' })
      expect(tpl.parse('/status/unknown')).toBeNull()
    })
  })

  describe('format', () => {
    it('should format static template', () => {
      const tpl = template`/users`
      expect(tpl.format({} as Record<string, never>)).toBe('/users')
    })

    it('should format with params', () => {
      const tpl = template`/users/${{ id: z.string() }}`
      expect(tpl.format({ id: '123' })).toBe('/users/123')
    })

    it('should format multiple params', () => {
      const tpl = template`/users/${{ userId: z.string() }}/posts/${{ postId: z.coerce.number() }}`
      expect(tpl.format({ userId: 'abc', postId: 123 })).toBe('/users/abc/posts/123')
    })

    it('should throw on missing param', () => {
      const tpl = template`/users/${{ id: z.string() }}`
      // @ts-expect-error testing missing param
      expect(() => tpl.format({})).toThrow('Missing required parameter: id')
    })
  })

  describe('test', () => {
    it('should test matching', () => {
      const tpl = template`/users/${{ id: z.string() }}`
      expect(tpl.test('/users/123')).toBe(true)
      expect(tpl.test('/users/abc')).toBe(true)
      expect(tpl.test('/posts/123')).toBe(false)
    })
  })

  describe('safeParse', () => {
    it('should return success', () => {
      const tpl = template`/users/${{ id: z.string() }}`
      const result = tpl.safeParse('/users/123')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ id: '123' })
      }
    })

    it('should return error', () => {
      const tpl = template`/users/${{ id: z.string() }}`
      const result = tpl.safeParse('/posts/123')
      expect(result.success).toBe(false)
    })
  })

  describe('properties', () => {
    it('should expose regex', () => {
      const tpl = template`/users/${{ id: z.string() }}`
      expect(tpl.regex).toBeInstanceOf(RegExp)
    })

    it('should expose paramNames', () => {
      const tpl = template`/users/${{ userId: z.string() }}/posts/${{ postId: z.string() }}`
      expect(tpl.paramNames).toEqual(['userId', 'postId'])
    })

    it('should expose pattern', () => {
      const tpl = template`/users/${{ id: z.string() }}`
      expect(tpl.pattern).toBe('/users/:id')
    })

    it('should expose schema', () => {
      const tpl = template`/users/${{ id: z.string() }}`
      expect(tpl.schema).toBeDefined()
      expect(tpl.schema.safeParse({ id: '123' }).success).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle root path', () => {
      const tpl = template`/`
      expect(tpl.parse('/')).toEqual({})
      expect(tpl.format({} as Record<string, never>)).toBe('/')
    })

    it('should handle special characters in static parts', () => {
      const tpl = template`/api/v1.0/users/${{ id: z.string() }}`
      expect(tpl.parse('/api/v1.0/users/123')).toEqual({ id: '123' })
    })
  })

  describe('type safety', () => {
    it('should infer correct types', () => {
      const tpl = template`/users/${{ userId: z.string() }}/posts/${{ postId: z.coerce.number() }}`
      
      // These should be type-correct
      const result = tpl.parse('/users/abc/posts/123')
      if (result) {
        const userId: string = result.userId
        const postId: number = result.postId
        expect(userId).toBe('abc')
        expect(postId).toBe(123)
      }

      // format should also be type-correct
      tpl.format({ userId: 'abc', postId: 123 })
    })
  })

  describe('nested templates', () => {
    it('should compose templates with prefix', () => {
      const user = template`/users/${{ userId: z.string() }}`
      const userPost = template`${user}/posts/${{ postId: z.coerce.number() }}`

      expect(userPost.parse('/users/abc/posts/123')).toEqual({ userId: 'abc', postId: 123 })
      expect(userPost.parse('/users/xyz/posts/456')).toEqual({ userId: 'xyz', postId: 456 })
      expect(userPost.parse('/posts/123')).toBeNull()
    })

    it('should format nested templates', () => {
      const user = template`/users/${{ userId: z.string() }}`
      const userPost = template`${user}/posts/${{ postId: z.coerce.number() }}`

      expect(userPost.format({ userId: 'abc', postId: 123 })).toBe('/users/abc/posts/123')
    })

    it('should expose merged paramNames', () => {
      const user = template`/users/${{ userId: z.string() }}`
      const userPost = template`${user}/posts/${{ postId: z.coerce.number() }}`

      expect(userPost.paramNames).toEqual(['userId', 'postId'])
    })

    it('should expose merged pattern', () => {
      const user = template`/users/${{ userId: z.string() }}`
      const userPost = template`${user}/posts/${{ postId: z.coerce.number() }}`

      expect(userPost.pattern).toBe('/users/:userId/posts/:postId')
    })

    it('should compose deeply nested templates', () => {
      const api = template`/api/v1`
      const user = template`${api}/users/${{ userId: z.string() }}`
      const post = template`${user}/posts/${{ postId: z.coerce.number() }}`
      const comment = template`${post}/comments/${{ commentId: z.string() }}`

      expect(comment.parse('/api/v1/users/abc/posts/123/comments/xyz')).toEqual({
        userId: 'abc',
        postId: 123,
        commentId: 'xyz'
      })

      expect(comment.format({ userId: 'abc', postId: 123, commentId: 'xyz' }))
        .toBe('/api/v1/users/abc/posts/123/comments/xyz')

      expect(comment.paramNames).toEqual(['userId', 'postId', 'commentId'])
    })

    it('should compose template at any position', () => {
      const userId = template`${{ userId: z.string() }}`
      const middle = template`/start${userId}/end`

      expect(middle.parse('/startabc/end')).toEqual({ userId: 'abc' })
      expect(middle.format({ userId: 'abc' })).toBe('/startabc/end')
    })

    it('should infer types correctly for nested templates', () => {
      const user = template`/users/${{ userId: z.string() }}`
      const userPost = template`${user}/posts/${{ postId: z.coerce.number() }}`

      const result = userPost.parse('/users/abc/posts/123')
      if (result) {
        // TypeScript should infer these correctly
        const userId: string = result.userId
        const postId: number = result.postId
        expect(userId).toBe('abc')
        expect(postId).toBe(123)
      }
    })

    it('should test nested templates', () => {
      const user = template`/users/${{ userId: z.string() }}`
      const userPost = template`${user}/posts/${{ postId: z.coerce.number() }}`

      expect(userPost.test('/users/abc/posts/123')).toBe(true)
      expect(userPost.test('/users/abc/posts')).toBe(false)
      expect(userPost.test('/posts/123')).toBe(false)
    })

    it('should safeParse nested templates', () => {
      const user = template`/users/${{ userId: z.string() }}`
      const userPost = template`${user}/posts/${{ postId: z.coerce.number() }}`

      const success = userPost.safeParse('/users/abc/posts/123')
      expect(success.success).toBe(true)
      if (success.success) {
        expect(success.data).toEqual({ userId: 'abc', postId: 123 })
      }

      const failure = userPost.safeParse('/invalid')
      expect(failure.success).toBe(false)
    })
  })

  describe('prefix', () => {
    it('should create new template with prefix (immutable)', () => {
      const base = template`/${{ id: z.string() }}`
      const prefixed = base.prefix('/users')

      // Original template unchanged
      expect(base.pattern).toBe('/:id')
      expect(base.parse('/123')).toEqual({ id: '123' })
      expect(base.parse('/users/123')).toBeNull()

      // New template has prefix
      expect(prefixed.pattern).toBe('/users/:id')
      expect(prefixed.parse('/users/123')).toEqual({ id: '123' })
      expect(prefixed.parse('/123')).toBeNull()
    })

    it('should format with prefix', () => {
      const base = template`/${{ id: z.string() }}`
      const prefixed = base.prefix('/users')

      expect(base.format({ id: '123' })).toBe('/123')
      expect(prefixed.format({ id: '123' })).toBe('/users/123')
    })

    it('should chain prefix calls', () => {
      const base = template`/${{ id: z.string() }}`
      const prefixed = base.prefix('/users').prefix('/api/v1')

      expect(prefixed.pattern).toBe('/api/v1/users/:id')
      expect(prefixed.parse('/api/v1/users/123')).toEqual({ id: '123' })
      expect(prefixed.format({ id: '123' })).toBe('/api/v1/users/123')
    })

    it('should work with multiple params', () => {
      const base = template`/${{ userId: z.string() }}/posts/${{ postId: z.coerce.number() }}`
      const prefixed = base.prefix('/api')

      expect(prefixed.pattern).toBe('/api/:userId/posts/:postId')
      expect(prefixed.parse('/api/abc/posts/123')).toEqual({ userId: 'abc', postId: 123 })
      expect(prefixed.format({ userId: 'abc', postId: 123 })).toBe('/api/abc/posts/123')
    })

    it('should preserve paramNames and schema', () => {
      const base = template`/${{ id: z.string() }}`
      const prefixed = base.prefix('/users')

      expect(prefixed.paramNames).toEqual(['id'])
      expect(prefixed.schema.safeParse({ id: '123' }).success).toBe(true)
    })

    it('should test with prefix', () => {
      const base = template`/${{ id: z.string() }}`
      const prefixed = base.prefix('/users')

      expect(prefixed.test('/users/123')).toBe(true)
      expect(prefixed.test('/123')).toBe(false)
    })

    it('should safeParse with prefix', () => {
      const base = template`/${{ id: z.string() }}`
      const prefixed = base.prefix('/users')

      const success = prefixed.safeParse('/users/123')
      expect(success.success).toBe(true)
      if (success.success) {
        expect(success.data).toEqual({ id: '123' })
      }

      const failure = prefixed.safeParse('/123')
      expect(failure.success).toBe(false)
    })
  })
})
