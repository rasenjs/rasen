/**
 * Server rendering.
 *
 * This file runs in a **node** environment: there is no document, no element
 * will ever be attached, and no element ref will ever be written. Whatever a
 * component wires up for a live tree therefore has to be skipped here (the host
 * declares `hooks.live === false`), which is why this suite is the place where
 * a component that reaches for the browser fails — loudly, in CI, instead of on
 * somebody's server.
 *
 * Everything rendered here is the site's own demo registry, so the components
 * are exercised the way a consumer composes them, not in a shape invented for
 * the test.
 */
import { describe, it, expect } from 'vitest'
import { renderToString } from '@rasenjs/html'
import { div, text } from '@rasenjs/web/elements'
import { alertDialog, avatar, collapsible } from '@rasenjs/rota'
import { demos } from '../../www/demos/registry'

/** Markup a live-tree renderer would never emit. */
const LEAKED = /=>|\[object Object\]|\bfunction\b|undefined/

describe('@rasenjs/rota - server rendering', () => {
  describe('every demo', () => {
    for (const [name, demo] of Object.entries(demos)) {
      it(`should render ${name} to markup`, () => {
        const html = renderToString(demo.build())

        expect(html.length).toBeGreaterThan(0)
        expect(html.startsWith('<')).toBe(true)
        // A function source, an unresolved object or a literal `undefined` in
        // the output means a value that only makes sense in a live tree
        // (a getter, a ref, an element) was serialized instead of resolved.
        expect(html).not.toMatch(LEAKED)
      })
    }
  })

  describe('semantics survive the trip', () => {
    it('should render switch state as ARIA', () => {
      const html = renderToString(demos.switch.build())
      expect(html).toContain('role="switch"')
      expect(html).toContain('aria-checked="true"')
    })

    it('should render checkbox state as ARIA', () => {
      const html = renderToString(demos.checkbox.build())
      expect(html).toContain('role="checkbox"')
      expect(html).toContain('data-state="checked"')
    })

    it('should render an accordion with closed panels', () => {
      const html = renderToString(demos.accordion.build())
      expect(html).toContain('data-orientation="vertical"')
      expect(html).toContain('role="heading"')
      expect(html).toContain('aria-expanded="true"') // defaultValue: 'one'
      expect(html).toContain('role="region"')
      // A collapsed panel is hidden, and that has to be in the markup.
      expect(html).toContain('hidden')
    })

    it('should render progress with its value', () => {
      const html = renderToString(demos.progress.build())
      expect(html).toContain('role="progressbar"')
      expect(html).toContain('aria-valuenow="60"')
      expect(html).toContain('translateX(')
    })

    it('should render tabs with the selected panel', () => {
      const html = renderToString(demos.tabs.build())
      expect(html).toContain('role="tablist"')
      expect(html).toContain('role="tab"')
      expect(html).toContain('aria-selected="true"')
      expect(html).toContain('role="tabpanel"')
    })

    it('should render an avatar fallback while the image has not loaded', () => {
      const html = renderToString(demos.avatar.build())
      expect(html).toContain('<img')
      expect(html).toContain('data-state="loading"')
      // The fallback is visible because nothing has loaded yet.
      expect(html).toContain('opacity: 1')
    })

    it('should render a separator with its orientation', () => {
      const html = renderToString(demos.separator.build())
      expect(html).toContain('role="separator"')
      expect(html).toContain('aria-orientation="vertical"')
    })

    it('should render an alert dialog closed', () => {
      const html = renderToString(demos['alert-dialog'].build())
      expect(html).toContain('role="alertdialog"')
      expect(html).toContain('aria-modal="true"')
    })
  })

  describe('live-tree work is skipped', () => {
    it('should not schedule anything after the render', () => {
      // The avatar fallback starts a delay timer once an element exists. Under
      // the node condition no element ever exists, so no timer may be left
      // behind: it would fire after the response and touch a dead tree.
      const timers: unknown[] = []
      const realSetTimeout = globalThis.setTimeout
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).setTimeout = (...args: unknown[]) => {
        timers.push(args[0])
        return 0 as unknown as ReturnType<typeof setTimeout>
      }
      try {
        const html = renderToString(
          avatar({
            src: 'a.png',
            alt: 'A',
            delayMs: 200,
            fallback: () => text({ content: 'AB' })
          })
        )
        expect(html).toContain('<img')
      } finally {
        globalThis.setTimeout = realSetTimeout
      }
      expect(timers).toEqual([])
    })

    it('should not animate frames', () => {
      // Nothing here may ask for a frame: focus management runs on the next
      // frame, and on a server there is neither a frame nor a focused element.
      const frames: unknown[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).requestAnimationFrame = (cb: unknown) => {
        frames.push(cb)
        return 0
      }
      try {
        const html = renderToString(openAlertDialog())
        expect(html).toContain('role="alertdialog"')
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).requestAnimationFrame
      }
      expect(frames).toEqual([])
    })

    it('should render an open dialog without touching the document', () => {
      // `document` does not exist in this environment; reaching for it (to
      // remember the previously focused element) would throw.
      expect(() => renderToString(openAlertDialog())).not.toThrow()
    })

    it('should render an open collapsible panel', () => {
      const html = renderToString(
        collapsible({
          defaultOpen: true,
          trigger: () => text({ content: 'Toggle' })
        })
      )
      expect(html).toContain('aria-expanded="true"')
    })
  })
})

/** The alert dialog, composed from its parts and open from the start. */
function openAlertDialog() {
  const { Root, Overlay, Content, Title, Description, Action, Cancel } = alertDialog

  return Root({
    defaultOpen: true,
    children: (getContext) =>
      div({
        children: [
          Overlay({}, getContext),
          Content(
            {
              children: (getCtx) =>
                div({
                  children: [
                    Title({ children: () => text({ content: 'Are you sure?' }) }, getCtx),
                    Description(
                      { children: () => text({ content: 'This cannot be undone.' }) },
                      getCtx
                    ),
                    Action({ children: () => text({ content: 'Delete' }) }, getCtx),
                    Cancel({ children: () => text({ content: 'Cancel' }) }, getCtx)
                  ]
                })
            },
            getContext
          )
        ]
      })
  })
}
