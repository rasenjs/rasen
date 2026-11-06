/**
 * The string host's `<>…</>` — the JSX path (`Fragment`) and the object form
 * of `fragment` share core's structural fragment with THIS host's hooks, so
 * text children render as hydration-markered pieces instead of being dropped.
 *
 * The old JSX path went through core's jsx-runtime *fallback*, which skipped
 * text with a warning: `<>{'a'}</>` produced `""` on the server.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref } from '@vue/reactivity'
import { Fragment, fragment } from './fragment'
import { renderToString } from '../index'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('Fragment (JSX <> path)', () => {
  it('renders text children instead of dropping them', () => {
    const out = renderToString(Fragment({ children: ['hello ', 'world'] }))
    expect(out).toContain('hello')
    expect(out).toContain('world')
    expect(out).not.toBe('')
  })

  it('renders a ref child, evaluated once (SSR is one-shot)', () => {
    const label = ref('first')
    expect(renderToString(Fragment({ children: label }))).toContain('first')
    label.value = 'second'
    expect(renderToString(Fragment({ children: label }))).toContain('second')
  })

  it('mounts a mountable child through its function', () => {
    const out = renderToString(
      Fragment({
        children: [
          (host: { append: (s: string) => void }) => {
            host.append('IN')
          },
        ],
      })
    )
    expect(out).toContain('IN')
  })

  it('coerces a single child and drops nullish/boolean children', () => {
    expect(renderToString(Fragment({ children: 'solo' }))).toContain('solo')
    const out = renderToString(Fragment({ children: [null, false, 'x', undefined] }))
    expect(out).toContain('x')
    expect(out).not.toContain('false')
  })
})

describe('fragment (object form)', () => {
  it('renders through the structural path in ESM (the old require() threw)', () => {
    const out = renderToString(fragment({ children: ['obj ', 'text'] }))
    expect(out).toContain('obj')
    expect(out).toContain('text')
  })
})
