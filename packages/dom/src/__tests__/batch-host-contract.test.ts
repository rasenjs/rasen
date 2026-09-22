/**
 * The `batch` staging-host contract, pinned by a test.
 *
 * `batch` exists to coalesce DOM writes: a branch is built inside a
 * DocumentFragment and flushed into the real parent in one move. That means the
 * subtree mounted inside the batch receives the FRAGMENT as its host, caches it
 * (the normal contract for every structural component), and the fragment is
 * detached and emptied the moment the batch flushes.
 *
 * So an `insert(parent, node, ref)` inside such a subtree is called with a `parent`
 * that is a detached, empty fragment while `ref.parentNode` is the live container.
 * That is not a caller mistake and not a rare race — it happens on EVERY update of
 * a structural component nested in a batched branch. These tests measure it so the
 * relationship is documented by evidence rather than by a comment, and so a future
 * change to `batch` that breaks the assumption fails here.
 *
 * The behaviour this forces (insert relative to `ref`, not relative to the cached
 * host) is what `guardedInsertBefore` implements; the behavioural consequences are
 * covered in when-nested-branch.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from '@vue/reactivity'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { mount, when, element } from '../index'
import { hostHooks } from '../host-hooks'

interface Insert {
  hostIsFragment: boolean
  hostConnected: boolean
  hostChildCount: number
  refInHost: boolean
  refParentIsFragment: boolean
  refParentConnected: boolean
  hostEqualsRefParent: boolean
}

describe('batch staging-host contract', () => {
  let container: HTMLElement

  beforeEach(() => {
    useReactiveRuntime()
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  /** Run a nested-when mount + inner switch, recording every batch flush. */
  function trace(): { duringMount: Insert[]; duringInnerSwitch: Insert[] } {
    const recorded: Insert[] = []
    const realBatch = hostHooks.batch!

    hostHooks.batch = ((host: HTMLElement) => {
      const b = realBatch(host)
      const realFlush = b.flush
      b.flush = (targetHost: HTMLElement, r: Node | null) => {
        const parent = r?.parentNode ?? null
        recorded.push({
          hostIsFragment: targetHost.nodeType === 11,
          hostConnected: (targetHost as unknown as { isConnected?: boolean }).isConnected === true,
          hostChildCount: targetHost.childNodes.length,
          refInHost: r ? targetHost.contains(r) : false,
          refParentIsFragment: parent?.nodeType === 11,
          refParentConnected: (parent as unknown as { isConnected?: boolean })?.isConnected === true,
          hostEqualsRefParent: parent === targetHost
        })
        realFlush(targetHost, r)
      }
      return b
    }) as typeof hostHooks.batch

    try {
      const outer = ref(true)
      const inner = ref(true)

      mount(
        when({
          condition: () => outer.value,
          then: () =>
            when({
              condition: () => inner.value,
              then: () => element({ tag: 'div', children: 'A' }),
              else: () => element({ tag: 'div', children: 'B' })
            }),
          else: () => element({ tag: 'div', children: 'E' })
        }),
        container
      )

      const duringMount = recorded.slice()
      recorded.length = 0
      inner.value = false
      return { duringMount, duringInnerSwitch: recorded.slice() }
    } finally {
      hostHooks.batch = realBatch
    }
  }

  it('flushes normally while the subtree is still being built in staging', () => {
    const { duringMount } = trace()
    // The inner branch is built in the outer branch's fragment: the host IS the
    // staging fragment and the anchor is inside it, so host === ref.parentNode.
    const staged = duringMount.find((f) => f.hostIsFragment)
    expect(staged).toBeDefined()
    expect(staged!.hostConnected).toBe(false)
    expect(staged!.refInHost).toBe(true)
    expect(staged!.hostEqualsRefParent).toBe(true)

    // The outer flush moves that fragment into the real DOM.
    const outerFlush = duringMount.find((f) => !f.hostIsFragment)
    expect(outerFlush).toBeDefined()
    expect(outerFlush!.hostConnected).toBe(true)
    expect(outerFlush!.hostEqualsRefParent).toBe(true)
  })

  it('hands a DETACHED, EMPTY fragment to the next update of the nested component', () => {
    const { duringInnerSwitch } = trace()
    expect(duringInnerSwitch.length).toBeGreaterThan(0)

    for (const flush of duringInnerSwitch) {
      // This is the whole point: the cached host is a shell — not in the document,
      // and empty — because its children were moved out by the outer flush.
      expect(flush.hostIsFragment).toBe(true)
      expect(flush.hostConnected).toBe(false)
      expect(flush.hostChildCount).toBe(0)
      // ...while the anchor is in a live container, because it went with the flush.
      expect(flush.refInHost).toBe(false)
      expect(flush.refParentConnected).toBe(true)
      expect(flush.hostEqualsRefParent).toBe(false)
    }
  })

  it('therefore an insert must be resolved against the anchor, not the host', () => {
    // The previous case shows host and ref.parentNode disagreeing on every update
    // of a nested component. Inserting into the host cannot place the node before
    // the anchor (the anchor is not there), so resolving against the anchor is the
    // only interpretation of "insert before ref" that is satisfiable. This asserts
    // the outcome a caller actually depends on.
    const { duringInnerSwitch } = trace()
    expect(duringInnerSwitch.some((f) => f.hostEqualsRefParent === false)).toBe(true)
    // And the branch really did switch (guardedInsertBefore resolved it correctly).
    expect(container.textContent).toBe('B')
  })

  it('does not guess a position when the anchor itself is detached', () => {
    // The one case the contract cannot satisfy: `ref` is not in any tree, so
    // "immediately before ref" has no answer. The caller is updating a torn-down
    // branch. Placing the node anyway (in the cached host) would put it at the END
    // of a possibly-dead container — a wrong position is harder to diagnose than a
    // missing one — so nothing is placed and the anomaly is reported once.
    const anchor = document.createComment('never inserted')
    const node = document.createElement('span')
    expect(anchor.parentNode).toBeNull()

    hostHooks.insert!(container, node, anchor)

    expect(node.parentNode).toBeNull()
    expect(container.childNodes.length).toBe(0)
  })
})
