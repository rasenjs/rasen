/**
 * The compiler's element table must match the canonical list in core.
 *
 * They are separate copies on purpose — the compiler has no runtime dependency
 * on `@rasenjs/core` — so the agreement is enforced here rather than assumed.
 * A tag present in one and not the other is a silent split: the compiler would
 * build a `template()` for it while the host treats it as a component (or the
 * reverse).
 */
import { describe, it, expect } from 'vitest'
import { HTML_TAGS } from '@rasenjs/core/html-tags'
import { DEFAULT_INTRINSIC_TAGS } from '../core'

describe('tag tables', () => {
  it('compiler elements == canonical HTML tags', () => {
    expect([...DEFAULT_INTRINSIC_TAGS].sort()).toEqual([...HTML_TAGS].sort())
  })

  it('contains no component tags', () => {
    // `canvas` is a COMPONENT (its `<canvas>` tag is resolved to an import), so
    // it must not be in the element table — that is what let the DOM barrel pin
    // the whole GL stack into apps that never render one.
    expect(DEFAULT_INTRINSIC_TAGS.has('canvas')).toBe(false)
  })
})
