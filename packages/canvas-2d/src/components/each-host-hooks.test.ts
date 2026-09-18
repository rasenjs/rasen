/**
 * each() on the canvas-2d host — the anchor path.
 *
 * Why this file exists: canvas-2d's other list tests mount with `undefined`
 * hooks, which takes each()'s legacy append-only path. That left the anchor path
 * — the structural markers, the marker-region protocol, and boundedHost — with
 * no coverage at all, on the one host that needs all three. Two things were
 * therefore free to break silently, and both did:
 *
 *  1. boundedHost is what keeps a row's nodes INSIDE the list, ahead of its end
 *     anchor. Without it the row nodes land past the anchor, and a reorder stops
 *     moving anything — the list paints in its old order while its data changed.
 *     (Found while deciding whether boundedHost could be deleted, since DOM's
 *     hostHooks has no boundedHost and uses `batch` instead.)
 *
 *  2. core probed `startNode.parentNode` before detaching the first row's marker.
 *     `parentNode` is a DOM member name — a canvas node has `parent` — so on this
 *     host the probe was always false, the detach never ran, and every clear
 *     leaked that marker while still walking it every frame afterwards.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime, each } from '@rasenjs/core'
import { createReactiveRuntime, ref } from '@rasenjs/reactive-vue'
import { createMockContext } from '../test-utils'
import { createRoot, type CanvasNode, type Context2D } from '../node'
import { canvasHostHooks } from '../host-hooks'
import { rect } from './rect'

interface Item {
  id: number
}

/**
 * Paint order is the user-visible truth here: canvas paints children in array
 * order, so the sequence of fillRect x values IS the visual stacking. Asserting
 * on `children` instead would accept a tree whose paint order is wrong.
 */
function paintOrder(root: CanvasNode, ctx: Context2D): number[] {
  const mock = ctx.fillRect as unknown as {
    mockClear(): void
    mock: { calls: unknown[][] }
  }
  mock.mockClear()
  root.draw(ctx)
  return mock.mock.calls.map((c) => Number(c[0]))
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 20))

describe('each on the canvas-2d host', () => {
  let ctx: Context2D
  let root: CanvasNode
  let unmount: (() => void) | void

  beforeEach(() => {
    setReactiveRuntime(createReactiveRuntime())
    ctx = createMockContext()
    root = createRoot(ctx)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(performance.now()), 0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    unmount?.()
    unmount = undefined
    vi.unstubAllGlobals()
  })

  /** Rows draw at x = id * 10, so paint order reads back as a list of ids. */
  function mountList(items: ReturnType<typeof ref<Item[]>>): void {
    const m = each(items, (it: Item) =>
      rect({ x: it.id * 10, y: 0, width: 5, height: 5, fill: 'red' })
    )
    unmount = m(root, canvasHostHooks)
  }

  it('paints rows in list order', async () => {
    mountList(ref([{ id: 1 }, { id: 2 }, { id: 3 }]))
    await flush()
    expect(paintOrder(root, ctx)).toEqual([10, 20, 30])
  })

  it('paints rows in the NEW order after a reorder', async () => {
    // Same object identities in a different order — that is a real reorder. New
    // objects would read as "everything was replaced", which createAll satisfies
    // by appending in the new order and would pass even with rows mispositioned.
    const one = { id: 1 }
    const two = { id: 2 }
    const three = { id: 3 }
    const items = ref([one, two, three])
    mountList(items)
    await flush()
    expect(paintOrder(root, ctx)).toEqual([10, 20, 30])

    items.value = [three, one, two]
    await flush()
    expect(paintOrder(root, ctx)).toEqual([30, 10, 20])

    items.value = [two, three, one]
    await flush()
    expect(paintOrder(root, ctx)).toEqual([20, 30, 10])
  })

  it('drops a removed row, and only that row', async () => {
    const one = { id: 1 }
    const two = { id: 2 }
    const three = { id: 3 }
    const items = ref([one, two, three])
    mountList(items)
    await flush()

    items.value = [one, three]
    await flush()
    expect(paintOrder(root, ctx)).toEqual([10, 30])
  })

  it('leaves nothing behind when the list is cleared', async () => {
    const items = ref([{ id: 1 }, { id: 2 }, { id: 3 }])
    mountList(items)
    await flush()
    expect(root.children.length).toBeGreaterThan(1)

    items.value = []
    await flush()

    expect(paintOrder(root, ctx)).toEqual([])
    // The list's own end anchor is the single node that legitimately survives a
    // clear (it is the boundary the next create/list positions against). Anything
    // else still here is a structural marker the clear failed to detach: it
    // paints nothing, so only this count can see it, and it is walked forever.
    expect(root.children.length).toBe(1)
  })

  it('does not accumulate markers across repeated create/clear cycles', async () => {
    const items = ref<Item[]>([])
    mountList(items)
    await flush()

    const sizes: number[] = []
    for (let i = 0; i < 5; i++) {
      items.value = [{ id: 1 }, { id: 2 }]
      await flush()
      items.value = []
      await flush()
      sizes.push(root.children.length)
    }
    // Same tree size after every cycle: a leak would make this grow by one per
    // clear without bound.
    expect(sizes).toEqual([1, 1, 1, 1, 1])
  })
})
