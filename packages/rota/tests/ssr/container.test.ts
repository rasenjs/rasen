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
import type { Mountable, PropValue } from '@rasenjs/core'
import { renderToString } from '@rasenjs/html'
import { div } from '@rasenjs/web/elements'
import { dialog, alertDialog, popover, tooltip } from '@rasenjs/rota'

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

  it('should not resolve the container for any part, on the server', () => {
    // What this proves, precisely: no part touches the container while
    // rendering on the server, so none of them can crash an SSR build. The
    // likely naive implementation - resolving the container during render, to
    // append into it - would call the getter here and throw.
    //
    // What it does *not* prove is that a part honours the prop at all: an
    // implementation that ignored `container` entirely would also pass, because
    // ignoring it is safe on the server. That property is the client suite's
    // job (`tests/unit/into-container.test.ts`), where the part has to actually
    // move. Neither test alone is the claim.
    const parts: Array<[string, () => Mountable<unknown>]> = []

    {
      const { Root, Overlay, Content } = dialog
      parts.push(
        [
          'dialog.Content',
          () =>
            Root({
              defaultOpen: true,
              children: (getContext) =>
                div({
                  children: [
                    Content({ container: bombe, children: () => 'panel' }, getContext)
                  ]
                })
            }) as never
        ],
        [
          'dialog.Overlay',
          () =>
            Root({
              defaultOpen: true,
              children: (getContext) =>
                div({ children: [Overlay({ container: bombe }, getContext)] })
            }) as never
        ]
      )
    }

    {
      const { Root, Overlay, Content } = alertDialog
      parts.push(
        [
          'alertDialog.Content',
          () =>
            Root({
              defaultOpen: true,
              children: (getContext) =>
                div({
                  children: [
                    Content({ container: bombe, children: () => 'panel' }, getContext)
                  ]
                })
            }) as never
        ],
        [
          'alertDialog.Overlay',
          () =>
            Root({
              defaultOpen: true,
              children: (getContext) =>
                div({ children: [Overlay({ container: bombe }, getContext)] })
            }) as never
        ]
      )
    }

    {
      const { Root, Trigger, Content } = popover
      parts.push([
        'popover.Content',
        () =>
          Root({
            id: 'popover-root',
            defaultOpen: true,
            children: (getContext) => [
              Trigger({}, getContext),
              Content({ container: bombe, children: () => 'panel' }, getContext)
            ]
          }) as never
      ])
    }

    {
      const { Root, Trigger, Content } = tooltip
      parts.push([
        'tooltip.Content',
        () =>
          Root({
            id: 'tooltip-root',
            defaultOpen: true,
            delayMs: 0,
            children: (getContext) => [
              Trigger({}, getContext),
              Content({ container: bombe, children: () => 'tip' }, getContext)
            ]
          }) as never
      ])
    }

    expect(parts.map(([name]) => name)).toHaveLength(6)

    for (const [name, build] of parts) {
      // `bombe` throws, so reaching the assertion means the getter never ran.
      expect(renderToString(build() as never).length, name).toBeGreaterThan(0)
    }
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
