import { describe, it, expect, vi } from 'vitest'
import { createRoot, createNode } from './node'
import { gfxHostHooks } from './host-hooks'
import { createMockWebGLContext } from './test-utils'

/**
 * Gfx host hooks contract: structural markers exist for ORDERING only.
 *
 * `each` / `when` / `match` position their rows with a marker per region, and
 * those markers live in `children` (insert/nextSibling address them by index).
 * They must not reach the renderer: the pre-order walk calls draw() on every
 * child, and at 200 rows that is 200 dead calls per frame — measured at
 * ~1.9 ms/frame on the NIKKE bench (402 vs 201 node.draw calls), which is why
 * the walk skips them instead of letting them draw nothing.
 */
describe('gfx host hooks — structural markers', () => {
  it('walks real children but never calls draw() on a marker', () => {
    const gl = createMockWebGLContext()
    const root = createRoot(gl)

    // A container node: its own draw delegates to the children walk, which is
    // exactly the renderer's pre-order step.
    const container = createNode(root, { draw: (drawChildren) => drawChildren() })
    const realDraw = vi.fn()
    createNode(container, { draw: realDraw })
    const marker = gfxHostHooks.createMarker!(container, 'e')
    gfxHostHooks.insert!(container, marker, null)

    // Spy on the marker's OWN draw: the pre-fix walk called it (one dead call
    // per marker per frame); skipping the call entirely is the fix.
    const markerDraw = vi.spyOn(marker, 'draw')

    container.draw()

    expect(realDraw).toHaveBeenCalledTimes(1)
    expect(markerDraw).not.toHaveBeenCalled()

    // Ordering protocol intact: the marker is still a child, and an explicitly
    // requested draw() stays a no-op (it submits nothing).
    expect(container.children).toContain(marker)
    marker.draw()
    expect(realDraw).toHaveBeenCalledTimes(1)
  })

  it('markers stay addressable through insert/nextSibling and detach', () => {
    const gl = createMockWebGLContext()
    const root = createRoot(gl)
    const a = createNode(root, { draw: () => {} })
    const b = createNode(root, { draw: () => {} })

    const m = gfxHostHooks.createMarker!(root, 'w')
    gfxHostHooks.insert!(root, m, b) // immediately before b
    expect(root.children).toEqual([a, m, b])
    expect(gfxHostHooks.nextSibling!(a)).toBe(m)
    expect(gfxHostHooks.nextSibling!(m)).toBe(b)

    gfxHostHooks.detach!(m)
    expect(root.children).toEqual([a, b])
  })
})
