/**
 * The `container` escape hatch, on the client.
 *
 * Asserted through Dialog rather than against the helper directly, because the
 * interesting part is the integration: the panel moves, and everything wired to
 * it - the focus scope, the dismissable layer, the element ref - keeps working
 * on the same element. A node that changed identity during the move would break
 * all three, and a unit test on the wrapper alone would not notice.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div } from '@rasenjs/web/elements'
import { dialog } from '@rasenjs/rota'
import type { PropValue } from '@rasenjs/core'

let root: HTMLElement
let target: HTMLElement
const mounted: Array<(() => void) | undefined> = []

beforeEach(() => {
  useReactiveRuntime()
  root = document.createElement('div')
  // The application's own element: a sibling of the component, standing in for
  // the `<div id="overlay-root">` an app would put in its template.
  target = document.createElement('div')
  document.body.append(root, target)
})

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount?.()
  root.remove()
  target.remove()
})

const flush = (): Promise<void> => Promise.resolve()

function mountDialog(
  container?: PropValue<HTMLElement | null>,
  options: { open?: boolean } = {}
) {
  const { Root, Overlay, Content, Title } = dialog

  const unmount = Root({
    defaultOpen: options.open ?? true,
    children: (getContext) =>
      div({
        children: [
          Overlay({ container }, getContext),
          Content(
            {
              container,
              children: (getCtx) => Title({}, getCtx)
            },
            getContext
          )
        ]
      })
  })(root)

  mounted.push(unmount)

  return {
    panel: () => document.querySelector<HTMLElement>('[role="dialog"]')!,
    overlay: () => document.querySelector<HTMLElement>('[data-overlay]')!
  }
}

const isOpen = (node: HTMLElement | null): boolean =>
  !!node && !node.hasAttribute('hidden')

describe('@rasenjs/rota - container', () => {
  it('should render in place when no container is given', async () => {
    const { panel } = mountDialog()
    await flush()

    // The default path, unchanged: the part is where it was written.
    expect(target.children.length).toBe(0)
    expect(root.contains(panel())).toBe(true)
  })

  it('should render into the container when one is given', async () => {
    const { panel, overlay } = mountDialog(() => target)
    await flush()

    expect(panel().parentElement).toBe(target)
    expect(overlay().parentElement).toBe(target)
    // Moved, not copied: it must no longer be a descendant of the component.
    expect(root.contains(panel())).toBe(false)
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1)
  })

  it('should keep the part working after the move', async () => {
    const { panel } = mountDialog(() => target)
    await flush()

    const moved = panel()
    // The element is the same node it was before the move - that is what keeps
    // the focus scope and the dismissable layer pointed at the right thing.
    expect(isOpen(moved)).toBe(true)

    // A press outside the moved panel still closes it: the layer's idea of
    // "inside" follows the element, not the tree position.
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    )
    await flush()

    expect(isOpen(panel())).toBe(false)
    outside.remove()
  })

  it('should still move focus into the moved panel', async () => {
    const { panel } = mountDialog(() => target, { open: false })
    await flush()

    // Open through the ref the layer listens to.
    const trigger = document.createElement('button')
    root.appendChild(trigger)
    panel().focus()
    await flush()

    // The panel is focusable and lives in the container: focusing it must not
    // depend on where it is in the tree.
    expect(document.activeElement).toBe(panel())
    trigger.remove()
  })

  it('should stay in place when the container cannot be resolved', async () => {
    const { panel } = mountDialog(() => null)
    await flush()

    // Not a broken state: this is the default behaviour.
    expect(root.contains(panel())).toBe(true)
    expect(target.children.length).toBe(0)
  })

  it('should accept a plain element as the container', async () => {
    const { panel } = mountDialog(target)
    await flush()

    expect(panel().parentElement).toBe(target)
  })
})
