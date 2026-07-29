/**
 * JSX runtime — provides jsx(), jsxs(), Fragment with default implementations.
 *
 * PascalCase components (<View>) are called directly — no registration needed.
 * Lowercase tags (<div>) need configureTags() — host packages do this in their
 * own jsx-runtime.ts entry, which re-exports from here and registers their tags.
 *
 * @example
 * ```ts
 * // User code — no direct import of this file.
 * // Set jsxImportSource in tsconfig.json to your host package.
 * // tsconfig.json: { "jsxImportSource": "@rasenjs/dom" }
 * ```
 */

import type { Mountable } from '../types'
import { getReactiveRuntime } from '../reactive'
import { findTag } from './tag-config'
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
    const tagComponent = findTag(type)
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
 */
export { jsx as jsxDEV }

/**
 * Fragment — mounts children in parallel without a wrapper element.
 */
export function Fragment(props: { children?: unknown }): Mountable<unknown> {
  const childMounts = processChildren(props.children as JSXChild | JSXChild[] | undefined)
  return ((host: unknown) => {
    const cleanups = childMounts.map(c => (c as (h: unknown) => (() => void) | undefined)(host))
    return () => { for (const u of cleanups) if (u) u() }
  }) as unknown as Mountable<unknown>
}
