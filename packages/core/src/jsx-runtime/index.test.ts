/**
 * JSX runtime tests — child normalization and the host-agnostic Fragment.
 *
 * `processChildren` is the contract every host adapter consumes: it decides
 * what a child list becomes before a tag component or a component function
 * sees it. The two regressions locked down here both came from a fragment that
 * mixed literal children with a mapped list.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { jsx, Fragment, configureTags, clearTags } from './index'
import type { TagComponent } from './tag-config'

const captured: Record<string, unknown>[] = []

/** Minimal host tags: record the props they were called with. */
function registerTags(): void {
  const record = (tag: string): TagComponent => ((props: Record<string, unknown>) => {
    captured.push({ tag, ...props })
    return () => undefined
  }) as unknown as TagComponent
  configureTags({ '': { div: record('div'), span: record('span') } })
}

beforeEach(() => {
  captured.length = 0
  clearTags()
  registerTags()
})

afterEach(() => {
  clearTags()
})

describe('processChildren', () => {
  it('flattens nested arrays instead of dropping them', () => {
    // `<>{label}{rows.map(…)}</>` — the literal child and the mapped list land
    // in one array whose second slot is itself an array. A non-flattening walk
    // saw an `unknown` there and skipped it, so neither the text nor the rows
    // rendered.
    jsx('div', {
      children: ['a', ['b', ['c']], jsx('span', { children: 'd' })],
    })

    const children = captured.find((c) => c.tag === 'div')!.children as unknown[]
    expect(children).toHaveLength(4)
    expect(children[0]).toBe('a')
    expect(children[1]).toBe('b')
    expect(children[2]).toBe('c')
    expect(typeof children[3]).toBe('function')
  })

  it('skips null / undefined / boolean children', () => {
    jsx('div', { children: [null, undefined, false, true, 'x'] })
    expect(captured[0].children).toEqual(['x'])
  })

  it('normalizes className to the class prop', () => {
    jsx('div', { className: 'box', children: 'x' })
    expect(captured[0].class).toBe('box')
    expect(captured[0].className).toBeUndefined()
  })
})

describe('Fragment (host-agnostic)', () => {
  it('mounts mountable children and unwinds them on unmount', () => {
    const stops = [vi.fn(), vi.fn()]
    let index = 0
    const child = (): (() => void) => stops[index++]

    const unmount = jsx(Fragment, { children: [child, child] })('host' as unknown, undefined)
    expect(index).toBe(2)

    unmount!()
    expect(stops[0]).toHaveBeenCalledTimes(1)
    expect(stops[1]).toHaveBeenCalledTimes(1)
  })

  it('skips text children with a single warning instead of calling them', () => {
    // A string child reaches the fragment list whenever an intrinsic tag would
    // turn it into a text node. Hosts that cannot do that must skip it — the
    // previous implementation invoked it as a mountable and threw
    // `TypeError: c is not a function`, taking the whole subtree down.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const mountable = jsx(Fragment, { children: ['a', 'b'] })
      expect(() => mountable('host' as unknown, undefined)).not.toThrow()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toContain('text/ref value')
    } finally {
      warn.mockRestore()
    }
  })
})
