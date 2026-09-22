/**
 * The `container` escape hatch across a real hydration.
 *
 * The SSR suite proves the server emits the same markup with and without a
 * container - the prerequisite. It does not prove the *client* survives the
 * move, and that is where this could break: the part claims its nodes in place
 * while the hydration cursor walks the markup in order, and only then does the
 * wrapper relocate it. If that disturbed the cursor, the failure would show up
 * as a mismatch or as nodes left behind - in an application, not here.
 *
 * So the markup is really injected and really hydrated, with
 * `console.warn`/`console.error` watched, because that is how the renderer
 * reports a hydration it could not complete.
 *
 * The fixture is captured from the DOM renderer rather than the string renderer,
 * which is what the repository's other hydration tests do: in this suite the
 * element factories resolve to the DOM renderer, so handing it markup from the
 * string renderer is not the same program (a `StringHost` has no
 * `appendChild`). Capturing the tree the DOM renderer produces gives a fixture
 * with the same structure - markers included - as the one it will claim. The
 * SSR suite is where the *string* output is compared, and it asserts the
 * stronger property that a `container` changes nothing about it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, hydrate } from '@rasenjs/dom'
import { dialog } from '@rasenjs/rota'

let app: HTMLElement
let target: HTMLElement
const warnings: string[] = []
let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  useReactiveRuntime()
  warnings.length = 0

  // Anything the renderer says about hydration is a failure here: this file
  // exists to prove it has nothing to say.
  warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
    warnings.push(String(args[0]))
  })
  errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    warnings.push(String(args[0]))
  })
})

afterEach(() => {
  warnSpy.mockRestore()
  errorSpy.mockRestore()
  document.body.innerHTML = ''
})

/** The same component on both sides; only the container differs. */
function build(container?: () => HTMLElement | null) {
  const { Root, Overlay, Content, Title, Close } = dialog
  return Root({
    defaultOpen: true,
    children: (getContext) =>
      div({
        children: [
          Overlay(
            { class: 'overlay', id: 'h-overlay', container },
            getContext
          ),
          Content(
            {
              class: 'panel',
              id: 'h-panel',
              container,
              children: (getCtx) =>
                div({
                  children: [
                    Title(
                      { id: 'h-title', children: () => 'Hydrated' },
                      getCtx
                    ),
                    Close({ id: 'h-close', children: () => 'Close' }, getCtx)
                  ]
                })
            },
            getContext
          )
        ]
      })
  })
}

/**
 * The markup a server would emit: the same component rendered inline, with no
 * container - a container adds no element of its own, only a move.
 */
function serverMarkup(): string {
  const host = document.createElement('div')
  build(undefined)(host)
  return host.innerHTML
}

/**
 * Inject that markup, then hydrate it with a container.
 *
 * The application element has to be in place before `hydrate` runs, because the
 * getter must resolve then - which is the contract the escape hatch puts on the
 * application.
 */
function serverRenderThenHydrate(): void {
  document.body.innerHTML =
    '<div id="app">' +
    serverMarkup() +
    '</div>' +
    '<div id="overlay-root"></div>'

  app = document.getElementById('app')!
  target = document.getElementById('overlay-root')!

  hydrate(build(() => target), app)
}

describe('@rasenjs/rota - container across hydration', () => {
  it('should hydrate without the renderer reporting anything', () => {
    serverRenderThenHydrate()

    expect(warnings).toEqual([])
  })

  it('should relocate the claimed nodes rather than create new ones', () => {
    serverRenderThenHydrate()

    const panel = document.getElementById('h-panel')!
    const overlay = document.getElementById('h-overlay')!

    // Moved out of the component and into the application's element.
    expect(panel.parentElement).toBe(target)
    expect(overlay.parentElement).toBe(target)
    expect(app.contains(panel)).toBe(false)

    // Claimed, not duplicated: hydration must not have created a second copy,
    // and the content must be the server's, not a fresh render.
    expect(document.querySelectorAll('#h-panel').length).toBe(1)
    expect(panel.textContent).toContain('Hydrated')
  })

  it('should not complain about nodes left behind', () => {
    serverRenderThenHydrate()

    // "Extra nodes found in container after hydration" is what a cursor that
    // was thrown off by the move would produce, so this is the specific
    // regression to name.
    expect(warnings.join('\n')).not.toMatch(/Extra nodes/)
  })

  it('should keep the hydrated panel working', () => {
    serverRenderThenHydrate()

    const panel = document.getElementById('h-panel')!
    const close = document.getElementById('h-close')!

    // Still wired after the move: the close button closes the panel.
    close.click()

    expect(panel.hasAttribute('hidden')).toBe(true)
  })
})
