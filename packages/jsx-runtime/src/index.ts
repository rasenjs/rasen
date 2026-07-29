/**
 * @rasenjs/jsx-runtime — Self-contained JSX runtime
 *
 * Provides jsx(), jsxs(), Fragment with default implementations.
 * PascalCase components (<View>) are called directly — no registration needed.
 * Lowercase tags (<div>) need configureTags() — an optional utility exported here.
 *
 * Users only need:
 * ```json
 * // tsconfig.json
 * { "jsx": "react-jsx", "jsxImportSource": "@rasenjs/jsx-runtime" }
 * ```
 *
 * For RN: Metro resolveRequest redirects react/jsx-runtime → @rasenjs/jsx-runtime.
 */

import type { Mountable } from '@rasenjs/core'
import { getReactiveRuntime } from '@rasenjs/core'
import { findTag, configureTags } from './tag-config'
export { registerTag, configureTags, clearTags, getRegisteredTags } from './tag-config'
export type { TagConfig, TagComponent } from './tag-config'

// ── Helpers ────────────────────────────────────────────────────────────

type JSXElement = { type: unknown; props: Record<string, unknown> }

type JSXChild =
  | string
  | number
  | boolean
  | null
  | undefined
  | Mountable<unknown>
  | JSXElement

function isJSXElement(v: unknown): v is JSXElement {
  return v !== null && typeof v === 'object' && 'type' in v && 'props' in v
}

function isRef(v: unknown): boolean {
  try { return getReactiveRuntime().isRef(v) } catch { return false }
}

function processChildren(
  children: JSXChild | JSXChild[] | undefined,
): Mountable<unknown>[] {
  if (children == null) return []
  const arr = Array.isArray(children) ? children : [children]
  const result: Mountable<unknown>[] = []
  for (const child of arr) {
    if (child == null || typeof child === 'boolean') continue
    if (typeof child === 'string' || typeof child === 'number') {
      result.push(child as unknown as Mountable<unknown>)
    } else if (isRef(child)) {
      result.push(child as unknown as Mountable<unknown>)
    } else if (typeof child === 'function') {
      result.push(child as Mountable<unknown>)
    } else if (isJSXElement(child)) {
      result.push(mountableFromJSX(child))
    }
  }
  return result
}

function mountableFromJSX(el: JSXElement): Mountable<unknown> {
  const { type, props } = el
  const { children, className, ...rest } = props
  const childMounts = processChildren(children as JSXChild | JSXChild[] | undefined)
  const normalized = className !== undefined ? { ...rest, class: className } : rest

  if (typeof type === 'string') {
    let tagComponent = findTag(type)
    if (!tagComponent) {
      // First unregistered tag — try to detect host (handles ESM
      // evaluation order where host may not have initialized yet).
      detectAndRegisterHostSync()
      tagComponent = findTag(type)
    }
    if (!tagComponent) {
      throw new Error(
        `Unknown intrinsic tag <${type}>. ` +
        `Use PascalCase imports (<View>) for RN components, ` +
        `or register lowercase tags via configureTags().`,
      )
    }
    return tagComponent({
      ...normalized,
      children: childMounts.length > 0 ? childMounts : undefined,
    })
  }

  // PascalCase component — call directly
  const comp = type as (props: Record<string, unknown>) => Mountable<unknown>
  return comp({
    ...normalized,
    children: childMounts.length > 0 ? childMounts : undefined,
  })
}

// ── JSX Runtime ────────────────────────────────────────────────────────

export function jsx(
  type: unknown,
  props: Record<string, unknown> | null,
  _key?: string,
): Mountable<unknown> {
  return mountableFromJSX({ type, props: { ...(props || {}), key: _key } })
}

export function jsxs(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string,
): Mountable<unknown> {
  return jsx(type, props, key)
}

/**
 * jsxDEV — alias for jsx, used by Vite dev mode.
 * Vite auto-switches to `react-jsxdev` transform in development,
 * which imports `jsxDEV` from the jsxImportSource's main entry.
 */
export { jsx as jsxDEV }

/**
 * Fragment — mounts children in parallel without a wrapper element.
 * Default implementation works for all hosts.
 */
export function Fragment(props: { children?: unknown }): Mountable<unknown> {
  const childMounts = processChildren(props.children as JSXChild | JSXChild[] | undefined)
  return ((host: unknown) => {
    const cleanups = childMounts.map(c => (c as (h: unknown) => (() => void) | undefined)(host))
    return () => { for (const u of cleanups) if (u) u() }
  }) as unknown as Mountable<unknown>
}

// ── JSX Type Namespace (for jsxImportSource) ───────────────────────────

export namespace JSX {
  export interface IntrinsicElements {
    [tag: string]: Record<string, unknown>
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Element = Mountable<any>
  export interface ElementChildrenAttribute { children: unknown }
  export interface IntrinsicAttributes { key?: string | number }
}

// ── Host Auto-Detection ────────────────────────────────────────────────
// Reads the host registry from @rasenjs/core.
// Host packages register themselves as a side effect when imported.
// This works in both browser ESM and Node.js without require().

import { getHostComponents } from '@rasenjs/core'

const HOST_PRIORITY = [
  '@rasenjs/react-native',
  '@rasenjs/web',
  '@rasenjs/dom',
  '@rasenjs/html',
]

let hostDetected = false

function detectAndRegisterHostSync(): void {
  if (hostDetected) return
  
  const components = getHostComponents(HOST_PRIORITY)
  if (components) {
    configureTags({ '': components })
    hostDetected = true
  }
}

// Try at module init — works when the host module was imported before
// jsx-runtime in ESM evaluation order.
detectAndRegisterHostSync()
