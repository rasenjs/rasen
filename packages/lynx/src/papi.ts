/**
 * Lynx Element PAPI bindings
 *
 * Thin, lazily-resolved wrappers over the Lynx main-thread Element PAPIs
 * (`__CreateView`, `__AppendElement`, ...). The engine injects these as
 * globals into the main-thread (MTS) runtime; signatures follow the
 * official Element PAPI reference and the `@lynx-js/testing-environment`
 * implementation.
 *
 * A test seam is provided via `setLynxPapi()` so the whole renderer can run
 * against an in-memory mock without a device or simulator.
 */

/** Opaque native element handle returned by the create PAPIs */
declare const LynxElementBrand: unique symbol
export type LynxElement = { readonly [LynxElementBrand]: true }

/** Event handler accepted by `__AddEventListener` (function callback form) */
export type LynxEventHandler = (event: unknown) => void

/** Options accepted by `__AddEventListener` / `__RemoveEventListener` */
export interface LynxEventListenerOptions {
  capture?: boolean
  once?: boolean
  passive?: boolean
}

// Resolved lazily on every call so that late injection (engine globals or
// test mocks) always wins.
let override: Record<string, unknown> | null = null

/**
 * Inject a custom PAPI implementation (test seam / alternative backends).
 * Pass `null` to restore engine globals.
 */
export function setLynxPapi(papi: Record<string, unknown> | null): void {
  override = papi
}

function resolvePapi<T>(name: string): T {
  if (override !== null) {
    const fn = override[name]
    if (typeof fn === 'function') return fn as T
    throw new Error(`[lynx] PAPI "${name}" missing in injected implementation`)
  }
  const fn = (globalThis as Record<string, unknown>)[name]
  if (typeof fn !== 'function') {
    throw new Error(
      `[lynx] Element PAPI "${name}" is not available. ` +
        'Rasen/Lynx must run inside a Lynx main-thread (MTS) runtime.'
    )
  }
  return fn as T
}

// ── Create ───────────────────────────────────────────────────────────────

export function createPage(tag: string, componentId: number): LynxElement {
  return resolvePapi<(tag: string, id: number) => LynxElement>('__CreatePage')(tag, componentId)
}

export function createView(componentId: number): LynxElement {
  return resolvePapi<(id: number) => LynxElement>('__CreateView')(componentId)
}

export function createText(componentId: number): LynxElement {
  return resolvePapi<(id: number) => LynxElement>('__CreateText')(componentId)
}

export function createImage(componentId: number): LynxElement {
  return resolvePapi<(id: number) => LynxElement>('__CreateImage')(componentId)
}

export function createScrollView(componentId: number): LynxElement {
  return resolvePapi<(id: number) => LynxElement>('__CreateScrollView')(componentId)
}

export function createElement(tag: string, componentId: number): LynxElement {
  return resolvePapi<(tag: string, id: number) => LynxElement>('__CreateElement')(tag, componentId)
}

export function createRawText(content: string): LynxElement {
  return resolvePapi<(text: string) => LynxElement>('__CreateRawText')(content)
}

// ── Tree operations ──────────────────────────────────────────────────────

export function appendElement(parent: LynxElement, child: LynxElement): void {
  resolvePapi<(p: LynxElement, c: LynxElement) => void>('__AppendElement')(parent, child)
}

export function insertElementBefore(
  parent: LynxElement,
  child: LynxElement,
  ref: LynxElement | null
): void {
  resolvePapi<(p: LynxElement, c: LynxElement, r: LynxElement | null) => void>(
    '__InsertElementBefore'
  )(parent, child, ref)
}

export function removeElement(parent: LynxElement, child: LynxElement): void {
  resolvePapi<(p: LynxElement, c: LynxElement) => void>('__RemoveElement')(parent, child)
}

// ── Attributes / styles ──────────────────────────────────────────────────

export function setAttribute(
  el: LynxElement,
  key: string,
  value: string | number | boolean | null
): void {
  resolvePapi<(e: LynxElement, k: string, v: string | number | boolean | null) => void>(
    '__SetAttribute'
  )(el, key, value)
}

export function setClasses(el: LynxElement, classes: string | null): void {
  resolvePapi<(e: LynxElement, c: string | null) => void>('__SetClasses')(el, classes)
}

export function setID(el: LynxElement, id: string): void {
  resolvePapi<(e: LynxElement, id: string) => void>('__SetID')(el, id)
}

export function addDataset(el: LynxElement, key: string, value: string): void {
  resolvePapi<(e: LynxElement, k: string, v: string) => void>('__AddDataset')(el, key, value)
}

export function addInlineStyle(
  el: LynxElement,
  key: string,
  value: string | number | null
): void {
  resolvePapi<(e: LynxElement, k: string, v: string | number | null) => void>('__AddInlineStyle')(
    el,
    key,
    value
  )
}

export function setInlineStyles(
  el: LynxElement,
  styles: string | Record<string, string> | undefined
): void {
  resolvePapi<(e: LynxElement, s: string | Record<string, string> | undefined) => void>(
    '__SetInlineStyles'
  )(el, styles)
}

// ── Events ───────────────────────────────────────────────────────────────

/**
 * Bind a main-thread closure to an element event ("tap", "touchstart", ...).
 *
 * Uses the function-callback form of event binding — the one designed for
 * buildless cards that drive the element tree directly, which is exactly
 * Rasen's rendering model.
 */
export function addEventListener(
  el: LynxElement,
  eventName: string,
  handler: LynxEventHandler,
  options?: LynxEventListenerOptions
): void {
  resolvePapi<
    (e: LynxElement, n: string, h: LynxEventHandler, o?: LynxEventListenerOptions) => void
  >('__AddEventListener')(el, eventName, handler, options)
}

export function removeEventListener(
  el: LynxElement,
  eventName: string,
  handler: LynxEventHandler,
  options?: LynxEventListenerOptions
): void {
  resolvePapi<
    (e: LynxElement, n: string, h: LynxEventHandler, o?: LynxEventListenerOptions) => void
  >('__RemoveEventListener')(el, eventName, handler, options)
}

// ── Commit ───────────────────────────────────────────────────────────────

let flushScheduled = false

/**
 * Commit pending element-tree mutations to the rendering pipeline.
 * Called automatically on a microtask after mutations; call manually when
 * synchronous commits are needed (e.g. before measuring layout).
 */
export function flushLynx(): void {
  flushScheduled = false
  resolvePapi<() => void>('__FlushElementTree')()
}

/** Schedule a coalesced flush on the microtask queue (no-op if already scheduled). */
export function scheduleFlush(): void {
  if (flushScheduled) return
  flushScheduled = true
  Promise.resolve().then(() => {
    // Skip silently when no backend is attached (e.g. mock uninstalled mid-test)
    if (override === null && typeof (globalThis as Record<string, unknown>).__FlushElementTree !== 'function') {
      flushScheduled = false
      return
    }
    flushLynx()
  })
}
