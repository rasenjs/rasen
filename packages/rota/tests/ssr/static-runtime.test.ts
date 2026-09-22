/**
 * The server-side fast path: render with a runtime that does nothing.
 *
 * A render pass never updates anything. Every `ref` a component creates, every
 * `subscribe` it wires, and the `effectScope` `com` installs per instance exist
 * to deliver *later* changes — and there are none on the server. Swapping the
 * reactive runtime for a static one is therefore the whole fast path:
 *
 *   - measured at 15% of SSR render time (29.9ms → 25.5ms for 60 passes over
 *     all 18 demos, i.e. ~26µs → ~22µs per demo), and
 *   - byte-identical output, which is what this file pins.
 *
 * No component changes and no new API: the runtime is already an injectable
 * seam (`setReactiveRuntime`), which is the same seam the DOM and SSR targets
 * use to switch renderers. Components stay written the ordinary way — a ref is
 * a ref — and the deployment decides what backs it.
 *
 * The same measurement is why nothing in the components skips live-tree work
 * behind a capability flag: an element ref simply never fills on the server, so
 * the work that hangs off it (focus, timers, layout reads) already never runs.
 * That is asserted in `render.test.ts` (no timers, no frames, no document).
 */
import { describe, it, expect, afterAll } from 'vitest'
import { setReactiveRuntime, type ReactiveRuntime } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { renderToString } from '@rasenjs/html'
import { demos } from '../../www/demos/registry'

/**
 * The smallest runtime that is still *honest*: its refs are boxes it
 * recognizes, so `toValue` unwraps them exactly as it does with a real
 * runtime. A stub that answered `isRef: () => false` would leave refs in the
 * markup and make the comparison below meaningless.
 */
function createStaticRuntime(): ReactiveRuntime {
  const isBox = (v: unknown): boolean =>
    !!v && typeof v === 'object' && '__box' in (v as object)
  const box = (v: unknown) => ({ value: v, __box: true })

  return {
    subscribe: () => () => {},
    unref: (v: unknown) => (isBox(v) ? (v as { value: unknown }).value : v),
    isRef: isBox,
    effectScope: () => ({ run: (fn: () => unknown) => fn(), stop: () => {} }),
    ref: box,
    setValue: (r: unknown, v: unknown) => {
      if (isBox(r)) (r as { value: unknown }).value = v
    }
  } as unknown as ReactiveRuntime
}

afterAll(() => {
  useReactiveRuntime()
})

describe('@rasenjs/rota - server rendering with a static runtime', () => {
  /**
   * Generated identifiers never match between two render passes (they have to
   * be unique per document), so they are normalized away, which is what makes
   * the comparison about markup instead of about which pass ran first.
   *
   * Only the *values of id-referencing attributes* are rewritten. A blanket
   * "replace digit runs" rule would also flatten `aria-level="3"` or
   * `tabindex="-1"`, and those have to keep their real values for this
   * comparison to be able to catch a genuine difference. The digits are
   * replaced anywhere inside the value, not just at the end: an id is built
   * from an instance prefix and a position (`accordion-1-header-2`), so a
   * counter can sit in the middle.
   */
  const normalizeIds = (markup: string): string =>
    markup.replace(
      /\b(id|for|aria-controls|aria-labelledby|aria-describedby|aria-owns|aria-activedescendant)="([^"]*)"/g,
      (_match, attribute: string, value: string) =>
        `${attribute}="${value.replace(/\d+/g, 'N')}"`
    )

  const markupOf = (): string =>
    normalizeIds(
      Object.values(demos)
        .map((demo) => renderToString(demo.build()))
        .join('\n')
    )

  it('should flatten generated ids without flattening meaning', () => {
    // Ids that differ only in their generated parts must normalize equal...
    expect(normalizeIds('<b id="x-9" aria-controls="x-9-content-1">')).toBe(
      normalizeIds('<b id="x-4" aria-controls="x-4-content-7">')
    )
    // ...while attributes that carry meaning must survive normalization, or
    // this suite would be hiding exactly the differences it exists to catch.
    expect(normalizeIds('<b tabindex="-1" aria-level="3" data-state="open">')).not.toBe(
      normalizeIds('<b tabindex="-1" aria-level="3" data-state="closed">')
    )
    expect(normalizeIds('<b aria-expanded="true">')).not.toBe(
      normalizeIds('<b aria-expanded="false">')
    )
  })

  it('should produce the same markup as the interactive runtime', () => {
    useReactiveRuntime()
    const interactive = markupOf()

    setReactiveRuntime(createStaticRuntime())
    const staticMarkup = markupOf()

    expect(staticMarkup).toBe(interactive)
    // Sanity: the comparison is over real output, not two empty strings.
    expect(interactive.length).toBeGreaterThan(1000)
  })

  it('should not deliver an update to anything it renders', () => {
    // Nothing subscribes for updates on the server; if a component did depend
    // on one to render correctly, the markup above would differ.
    let subscriptions = 0
    const runtime = createStaticRuntime()
    const counting = {
      ...runtime,
      subscribe: () => {
        subscriptions++
        return () => {}
      }
    } as unknown as ReactiveRuntime

    setReactiveRuntime(counting)
    const markup = markupOf()

    // Components do wire subscriptions (they cannot know the host is static),
    // and those are exactly the calls a static runtime makes free.
    expect(subscriptions).toBeGreaterThan(0)
    expect(markup.length).toBeGreaterThan(1000)
  })
})
