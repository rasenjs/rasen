# @rasenjs/shared

> Shared utilities for Rasen packages

## Installation

```bash
npm install @rasenjs/shared zod
```

## Template

A string template serialization/deserialization utility based on Tagged Template Literals + Zod.

### Basic Usage

```typescript
import { z } from 'zod'
import { template } from '@rasenjs/shared'

// Define a template
const userPath = template`/users/${{ id: z.string() }}`

// Parse a string to params
userPath.parse('/users/123')  // { id: '123' }

// Format params to string
userPath.format({ id: '123' })  // '/users/123'

// Test if a string matches
userPath.test('/users/123')  // true
```

### Type Coercion

```typescript
// Number coercion
const postPath = template`/posts/${{ id: z.coerce.number() }}`
postPath.parse('/posts/42')  // { id: 42 } (number type)

// Boolean coercion
const flagPath = template`/flag/${{ enabled: z.coerce.boolean() }}`
flagPath.parse('/flag/true')  // { enabled: true }
```

### Validation

```typescript
// Enum validation
const statusPath = template`/status/${{ status: z.enum(['active', 'inactive']) }}`
statusPath.parse('/status/active')   // { status: 'active' }
statusPath.parse('/status/unknown')  // null

// Number constraints
const pagePath = template`/page/${{ page: z.coerce.number().int().positive() }}`
pagePath.parse('/page/5')    // { page: 5 }
pagePath.parse('/page/-1')   // null
pagePath.parse('/page/1.5')  // null
```

### Multiple Parameters

```typescript
const postPath = template`/users/${{ userId: z.string() }}/posts/${{ postId: z.coerce.number() }}`

postPath.parse('/users/abc/posts/123')
// { userId: 'abc', postId: 123 }

postPath.format({ userId: 'abc', postId: 123 })
// '/users/abc/posts/123'
```

### Type Safety

Full TypeScript support with automatic type inference:

```typescript
const tpl = template`/users/${{ userId: z.string() }}/posts/${{ postId: z.coerce.number() }}`

// Inferred type: { userId: string; postId: number } | null
const result = tpl.parse('/users/abc/posts/123')

// Type-safe format
tpl.format({ userId: 'abc', postId: 123 })  // ✅
tpl.format({ userId: 'abc' })               // ❌ Type error: missing postId
tpl.format({ userId: 123, postId: 123 })    // ❌ Type error: userId should be string
```

### API

#### `template`

```typescript
function template<T extends Record<string, ZodType>[]>(
  strings: TemplateStringsArray,
  ...params: T
): Template<MergeParams<T>>
```

#### `Template<T>`

```typescript
interface Template<T> {
  parse(input: string): T | null
  safeParse(input: string): { success: true; data: T } | { success: false; error: Error }
  format(params: T): string
  test(input: string): boolean
  readonly regex: RegExp
  readonly paramNames: string[]
  readonly pattern: string
  readonly schema: ZodObject<...>
}
```

## License

MIT
