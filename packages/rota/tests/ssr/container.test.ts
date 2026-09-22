/**
 * The `container` escape hatch, on the server.
 *
 * This file is the reason the escape hatch can exist without a second output
 * target in the string renderer. Two things have to hold, and only a node
 * environment can check them:
 *
 * 1. **The consumer's `container` getter must never run.** The natural way to
 *    write it is `() => document.getElementById('overlay-root')`, which would
 *    throw here. The component guards it, so an app does not have to.
 * 2. **The markup must be identical to the default path.** During hydration the
 *    cursor walks the markup in order, so a part that relocates on the client
 *    still has to be emitted where the cursor expects it. If the two renders
 *    differed, hydration would mismatch - which is the reason this is not
 *    "render into the container on the server too".
 */
import { describe, it, expect } from 'vitest'
import type { PropValue } from '@rasenjs/core'
import { renderToString } from '@rasenjs/html'
import { div } from '@rasenjs/web/elements'
import { dialog, alertDialog } from '@rasenjs/rota'

/** Ids come from a process-wide counter, so two renders never match literally. */
const normalizeIds = (markup: string): string =>
  markup.replace(
    /\b(id|for|aria-controls|aria-labelledby|aria-describedby)="([^"]*)"/g,
    (_match, attribute: string, value: string) =>
      `${attribute}="${value.replace(/\d+/g, 'N')}"`
  )

const bombe = (): HTMLElement | null => {
  throw new Error('the container getter must not run on the server')
}

describe('@rasenjs/rota - container (server rendering)', () => {
  it('should not resolve the container while rendering on the server', () => {
    const { Root, Overlay, Content, Title } = dialog

    const markup = renderToString(
      Root({
        defaultOpen: true,
        children: (getContext) =>
          div({
            children: [
              Overlay({ container: bombe }, getContext),
              Content(
                {
                  container: bombe,
                  children: (getCtx) => Title({}, getCtx)
                },
                getContext
              )
            ]
          })
      })
    )

    // Reaching this line means the getter was never called: it throws.
    expect(markup).toContain('role="dialog"')
  })

  it('should render the same markup as the default path', () => {
    // `defaultOpen` so the panel and its contents are actually emitted; a closed
    // panel is `hidden` and would make the comparison vacuous.
    const build = (container?: PropValue<HTMLElement | null>) => {
      const { Root, Overlay, Content, Title, Description } = dialog
      return Root({
        defaultOpen: true,
        children: (getContext) =>
          div({
            children: [
              Overlay({ container }, getContext),
              Content(
                {
                  container,
                  children: (getCtx) =>
                    div({
                      children: [
                        Title({ children: () => 'A title' }, getCtx),
                        Description({ children: () => 'A description' }, getCtx)
                      ]
                    })
                },
                getContext
              )
            ]
          })
      })
    }

    const withContainer = normalizeIds(
      renderToString(build(() => bombe))
    )
    const without = normalizeIds(renderToString(build()))

    // Byte-identical: the client relocates *after* claiming these nodes, so the
    // server has to put them exactly where the cursor will look for them.
    expect(withContainer).toBe(without)
    expect(without.length).toBeGreaterThan(200)
  })

  it('should render inline when the container cannot be resolved', () => {
    const { Root, Content } = alertDialog

    const markup = renderToString(
      Root({
        defaultOpen: true,
        children: (getContext) =>
          div({
            // A getter that returns null is the honest way to say "the
            // application has no such element"; the part stays put.
            children: [Content({ container: () => null }, getContext)]
          })
      })
    )

    expect(markup).toContain('role="alertdialog"')
  })
})
