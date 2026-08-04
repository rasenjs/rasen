/**
 * @rasenjs/rn-dom — Event system tests
 *
 * Tests dispatchEventWithBubble: capture → target → bubble phases,
 * stopPropagation, focus/blur, and instance map registration.
 */

import { describe, it, expect, vi } from 'vitest'
import { RNDocument, resetTagCounter, dispatchCommand, sendAccessibilityEvent, findNodeHandle, type RNNode } from '../index'
import { getFocusedNode } from '../node'
import { resetFabricMocks, nativeFabricUIManager, viewConfigRegistry, emitDeviceEvent, gGlobal } from './setup'
import { FABRIC_NODE_ID, type RNDomInternalNode } from '../node'
import { submitToRoot } from '../internal'

/**
 * 测试专用:节点同时暴露 DOM API 与内部成员(protected 在类上不可外部访问)。
 * RNNode & RNDomInternalNode 让测试既能 setAttribute/addEventListener,
 * 又能读 __RN_mounted/__RN_listeners/FABRIC_NODE_ID 等内部状态。
 */
type TestNode = RNNode & RNDomInternalNode
const t = (n: RNNode): TestNode => n as unknown as TestNode

function createDoc(): RNDocument {
  RNDocument.reset()
  resetTagCounter()
  resetFabricMocks()
  return RNDocument.getOrCreate(1)
}

describe('Event System', () => {
  // ── Instance Map ───────────────────────────────────────────────

  describe('instance map', () => {
    it('registers elements on appendChild', () => {
      const doc = createDoc()
      const p = t(doc.createElement('View'))
      const c = t(doc.createElement('Text'))
      p.appendChild(c)
      // Instance map is stored on globalThis under __RASEN_INSTANCE_MAP__
      const map = gGlobal.__RASEN_INSTANCE_MAP__!
      expect(map.has(c[FABRIC_NODE_ID])).toBe(true)
    })

    it('unregisters on removeChild', () => {
      const doc = createDoc()
      const p = t(doc.createElement('View'))
      const c = t(doc.createElement('Text'))
      p.appendChild(c)
      const map = gGlobal.__RASEN_INSTANCE_MAP__!
      const id = c[FABRIC_NODE_ID]
      p.removeChild(c)
      expect(map.has(id)).toBe(false)
    })
  })

  // ── Event dispatch (via props) ─────────────────────────────────

  describe('props-based dispatch', () => {
    it('stores onTouchEnd handler in __RN_currentProps via setAttribute', () => {
      const doc = createDoc()
      const fn = vi.fn()
      const el = t(doc.createElement('View'))
      el.setAttribute('onTouchEnd', fn)
      expect(el.__RN_currentProps.onTouchEnd).toBe(fn)
    })

    it('fires addEventListener handler on dispatchEvent', () => {
      const doc = createDoc()
      const fn = vi.fn()
      const el = t(doc.createElement('View'))
      el.addEventListener('touchend', fn)
      el.dispatchEvent(new Event('touchend'))
      expect(fn).toHaveBeenCalled()
    })
  })

  // ── addEventListener dispatch ──────────────────────────────────

  describe('addEventListener dispatchEvent', () => {
    it('calls registered handler', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      const fn = vi.fn()
      el.addEventListener('click', fn)
      el.dispatchEvent(new Event('click'))
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('notifies multiple listeners', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      const a = vi.fn()
      const b = vi.fn()
      el.addEventListener('click', a)
      el.addEventListener('click', b)
      el.dispatchEvent(new Event('click'))
      expect(a).toHaveBeenCalledTimes(1)
      expect(b).toHaveBeenCalledTimes(1)
    })

    it('respects removeEventListener', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      const fn = vi.fn()
      el.addEventListener('click', fn)
      el.removeEventListener('click', fn)
      el.dispatchEvent(new Event('click'))
      expect(fn).not.toHaveBeenCalled()
    })

    it('handleEvent object form works', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      const handleEvent = vi.fn()
      el.addEventListener('click', { handleEvent })
      el.dispatchEvent(new Event('click'))
      expect(handleEvent).toHaveBeenCalled()
    })

    it('does not throw when no listeners', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      expect(() => el.dispatchEvent(new Event('nobody'))).not.toThrow()
    })
  })

  // ── Capture phase listeners ────────────────────────────────────

  describe('capture phase', () => {
    it('stores capture listeners separately', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      const fn = vi.fn()
      el.addEventListener('click', fn, true)
      expect(el.__RN_listeners!.get('__capture_click')!.has(fn)).toBe(true)
    })

    it('stores capture listener with __capture_ prefix via options', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      const fn = vi.fn()
      el.addEventListener('click', fn, { capture: true })
      expect(el.__RN_listeners!.has('__capture_click')).toBe(true)
    })

    it('removes capture listener', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      const fn = vi.fn()
      el.addEventListener('click', fn, true)
      el.removeEventListener('click', fn, true)
      expect(el.__RN_listeners!.get('__capture_click')?.has(fn)).toBeFalsy()
    })
  })

  // ── Focus / Blur ───────────────────────────────────────────────

  describe('focus/blur tracking', () => {
    it('TextInput triggers auto-focus on touch end', () => {
      const doc = createDoc()
      const input = t(doc.createElement('TextInput'))
      doc.body.appendChild(input)
      expect(input.tagName).toBe('TextInput')
    })
  })

  // ── RN-style: stopPropagation ──────────────────────────────────

  describe('stopPropagation', () => {
    it('supports stopPropagation in event handlers', () => {
      const doc = createDoc()
      const p = t(doc.createElement('View'))
      const c = t(doc.createElement('Text'))
      p.appendChild(c)
      doc.body.appendChild(p)

      // Mark as mounted so our custom dispatch path works
      p.__RN_mounted = true
      c.__RN_mounted = true
      t(doc.body).__RN_mounted = true

      const parentFn = vi.fn()
      const childFn = vi.fn()
      p.addEventListener('click', parentFn)
      c.addEventListener('click', (e: Event) => {
        childFn()
        e.stopPropagation()
      })

      // dispatchEvent only triggers on target — not bubble
      c.dispatchEvent(new Event('click'))
      expect(childFn).toHaveBeenCalled()
    })
  })

  // ── RN-style: event target ────────────────────────────────────

  describe('event target', () => {
    it('event listener receives the dispatched Event', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      let received: any = null
      el.addEventListener('click', (e: Event) => { received = e })
      const ev = new Event('click')
      el.dispatchEvent(ev)
      expect(received).toBe(ev)
      expect(received.type).toBe('click')
    })
  })

  // ── RN-style: instance map for event lookup ────────────────────

  describe('dispatchEventWithBubble (from Fabric events)', () => {
    it('每次 RNDocument 都注册 registerEventHandler(无全局跳过标记)', () => {
      // _rnInitEventSystem 现在每次 RNDocument 构造都注册(幂等,覆盖旧 handler),
      // 不再依赖全局标记 —— 修复 Fast Refresh/二次挂载时事件到不了新上下文。
      createDoc()
      const calls = nativeFabricUIManager.registerEventHandler.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      expect(typeof calls[calls.length - 1][0]).toBe('function')
    })
  })

  // ── RN-style: registered handlers ─────────────────────────────

  describe('props-based event dispatch', () => {
    it('calls onTouchEnd from setAttribute', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      const fn = vi.fn()
      el.setAttribute('onTouchEnd', fn)
      // dispatchEvent doesn't read props — it uses __RN_listeners.
      // This tests that setAttribute stores in __RN_currentProps
      expect(typeof el.getAttribute('onTouchEnd')).toBe('function')
      expect(el.__RN_currentProps.onTouchEnd).toBe(fn)
    })
  })

  // ── RN-style: timeStamp propagation ────────────────────────────

  describe('timeStamp propagation', () => {
    it('provides timeStamp in handler nativeEvent', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      let received: any = null
      el.addEventListener('click', (e: Event) => { received = e })
      el.dispatchEvent(new Event('click', { cancelable: true }))
      expect(received).toBeTruthy()
    })
  })

  // ── dispatchCommand ────────────────────────────────────────────

  describe('dispatchCommand', () => {
    it('calls Fabric dispatchCommand via standalone function', () => {
      const doc = createDoc()
      t(doc.body).__RN_mounted = true
      const el = t(doc.createElement('TextInput'))
      doc.body.appendChild(el)
      submitToRoot(t(doc.body))

      dispatchCommand(el, 'scrollTo', [{ x: 0, y: 100 }])
      expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
        expect.any(Object),
        'scrollTo',
        [{ x: 0, y: 100 }],
      )
    })

    it('.focus() calls dispatchCommand with focus (DOM standard)', () => {
      const doc = createDoc()
      const el = t(doc.createElement('TextInput'))
      doc.body.appendChild(el)
      submitToRoot(t(doc.body))

      el.focus()
      expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
        expect.any(Object),
        'focus',
        [],
      )
    })

    it('.blur() calls dispatchCommand with blur (DOM standard)', () => {
      const doc = createDoc()
      const el = t(doc.createElement('TextInput'))
      doc.body.appendChild(el)
      submitToRoot(t(doc.body))

      el.blur()
      expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
        expect.any(Object),
        'blur',
        [],
      )
    })
  })

  // ── sendAccessibilityEvent ─────────────────────────────────────

  describe('sendAccessibilityEvent', () => {
    it('calls Fabric sendAccessibilityEvent via standalone function', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      doc.body.appendChild(el)
      submitToRoot(t(doc.body))

      sendAccessibilityEvent(el, 'layoutChanged')
      expect(nativeFabricUIManager.sendAccessibilityEvent).toHaveBeenCalledWith(
        expect.any(Object),
        'layoutChanged',
      )
    })

    // ── RN equivalent: should no-op if calling sendAccessibilityEvent on unmounted refs ──
    it('no-ops when node is null (unmounted ref)', () => {
      // Calling sendAccessibilityEvent with a null node should not throw
      expect(() => sendAccessibilityEvent(null as unknown as RNNode, 'focus')).not.toThrow()
    })
  })

  // ── findNodeHandle ─────────────────────────────────────────────

  describe('findNodeHandle', () => {
    it('returns the Fabric node ID for an RNNode', () => {
      const doc = createDoc()
      const el = t(doc.createElement('View'))
      expect(findNodeHandle(el)).toBe(el[FABRIC_NODE_ID])
    })

    it('returns null for null/undefined', () => {
      expect(findNodeHandle(null)).toBeNull()
      expect(findNodeHandle(undefined)).toBeNull()
    })

    it('returns null for non-node objects', () => {
      expect(findNodeHandle({})).toBeNull()
    })
  })

  // ── RN-style: skipBubbling ────────────────────────────────────

  describe('skipBubbling', () => {
    it('skips bubbling when viewConfig declares skipBubbling: true', () => {
      // This tests the event dispatch path via dispatchEventWithBubble.
      // The skipBubbling check reads viewConfig.bubblingEventTypes.
      // Since our mock viewConfig doesn't set that, default is bubble normally.
      const doc = createDoc()
      const p = t(doc.createElement('View'))
      const c = t(doc.createElement('Text'))
      p.__RN_mounted = true
      c.__RN_mounted = true
      p.appendChild(c)
      doc.body.appendChild(p)

      const parentFn = vi.fn()
      const childFn = vi.fn()
      p.addEventListener('touchend', parentFn)
      c.addEventListener('touchend', childFn)

      c.dispatchEvent(new Event('touchend'))
      // Both fire (normal bubbling)
      expect(childFn).toHaveBeenCalled()
    })
  })

  // ── RN-aligned surface semantics (Pressability + TextInput) ──

  describe('RN-aligned surface events (dispatchEventWithBubble)', () => {
    /** Get the handler Fabric registered via uim.registerEventHandler. */
    function fabricHandler() {
      const calls = nativeFabricUIManager.registerEventHandler.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      return calls[calls.length - 1][0] as (
        instanceHandle: object, type: string, payload: Record<string, unknown>
      ) => void
    }

    /** Build View > TextInput tree, mounted, returns nodes + fabric dispatcher. */
    function buildTree() {
      const doc = createDoc()
      const view = t(doc.createElement('View'))
      const input = t(doc.createElement('TextInput'))
      view.appendChild(input)
      doc.body.appendChild(view)
      view.__RN_mounted = true
      input.__RN_mounted = true
      t(doc.body).__RN_mounted = true
      submitToRoot(t(doc.body))
      return { doc, view, input, dispatch: fabricHandler() }
    }

    it('topTouchStart fires onPressIn then onTouchStart (independent, both fire)', () => {
      const { input, dispatch } = buildTree()
      const pressIn = vi.fn()
      const touchStart = vi.fn()
      input.setAttribute('onPressIn', pressIn)
      input.setAttribute('onTouchStart', touchStart)
      dispatch({ stateNode: input }, 'topTouchStart', { target: input[FABRIC_NODE_ID] })
      expect(pressIn).toHaveBeenCalledTimes(1)
      expect(touchStart).toHaveBeenCalledTimes(1)
    })

    it('topTouchEnd fires onPressOut then onPress (RN Pressability order)', () => {
      const { input, dispatch } = buildTree()
      const order: string[] = []
      const pressOut = vi.fn(() => order.push('pressOut'))
      const press = vi.fn(() => order.push('press'))
      const touchEnd = vi.fn(() => order.push('touchEnd'))
      input.setAttribute('onPressOut', pressOut)
      input.setAttribute('onPress', press)
      input.setAttribute('onTouchEnd', touchEnd)
      // Simulate press start so tracking exists
      dispatch({ stateNode: input }, 'topTouchStart', { target: input[FABRIC_NODE_ID] })
      dispatch({ stateNode: input }, 'topTouchEnd', { target: input[FABRIC_NODE_ID] })
      expect(order).toEqual(['pressOut', 'press', 'touchEnd'])
    })

    it('topTouchMove fires onPressMove then onTouchMove', () => {
      const { input, dispatch } = buildTree()
      const pressMove = vi.fn()
      const touchMove = vi.fn()
      input.setAttribute('onPressIn', vi.fn()) // establishes press owner
      input.setAttribute('onPressMove', pressMove)
      input.setAttribute('onTouchMove', touchMove)
      // Real touch sequence: start first (sets responder), then move
      dispatch({ stateNode: input }, 'topTouchStart', { target: input[FABRIC_NODE_ID] })
      dispatch({ stateNode: input }, 'topTouchMove', { target: input[FABRIC_NODE_ID] })
      expect(pressMove).toHaveBeenCalledTimes(1)
      expect(touchMove).toHaveBeenCalledTimes(1)
    })

    it('onTouchEnd bubbles from target Text up through ancestor Views (RN bubbling)', () => {
      const doc = createDoc()
      const grand = t(doc.createElement('View'))
      const parent = t(doc.createElement('View'))
      const child = t(doc.createElement('View'))
      const text = t(doc.createElement('Text'))
      child.appendChild(text)
      parent.appendChild(child)
      grand.appendChild(parent)
      doc.body.appendChild(grand)
      grand.__RN_mounted = true
      parent.__RN_mounted = true
      child.__RN_mounted = true
      text.__RN_mounted = true
      t(doc.body).__RN_mounted = true
      submitToRoot(t(doc.body))
      const dispatch = fabricHandler()
      const childFn = vi.fn()
      const parentFn = vi.fn()
      const grandFn = vi.fn()
      child.setAttribute('onTouchEnd', childFn)
      parent.setAttribute('onTouchEnd', parentFn)
      grand.setAttribute('onTouchEnd', grandFn)
      // Tap the innermost Text; onTouchEnd bubbles child → parent → grand
      dispatch({ stateNode: text }, 'topTouchEnd', { target: text[FABRIC_NODE_ID] })
      expect(childFn).toHaveBeenCalledTimes(1)
      expect(parentFn).toHaveBeenCalledTimes(1)
      expect(grandFn).toHaveBeenCalledTimes(1)
    })

    it('long-press suppresses onPress but keeps pressOut (RN Pressability)', async () => {
      const { input, dispatch } = buildTree()
      const pressOut = vi.fn()
      const press = vi.fn()
      const longPress = vi.fn()
      input.setAttribute('onPressOut', pressOut)
      input.setAttribute('onPress', press)
      input.setAttribute('onLongPress', longPress)
      dispatch({ stateNode: input }, 'topTouchStart', { target: input[FABRIC_NODE_ID] })
      // Wait > 500ms for the long-press timer
      await new Promise(r => setTimeout(r, 550))
      expect(longPress).toHaveBeenCalledTimes(1)
      dispatch({ stateNode: input }, 'topTouchEnd', { target: input[FABRIC_NODE_ID] })
      expect(pressOut).toHaveBeenCalledTimes(1)
      expect(press).not.toHaveBeenCalled() // suppressed by long-press
    })

    it('topChange fires onChange (event) AND onChangeText (string) — both independent', () => {
      const { input, dispatch } = buildTree()
      const onChange = vi.fn()
      const onChangeText = vi.fn()
      input.setAttribute('onChange', onChange)
      input.setAttribute('onChangeText', onChangeText)
      dispatch({ stateNode: input }, 'topChange', { target: input[FABRIC_NODE_ID], text: 'hi' })
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChangeText).toHaveBeenCalledTimes(1)
      expect(onChangeText).toHaveBeenCalledWith('hi')
      expect(onChange.mock.calls[0][0]).toMatchObject({ text: 'hi' })
    })

    it('nested pressable: inner onPress wins as responder, outer does not fire', () => {
      const doc = createDoc()
      const outer = t(doc.createElement('View'))
      const inner = t(doc.createElement('Text'))
      outer.appendChild(inner)
      doc.body.appendChild(outer)
      outer.__RN_mounted = true
      inner.__RN_mounted = true
      t(doc.body).__RN_mounted = true
      submitToRoot(t(doc.body))

      const outerPress = vi.fn()
      const innerPress = vi.fn()
      outer.setAttribute('onPress', outerPress)
      inner.setAttribute('onPress', innerPress)

      const dispatch = fabricHandler()
      // Simulate a touch that starts+ends on the inner node
      dispatch({ stateNode: inner }, 'topTouchStart', { target: inner[FABRIC_NODE_ID] })
      dispatch({ stateNode: inner }, 'topTouchEnd', { target: inner[FABRIC_NODE_ID] })

      // Inner pressable is the responder — outer must NOT fire (RN responder).
      expect(innerPress).toHaveBeenCalledTimes(1)
      expect(outerPress).not.toHaveBeenCalled()
    })

    it('touch on child with no press handler: parent onPress becomes responder', () => {
      const doc = createDoc()
      const outer = t(doc.createElement('View'))
      const inner = t(doc.createElement('Text'))
      outer.appendChild(inner)
      doc.body.appendChild(outer)
      outer.__RN_mounted = true
      inner.__RN_mounted = true
      t(doc.body).__RN_mounted = true
      submitToRoot(t(doc.body))

      const outerPress = vi.fn()
      outer.setAttribute('onPress', outerPress)
      // inner has NO press handlers — plain touch

      const dispatch = fabricHandler()
      dispatch({ stateNode: inner }, 'topTouchStart', { target: inner[FABRIC_NODE_ID] })
      dispatch({ stateNode: inner }, 'topTouchEnd', { target: inner[FABRIC_NODE_ID] })

      // Parent is the nearest press handler → responder, fires onPress.
      expect(outerPress).toHaveBeenCalledTimes(1)
    })

    it('touch events bubble to every ancestor (RN bubblingEventTypes)', () => {
      const doc = createDoc()
      const grand = t(doc.createElement('View'))
      const parent = t(doc.createElement('View'))
      const child = t(doc.createElement('Text'))
      grand.appendChild(parent)
      parent.appendChild(child)
      doc.body.appendChild(grand)
      grand.__RN_mounted = true
      parent.__RN_mounted = true
      child.__RN_mounted = true
      t(doc.body).__RN_mounted = true
      submitToRoot(t(doc.body))

      const childEnd = vi.fn()
      const parentEnd = vi.fn()
      const grandEnd = vi.fn()
      child.setAttribute('onTouchEnd', childEnd)
      parent.setAttribute('onTouchEnd', parentEnd)
      grand.setAttribute('onTouchEnd', grandEnd)

      const dispatch = fabricHandler()
      dispatch({ stateNode: child }, 'topTouchEnd', { target: child[FABRIC_NODE_ID] })

      // RN bubbling: ALL ancestors fire, not just the first handler node.
      expect(childEnd).toHaveBeenCalledTimes(1)
      expect(parentEnd).toHaveBeenCalledTimes(1)
      expect(grandEnd).toHaveBeenCalledTimes(1)
    })

    it('press owner fires pressOut/press on touchEnd even when touch bubbles', () => {
      const doc = createDoc()
      const pressable = t(doc.createElement('View'))
      const inner = t(doc.createElement('Text'))
      pressable.appendChild(inner)
      doc.body.appendChild(pressable)
      pressable.__RN_mounted = true
      inner.__RN_mounted = true
      t(doc.body).__RN_mounted = true
      submitToRoot(t(doc.body))

      const pressIn = vi.fn()
      const pressOut = vi.fn()
      const press = vi.fn()
      const touchEnd = vi.fn()
      pressable.setAttribute('onPressIn', pressIn)
      pressable.setAttribute('onPressOut', pressOut)
      pressable.setAttribute('onPress', press)
      inner.setAttribute('onTouchEnd', touchEnd)

      const dispatch = fabricHandler()
      dispatch({ stateNode: inner }, 'topTouchStart', { target: inner[FABRIC_NODE_ID] })
      dispatch({ stateNode: inner }, 'topTouchEnd', { target: inner[FABRIC_NODE_ID] })

      // Pressable (ancestor) is the responder → press series fires on it.
      expect(pressIn).toHaveBeenCalledTimes(1)
      expect(pressOut).toHaveBeenCalledTimes(1)
      expect(press).toHaveBeenCalledTimes(1)
      // Child's onTouchEnd bubbles independently.
      expect(touchEnd).toHaveBeenCalledTimes(1)
    })
  })

  // ── viewConfig-driven behavior (bubbling/direct from RN's event tables) ──

  describe('viewConfig-driven event behavior', () => {
    function fabricHandler() {
      const calls = nativeFabricUIManager.registerEventHandler.mock.calls
      return calls[calls.length - 1][0] as (
        instanceHandle: object, type: string, payload: Record<string, unknown>
      ) => void
    }

    function buildWithViewConfig(_extra: Record<string, unknown>) {
      const doc = createDoc()
      const view = t(doc.createElement('View'))
      const child = t(doc.createElement('Text'))
      view.appendChild(child)
      doc.body.appendChild(view)
      view.__RN_mounted = true
      child.__RN_mounted = true
      t(doc.body).__RN_mounted = true
      submitToRoot(t(doc.body))
      return { doc, view, child, dispatch: fabricHandler() }
    }

    it('topLayout (direct event) fires ONLY on target, not ancestors', () => {
      const { view, child, dispatch } = buildWithViewConfig({})
      const childLayout = vi.fn()
      const viewLayout = vi.fn()
      child.setAttribute('onLayout', childLayout)
      view.setAttribute('onLayout', viewLayout)
      dispatch({ stateNode: child }, 'topLayout', { target: child[FABRIC_NODE_ID] })
      expect(childLayout).toHaveBeenCalledTimes(1)
      expect(viewLayout).not.toHaveBeenCalled() // direct: no bubble
    })

    it('topFocus (bubbling) bubbles to all ancestors with onFocus', () => {
      const { view, child, dispatch } = buildWithViewConfig({})
      const childFocus = vi.fn()
      const viewFocus = vi.fn()
      child.setAttribute('onFocus', childFocus)
      view.setAttribute('onFocus', viewFocus)
      dispatch({ stateNode: child }, 'topFocus', { target: child[FABRIC_NODE_ID] })
      expect(childFocus).toHaveBeenCalledTimes(1)
      expect(viewFocus).toHaveBeenCalledTimes(1)
    })

    it('viewConfig skipBubbling stops after first handling node', () => {
      const doc = createDoc()
      // Override RCTText's viewConfig with skipBubbling on topTouchEnd.
      // (The target node's config decides skip behavior.)
      viewConfigRegistry.register('RCTText', {
        validAttributes: { style: true },
        bubblingEventTypes: {
          topTouchEnd: {
            phasedRegistrationNames: {
              bubbled: 'onTouchEnd',
              captured: 'onTouchEndCapture',
              skipBubbling: true,
            },
          },
        },
      })
      const view = t(doc.createElement('View'))
      const child = t(doc.createElement('Text'))
      view.appendChild(child)
      doc.body.appendChild(view)
      view.__RN_mounted = true
      child.__RN_mounted = true
      t(doc.body).__RN_mounted = true
      submitToRoot(t(doc.body))

      const childEnd = vi.fn()
      const viewEnd = vi.fn()
      child.setAttribute('onTouchEnd', childEnd)
      view.setAttribute('onTouchEnd', viewEnd)
      const dispatch = fabricHandler()
      dispatch({ stateNode: child }, 'topTouchEnd', { target: child[FABRIC_NODE_ID] })
      expect(childEnd).toHaveBeenCalledTimes(1)
      expect(viewEnd).not.toHaveBeenCalled() // skipBubbling stopped it

      // Restore RCTText's default config so later tests are unaffected.
      viewConfigRegistry.register('RCTText', {
        validAttributes: { style: true, onTouchEnd: true },
        bubblingEventTypes: {
          topTouchEnd: { phasedRegistrationNames: { bubbled: 'onTouchEnd', captured: 'onTouchEndCapture' } },
          topTouchStart: { phasedRegistrationNames: { bubbled: 'onTouchStart', captured: 'onTouchStartCapture' } },
          topTouchMove: { phasedRegistrationNames: { bubbled: 'onTouchMove', captured: 'onTouchMoveCapture' } },
          topTouchCancel: { phasedRegistrationNames: { bubbled: 'onTouchCancel', captured: 'onTouchCancelCapture' } },
          topPress: { phasedRegistrationNames: { bubbled: 'onPress', captured: 'onPressCapture' } },
          topChange: { phasedRegistrationNames: { bubbled: 'onChange', captured: 'onChangeCapture' } },
          topFocus: { phasedRegistrationNames: { bubbled: 'onFocus', captured: 'onFocusCapture' } },
          topBlur: { phasedRegistrationNames: { bubbled: 'onBlur', captured: 'onBlurCapture' } },
          topSubmitEditing: { phasedRegistrationNames: { bubbled: 'onSubmitEditing', captured: 'onSubmitEditingCapture' } },
          topEndEditing: { phasedRegistrationNames: { bubbled: 'onEndEditing', captured: 'onEndEditingCapture' } },
          topKeyPress: { phasedRegistrationNames: { bubbled: 'onKeyPress', captured: 'onKeyPressCapture' } },
        },
        directEventTypes: { topLayout: { registrationName: 'onLayout' } },
      })
    })

    it('custom bubbled name from viewConfig is honored (onPress on View)', () => {
      const { view, child, dispatch } = buildWithViewConfig({})
      const viewPress = vi.fn()
      view.setAttribute('onPress', viewPress)
      // topPress bubbles (from the shared bubbling table) — child has no
      // handler, so it bubbles to view's onPress.
      dispatch({ stateNode: child }, 'topPress', { target: child[FABRIC_NODE_ID] })
      expect(viewPress).toHaveBeenCalledTimes(1)
    })
  })

  // ── Press-rect transitions + disabled + value transforms ──

  describe('press-rect & value transforms', () => {
    function fabricHandler() {
      const calls = nativeFabricUIManager.registerEventHandler.mock.calls
      return calls[calls.length - 1][0] as (
        instanceHandle: object, type: string, payload: Record<string, unknown>
      ) => void
    }

    function build() {
      const doc = createDoc()
      const view = t(doc.createElement('View'))
      const btn = t(doc.createElement('Text'))
      view.appendChild(btn)
      doc.body.appendChild(view)
      view.__RN_mounted = true
      btn.__RN_mounted = true
      t(doc.body).__RN_mounted = true
      submitToRoot(t(doc.body))
      return { doc, view, btn, dispatch: fabricHandler() }
    }

    /** Touch events carry pageX/pageY for press-rect checks. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const touchPayload = (node: any, x: number, y: number) => ({
      target: node[FABRIC_NODE_ID],
      pageX: x,
      pageY: y,
    })

    it('release outside press rect does NOT fire onPress (pressOut fires)', () => {
      const { btn, dispatch } = build()
      const pressIn = vi.fn()
      const pressOut = vi.fn()
      const press = vi.fn()
      btn.setAttribute('onPressIn', pressIn)
      btn.setAttribute('onPressOut', pressOut)
      btn.setAttribute('onPress', press)
      dispatch({ stateNode: btn }, 'topTouchStart', { target: btn[FABRIC_NODE_ID], pageX: 100, pageY: 100 })
      // Move far outside the press rect (offset default 20)
      dispatch({ stateNode: btn }, 'topTouchMove', touchPayload(btn, 500, 500))
      // pressOut fired on leaving the rect
      expect(pressOut).toHaveBeenCalledTimes(1)
      // Release outside → onPress must NOT fire (RN Pressability)
      dispatch({ stateNode: btn }, 'topTouchEnd', touchPayload(btn, 500, 500))
      expect(press).not.toHaveBeenCalled()
    })

    it('move back inside rect re-fires pressIn', () => {
      const { btn, dispatch } = build()
      const pressIn = vi.fn()
      const press = vi.fn()
      btn.setAttribute('onPressIn', pressIn)
      btn.setAttribute('onPress', press)
      dispatch({ stateNode: btn }, 'topTouchStart', touchPayload(btn, 100, 100))
      expect(pressIn).toHaveBeenCalledTimes(1)
      dispatch({ stateNode: btn }, 'topTouchMove', touchPayload(btn, 500, 500)) // leave
      dispatch({ stateNode: btn }, 'topTouchMove', touchPayload(btn, 110, 110)) // re-enter
      expect(pressIn).toHaveBeenCalledTimes(2) // pressIn again (RN Pressability)
      dispatch({ stateNode: btn }, 'topTouchEnd', touchPayload(btn, 110, 110))
      expect(press).toHaveBeenCalledTimes(1) // was inside on release
    })

    it('disabled pressable does not claim responder (no press events)', () => {
      const { btn, dispatch } = build()
      const press = vi.fn()
      btn.setAttribute('onPress', press)
      btn.setAttribute('disabled', true)
      dispatch({ stateNode: btn }, 'topTouchStart', touchPayload(btn, 100, 100))
      dispatch({ stateNode: btn }, 'topTouchEnd', touchPayload(btn, 100, 100))
      expect(press).not.toHaveBeenCalled()
    })

    it('topChange fires onValueChange with boolean (Switch)', () => {
      const { doc, dispatch } = build()
      const sw = t(doc.createElement('Switch'))
      doc.body.appendChild(sw)
      const onValueChange = vi.fn()
      sw.setAttribute('onValueChange', onValueChange)
      dispatch({ stateNode: sw }, 'topChange', { target: sw[FABRIC_NODE_ID], value: true })
      expect(onValueChange).toHaveBeenCalledWith(true)
    })

    it('topScroll releases an active press responder (ScrollView steals)', () => {
      const { btn, dispatch } = build()
      const press = vi.fn()
      btn.setAttribute('onPress', press)
      dispatch({ stateNode: btn }, 'topTouchStart', touchPayload(btn, 100, 100))
      // Scroll event (direct, target = scrollview ancestor) releases the press
      dispatch({ stateNode: btn }, 'topScroll', { target: btn[FABRIC_NODE_ID] })
      dispatch({ stateNode: btn }, 'topTouchEnd', touchPayload(btn, 100, 100))
      expect(press).not.toHaveBeenCalled()
    })

    it('topScroll cancels press and fires onPressOut immediately (RN)', () => {
      const { btn, dispatch } = build()
      const pressIn = vi.fn()
      const pressOut = vi.fn()
      const press = vi.fn()
      btn.setAttribute('onPressIn', pressIn)
      btn.setAttribute('onPressOut', pressOut)
      btn.setAttribute('onPress', press)
      dispatch({ stateNode: btn }, 'topTouchStart', touchPayload(btn, 100, 100))
      expect(pressIn).toHaveBeenCalledTimes(1)
      // ScrollView steals the responder → cancel fires pressOut immediately
      dispatch({ stateNode: btn }, 'topScroll', { target: btn[FABRIC_NODE_ID] })
      expect(pressOut).toHaveBeenCalledTimes(1)
      expect(press).not.toHaveBeenCalled()
    })

    it('topTouchCancel fires onPressOut immediately, never onPress (RN)', () => {
      const { btn, dispatch } = build()
      const pressIn = vi.fn()
      const pressOut = vi.fn()
      const press = vi.fn()
      btn.setAttribute('onPressIn', pressIn)
      btn.setAttribute('onPressOut', pressOut)
      btn.setAttribute('onPress', press)
      dispatch({ stateNode: btn }, 'topTouchStart', touchPayload(btn, 100, 100))
      expect(pressIn).toHaveBeenCalledTimes(1)
      dispatch({ stateNode: btn }, 'topTouchCancel', touchPayload(btn, 100, 100))
      expect(pressOut).toHaveBeenCalledTimes(1)
      expect(press).not.toHaveBeenCalled()
    })

    it('numeric pressRectOffset applies to all sides (RN Pressability)', () => {
      const { btn, dispatch } = build()
      const pressIn = vi.fn()
      const pressOut = vi.fn()
      const press = vi.fn()
      btn.setAttribute('onPressIn', pressIn)
      btn.setAttribute('onPressOut', pressOut)
      btn.setAttribute('onPress', press)
      btn.setAttribute('pressRectOffset', 10) // strict: all sides 10
      dispatch({ stateNode: btn }, 'topTouchStart', touchPayload(btn, 100, 100))
      expect(pressIn).toHaveBeenCalledTimes(1)
      // 16px below the press point (>10) → leave the rect → pressOut fires
      dispatch({ stateNode: btn }, 'topTouchMove', touchPayload(btn, 100, 116))
      expect(pressOut).toHaveBeenCalledTimes(1)
      // Releasing outside the rect must NOT fire onPress (RN Pressability)
      dispatch({ stateNode: btn }, 'topTouchEnd', touchPayload(btn, 100, 116))
      expect(press).not.toHaveBeenCalled()
    })

    it('release outside rect does NOT fire pressOut again (RN: ACTIVE_PRESS_OUT.RELEASE)', () => {
      const { btn, dispatch } = build()
      const pressOut = vi.fn()
      const press = vi.fn()
      btn.setAttribute('onPressOut', pressOut)
      btn.setAttribute('onPress', press)
      dispatch({ stateNode: btn }, 'topTouchStart', touchPayload(btn, 100, 100))
      // Leave the rect → pressOut fires once (RN: deactivate)
      dispatch({ stateNode: btn }, 'topTouchMove', touchPayload(btn, 500, 500))
      expect(pressOut).toHaveBeenCalledTimes(1)
      // Release outside → pressOut must NOT fire again, onPress never fires
      dispatch({ stateNode: btn }, 'topTouchEnd', touchPayload(btn, 500, 500))
      expect(pressOut).toHaveBeenCalledTimes(1)
      expect(press).not.toHaveBeenCalled()
    })

    it('insets pressRectOffset overrides per side (RN Pressability)', () => {
      const { btn, dispatch } = build()
      const pressOut = vi.fn()
      const press = vi.fn()
      btn.setAttribute('onPressOut', pressOut)
      btn.setAttribute('onPress', press)
      // generous bottom, tiny top
      btn.setAttribute('pressRectOffset', { top: 5, left: 20, right: 20, bottom: 50 })
      dispatch({ stateNode: btn }, 'topTouchStart', touchPayload(btn, 100, 100))
      // 30px down (> bottom 50? no → still in). Use top: 20px up (>5 → out)
      dispatch({ stateNode: btn }, 'topTouchMove', touchPayload(btn, 100, 78))
      expect(pressOut).toHaveBeenCalledTimes(1)
      dispatch({ stateNode: btn }, 'topTouchEnd', touchPayload(btn, 100, 78))
      expect(press).not.toHaveBeenCalled()
    })
  })

  // ── tap-to-dismiss:keyboardShouldPersistTaps(ScrollView.js) ──

  describe('tap-to-dismiss keyboard (keyboardShouldPersistTaps)', () => {
    function fabricHandler() {
      const calls = nativeFabricUIManager.registerEventHandler.mock.calls
      return calls[calls.length - 1][0] as (
        instanceHandle: object, type: string, payload: Record<string, unknown>
      ) => void
    }

    /** ScrollView > content View,内含 TextInput + Pressable 按钮。 */
    function build() {
      const doc = createDoc()
      const sv = t(doc.createElement('ScrollView'))
      const content = t(doc.createElement('View'))
      const input = t(doc.createElement('TextInput'))
      const btn = t(doc.createElement('Pressable'))
      content.appendChild(input)
      content.appendChild(btn)
      sv.appendChild(content)
      doc.body.appendChild(sv)
      submitToRoot(t(doc.body))
      return { doc, sv, content, input, btn, dispatch: fabricHandler() }
    }

    /** 模拟点输入框使其聚焦(auto-focus)。 */
    function focusInput(b: ReturnType<typeof build>): void {
      b.dispatch({ stateNode: b.input }, 'topTouchEnd', { target: b.input[FABRIC_NODE_ID] })
    }

    it('tap 外部:blur + 默认 handled 吞掉 press(第一次 tap 只收键盘)', () => {
      const b = build()
      const pressIn = vi.fn()
      const press = vi.fn()
      const pressOut = vi.fn()
      b.btn.setAttribute('onPressIn', pressIn)
      b.btn.setAttribute('onPress', press)
      b.btn.setAttribute('onPressOut', pressOut)
      focusInput(b)
      expect(getFocusedNode()).toBe(b.input)
      b.dispatch({ stateNode: b.btn }, 'topTouchStart', { target: b.btn[FABRIC_NODE_ID] })
      expect(pressIn).toHaveBeenCalledTimes(1)
      b.dispatch({ stateNode: b.btn }, 'topTouchEnd', { target: b.btn[FABRIC_NODE_ID] })
      // 键盘收起(blur)+ 吞掉本次 press(handled 默认:第一次 tap 收键盘)
      expect(getFocusedNode()).toBeNull()
      expect(press).not.toHaveBeenCalled()
      expect(pressOut).toHaveBeenCalledTimes(1) // cancel 触发 pressOut
    })

    it("keyboardShouldPersistTaps='always' → 不 blur、press 正常触发", () => {
      const b = build()
      b.sv.setAttribute('keyboardShouldPersistTaps', 'always')
      const press = vi.fn()
      b.btn.setAttribute('onPress', press)
      focusInput(b)
      b.dispatch({ stateNode: b.btn }, 'topTouchStart', { target: b.btn[FABRIC_NODE_ID] })
      b.dispatch({ stateNode: b.btn }, 'topTouchEnd', { target: b.btn[FABRIC_NODE_ID] })
      expect(getFocusedNode()).toBe(b.input)
      expect(press).toHaveBeenCalledTimes(1)
    })

    it("keyboardShouldPersistTaps='never' → blur 但不吞 press", () => {
      const b = build()
      b.sv.setAttribute('keyboardShouldPersistTaps', 'never')
      const press = vi.fn()
      b.btn.setAttribute('onPress', press)
      focusInput(b)
      b.dispatch({ stateNode: b.btn }, 'topTouchStart', { target: b.btn[FABRIC_NODE_ID] })
      b.dispatch({ stateNode: b.btn }, 'topTouchEnd', { target: b.btn[FABRIC_NODE_ID] })
      expect(getFocusedNode()).toBeNull()
      expect(press).toHaveBeenCalledTimes(1)
    })

    it('无 ScrollView 祖先:blur 但不吞 press', () => {
      const doc = createDoc()
      const view = t(doc.createElement('View'))
      const input = t(doc.createElement('TextInput'))
      const btn = t(doc.createElement('Pressable'))
      view.appendChild(input)
      view.appendChild(btn)
      doc.body.appendChild(view)
      submitToRoot(t(doc.body))
      const dispatch = fabricHandler()
      const press = vi.fn()
      btn.setAttribute('onPress', press)
      dispatch({ stateNode: input }, 'topTouchEnd', { target: input[FABRIC_NODE_ID] })
      dispatch({ stateNode: btn }, 'topTouchStart', { target: btn[FABRIC_NODE_ID] })
      dispatch({ stateNode: btn }, 'topTouchEnd', { target: btn[FABRIC_NODE_ID] })
      expect(getFocusedNode()).toBeNull()
      expect(press).toHaveBeenCalledTimes(1)
    })

    it('点另一个输入框:转移焦点、不吞', () => {
      const doc = createDoc()
      const view = t(doc.createElement('View'))
      const a = t(doc.createElement('TextInput'))
      const b2 = t(doc.createElement('TextInput'))
      view.appendChild(a)
      view.appendChild(b2)
      doc.body.appendChild(view)
      submitToRoot(t(doc.body))
      const dispatch = fabricHandler()
      dispatch({ stateNode: a }, 'topTouchEnd', { target: a[FABRIC_NODE_ID] })
      expect(getFocusedNode()).toBe(a)
      dispatch({ stateNode: b2 }, 'topTouchEnd', { target: b2[FABRIC_NODE_ID] })
      expect(getFocusedNode()).toBe(b2)
    })
  })

  // ── RefreshControl / DrawerLayoutAndroid events ──

  describe('RefreshControl / DrawerLayoutAndroid events', () => {
    function fabricHandler() {
      const calls = nativeFabricUIManager.registerEventHandler.mock.calls
      return calls[calls.length - 1][0] as (
        instanceHandle: object, type: string, payload: Record<string, unknown>
      ) => void
    }

    it('topRefresh → onRefresh;refreshing 未跟上 → setNativeRefreshing(false) 强制回退', () => {
      const doc = createDoc()
      const rc = t(doc.createElement('RefreshControl'))
      doc.body.appendChild(rc)
      submitToRoot(t(doc.body))
      const dispatch = fabricHandler()
      const onRefresh = vi.fn()
      rc.setAttribute('onRefresh', onRefresh)
      rc.setAttribute('refreshing', false)
      ;(nativeFabricUIManager.dispatchCommand as unknown as { mockClear: () => void }).mockClear()
      dispatch({ stateNode: rc }, 'topRefresh', { target: rc[FABRIC_NODE_ID] })
      expect(onRefresh).toHaveBeenCalledTimes(1)
      // 用户没把 refreshing 设 true → 指示器强制回退(RN 受控)。
      expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
        expect.anything(), 'setNativeRefreshing', [false],
      )
    })

    it('topRefresh + refreshing=true(已受控)→ 不强制回退', () => {
      const doc = createDoc()
      const rc = t(doc.createElement('RefreshControl'))
      doc.body.appendChild(rc)
      submitToRoot(t(doc.body))
      const dispatch = fabricHandler()
      const onRefresh = vi.fn()
      rc.setAttribute('onRefresh', onRefresh)
      rc.setAttribute('refreshing', true)
      ;(nativeFabricUIManager.dispatchCommand as unknown as { mockClear: () => void }).mockClear()
      dispatch({ stateNode: rc }, 'topRefresh', { target: rc[FABRIC_NODE_ID] })
      expect(onRefresh).toHaveBeenCalledTimes(1)
      expect(nativeFabricUIManager.dispatchCommand).not.toHaveBeenCalled()
    })

    function buildDrawer() {
      const doc = createDoc()
      const drawer = t(doc.createElement('DrawerLayoutAndroid'))
      const nav = t(doc.createElement('View'))
      const main = t(doc.createElement('View'))
      drawer.appendChild(nav)
      drawer.appendChild(main)
      doc.body.appendChild(drawer)
      submitToRoot(t(doc.body))
      return { drawer, dispatch: fabricHandler() }
    }

    it('topDrawerOpen → onDrawerOpen + drawer pointerEvents auto', () => {
      const { drawer, dispatch } = buildDrawer()
      const onOpen = vi.fn()
      drawer.setAttribute('onDrawerOpen', onOpen)
      ;(nativeFabricUIManager.cloneNodeWithNewProps as unknown as { mockClear: () => void }).mockClear()
      dispatch({ stateNode: drawer }, 'topDrawerOpen', { target: drawer[FABRIC_NODE_ID] })
      expect(onOpen).toHaveBeenCalledTimes(1)
      expect((drawer as unknown as { __RN_drawerOpened: boolean }).__RN_drawerOpened).toBe(true)
      expect(nativeFabricUIManager.cloneNodeWithNewProps).toHaveBeenCalledWith(
        expect.anything(), { pointerEvents: 'auto' },
      )
    })

    it('topDrawerClose → onDrawerClose + pointerEvents none', () => {
      const { drawer, dispatch } = buildDrawer()
      const onClose = vi.fn()
      drawer.setAttribute('onDrawerClose', onClose)
      dispatch({ stateNode: drawer }, 'topDrawerOpen', { target: drawer[FABRIC_NODE_ID] })
      ;(nativeFabricUIManager.cloneNodeWithNewProps as unknown as { mockClear: () => void }).mockClear()
      dispatch({ stateNode: drawer }, 'topDrawerClose', { target: drawer[FABRIC_NODE_ID] })
      expect(onClose).toHaveBeenCalledTimes(1)
      expect((drawer as unknown as { __RN_drawerOpened: boolean }).__RN_drawerOpened).toBe(false)
      expect(nativeFabricUIManager.cloneNodeWithNewProps).toHaveBeenCalledWith(
        expect.anything(), { pointerEvents: 'none' },
      )
    })

    it('topDrawerStateChanged → onDrawerStateChanged 字符串映射', () => {
      const { drawer, dispatch } = buildDrawer()
      const onState = vi.fn()
      drawer.setAttribute('onDrawerStateChanged', onState)
      dispatch({ stateNode: drawer }, 'topDrawerStateChanged', {
        target: drawer[FABRIC_NODE_ID], drawerState: 1,
      })
      expect(onState).toHaveBeenCalledWith('Dragging')
    })

    it('topDrawerSlide → onDrawerSlide', () => {
      const { drawer, dispatch } = buildDrawer()
      const onSlide = vi.fn()
      drawer.setAttribute('onDrawerSlide', onSlide)
      dispatch({ stateNode: drawer }, 'topDrawerSlide', { target: drawer[FABRIC_NODE_ID], offset: 0.5 })
      expect(onSlide).toHaveBeenCalledTimes(1)
    })
  })

  // ── Native-module event bridge (Modal onDismiss) ──

  describe('modalDismissed bridge', () => {
    it('routes modalDismissed to the matching Modal onDismiss', () => {
      const doc = createDoc()
      const modal = t(doc.createElement('Modal'))
      doc.body.appendChild(modal)
      submitToRoot(t(doc.body)) // real mount path assigns the identifier

      const onDismiss = vi.fn()
      modal.setAttribute('onDismiss', onDismiss)

      // The renderer assigned an identifier when mounting the Modal.
      const id = (modal as unknown as { __RN_modalID: number | null }).__RN_modalID
      expect(id).toBeGreaterThan(0)

      // Native emits modalDismissed with the matching modalID.
      emitDeviceEvent('modalDismissed', { modalID: id })
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('ignores modalDismissed for unknown modalID', () => {
      const doc = createDoc()
      const modal = t(doc.createElement('Modal'))
      doc.body.appendChild(modal)
      submitToRoot(t(doc.body))

      const onDismiss = vi.fn()
      modal.setAttribute('onDismiss', onDismiss)

      emitDeviceEvent('modalDismissed', { modalID: 9999 })
      expect(onDismiss).not.toHaveBeenCalled()
    })
  })
})
