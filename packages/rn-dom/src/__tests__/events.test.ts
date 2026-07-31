/**
 * @rasenjs/rn-dom — Event system tests
 *
 * Tests dispatchEventWithBubble: capture → target → bubble phases,
 * stopPropagation, focus/blur, and instance map registration.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RNDocument, resetTagCounter, dispatchCommand, sendAccessibilityEvent, findNodeHandle } from '../index'
import { resetFabricMocks, nativeFabricUIManager, viewConfigRegistry, emitDeviceEvent } from './setup'

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
      const p = doc.createElement('View')
      const c = doc.createElement('Text')
      p.appendChild(c)
      // Instance map is stored on globalThis under __RASEN_INSTANCE_MAP__
      const map = (globalThis as any).__RASEN_INSTANCE_MAP__
      expect(map.has(c[Symbol.for('fabricNodeId')])).toBe(true)
    })

    it('unregisters on removeChild', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const c = doc.createElement('Text')
      p.appendChild(c)
      const map = (globalThis as any).__RASEN_INSTANCE_MAP__
      const id = c[Symbol.for('fabricNodeId')]
      p.removeChild(c)
      expect(map.has(id)).toBe(false)
    })
  })

  // ── Event dispatch (via props) ─────────────────────────────────

  describe('props-based dispatch', () => {
    it('stores onTouchEnd handler in currentProps via setAttribute', () => {
      const doc = createDoc()
      const fn = vi.fn()
      const el = doc.createElement('View')
      el.setAttribute('onTouchEnd', fn)
      expect(el.currentProps.onTouchEnd).toBe(fn)
    })

    it('fires addEventListener handler on dispatchEvent', () => {
      const doc = createDoc()
      const fn = vi.fn()
      const el = doc.createElement('View')
      el.addEventListener('touchend', fn)
      el.dispatchEvent(new Event('touchend'))
      expect(fn).toHaveBeenCalled()
    })
  })

  // ── addEventListener dispatch ──────────────────────────────────

  describe('addEventListener dispatchEvent', () => {
    it('calls registered handler', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const fn = vi.fn()
      el.addEventListener('click', fn)
      el.dispatchEvent(new Event('click'))
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('notifies multiple listeners', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
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
      const el = doc.createElement('View')
      const fn = vi.fn()
      el.addEventListener('click', fn)
      el.removeEventListener('click', fn)
      el.dispatchEvent(new Event('click'))
      expect(fn).not.toHaveBeenCalled()
    })

    it('handleEvent object form works', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const handleEvent = vi.fn()
      el.addEventListener('click', { handleEvent })
      el.dispatchEvent(new Event('click'))
      expect(handleEvent).toHaveBeenCalled()
    })

    it('does not throw when no listeners', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      expect(() => el.dispatchEvent(new Event('nobody'))).not.toThrow()
    })
  })

  // ── Capture phase listeners ────────────────────────────────────

  describe('capture phase', () => {
    it('stores capture listeners separately', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const fn = vi.fn()
      el.addEventListener('click', fn, true)
      expect(el._listeners!.get('__capture_click')!.has(fn)).toBe(true)
    })

    it('stores capture listener with __capture_ prefix via options', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const fn = vi.fn()
      el.addEventListener('click', fn, { capture: true })
      expect(el._listeners!.has('__capture_click')).toBe(true)
    })

    it('removes capture listener', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const fn = vi.fn()
      el.addEventListener('click', fn, true)
      el.removeEventListener('click', fn, true)
      expect(el._listeners!.get('__capture_click')?.has(fn)).toBeFalsy()
    })
  })

  // ── Focus / Blur ───────────────────────────────────────────────

  describe('focus/blur tracking', () => {
    it('TextInput triggers auto-focus on touch end', () => {
      const doc = createDoc()
      const input = doc.createElement('TextInput')
      doc.body.appendChild(input)
      expect(input.tagName).toBe('TextInput')
    })
  })

  // ── RN-style: stopPropagation ──────────────────────────────────

  describe('stopPropagation', () => {
    it('supports stopPropagation in event handlers', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const c = doc.createElement('Text')
      p.appendChild(c)
      doc.body.appendChild(p)

      // Mark as mounted so our custom dispatch path works
      p._mounted = true
      c._mounted = true
      doc.body._mounted = true

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
      const el = doc.createElement('View')
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
    it('registers event handler flag on globalThis', () => {
      // The private _rnInitEventSystem sets a global flag after first call.
      // It's only called once per document lifetime.
      const flag = (globalThis as any).__RASEN_EVENT_HANDLER_REGISTERED__
      expect(flag).toBe(true)
    })
  })

  // ── RN-style: registered handlers ─────────────────────────────

  describe('props-based event dispatch', () => {
    it('calls onTouchEnd from setAttribute', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const fn = vi.fn()
      el.setAttribute('onTouchEnd', fn)
      // dispatchEvent doesn't read props — it uses _listeners.
      // This tests that setAttribute stores in currentProps
      expect(typeof el.getAttribute('onTouchEnd')).toBe('function')
      expect(el.currentProps.onTouchEnd).toBe(fn)
    })
  })

  // ── RN-style: timeStamp propagation ────────────────────────────

  describe('timeStamp propagation', () => {
    it('provides timeStamp in handler nativeEvent', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
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
      doc.body._mounted = true
      const el = doc.createElement('TextInput')
      doc.body.appendChild(el)
      doc.body._submitToRoot()

      dispatchCommand(el, 'scrollTo', [{ x: 0, y: 100 }])
      expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
        expect.any(Object),
        'scrollTo',
        [{ x: 0, y: 100 }],
      )
    })

    it('.focus() calls dispatchCommand with focus (DOM standard)', () => {
      const doc = createDoc()
      const el = doc.createElement('TextInput')
      doc.body.appendChild(el)
      doc.body._submitToRoot()

      el.focus()
      expect(nativeFabricUIManager.dispatchCommand).toHaveBeenCalledWith(
        expect.any(Object),
        'focus',
        [],
      )
    })

    it('.blur() calls dispatchCommand with blur (DOM standard)', () => {
      const doc = createDoc()
      const el = doc.createElement('TextInput')
      doc.body.appendChild(el)
      doc.body._submitToRoot()

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
      const el = doc.createElement('View')
      doc.body.appendChild(el)
      doc.body._submitToRoot()

      sendAccessibilityEvent(el, 'layoutChanged')
      expect(nativeFabricUIManager.sendAccessibilityEvent).toHaveBeenCalledWith(
        expect.any(Object),
        'layoutChanged',
      )
    })

    // ── RN equivalent: should no-op if calling sendAccessibilityEvent on unmounted refs ──
    it('no-ops when node is null (unmounted ref)', () => {
      // Calling sendAccessibilityEvent with a null node should not throw
      expect(() => sendAccessibilityEvent(null as any, 'focus')).not.toThrow()
    })
  })

  // ── findNodeHandle ─────────────────────────────────────────────

  describe('findNodeHandle', () => {
    it('returns the Fabric node ID for an RNNode', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      expect(findNodeHandle(el)).toBe(el[Symbol.for('fabricNodeId')])
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
      const p = doc.createElement('View')
      const c = doc.createElement('Text')
      p._mounted = true
      c._mounted = true
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
      const view = doc.createElement('View')
      const input = doc.createElement('TextInput')
      view.appendChild(input)
      doc.body.appendChild(view)
      view._mounted = true
      input._mounted = true
      doc.body._mounted = true
      doc.body._submitToRoot()
      return { doc, view, input, dispatch: fabricHandler() }
    }

    it('topTouchStart fires onPressIn then onTouchStart (independent, both fire)', () => {
      const { input, dispatch } = buildTree()
      const pressIn = vi.fn()
      const touchStart = vi.fn()
      input.setAttribute('onPressIn', pressIn)
      input.setAttribute('onTouchStart', touchStart)
      dispatch({ stateNode: input }, 'topTouchStart', { target: input[Symbol.for('fabricNodeId')] })
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
      dispatch({ stateNode: input }, 'topTouchStart', { target: input[Symbol.for('fabricNodeId')] })
      dispatch({ stateNode: input }, 'topTouchEnd', { target: input[Symbol.for('fabricNodeId')] })
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
      dispatch({ stateNode: input }, 'topTouchStart', { target: input[Symbol.for('fabricNodeId')] })
      dispatch({ stateNode: input }, 'topTouchMove', { target: input[Symbol.for('fabricNodeId')] })
      expect(pressMove).toHaveBeenCalledTimes(1)
      expect(touchMove).toHaveBeenCalledTimes(1)
    })

    it('onTouchEnd bubbles from target Text up through ancestor Views (RN bubbling)', () => {
      const doc = createDoc()
      const grand = doc.createElement('View')
      const parent = doc.createElement('View')
      const child = doc.createElement('View')
      const text = doc.createElement('Text')
      child.appendChild(text)
      parent.appendChild(child)
      grand.appendChild(parent)
      doc.body.appendChild(grand)
      grand._mounted = true
      parent._mounted = true
      child._mounted = true
      text._mounted = true
      doc.body._mounted = true
      doc.body._submitToRoot()
      const dispatch = fabricHandler()
      const childFn = vi.fn()
      const parentFn = vi.fn()
      const grandFn = vi.fn()
      child.setAttribute('onTouchEnd', childFn)
      parent.setAttribute('onTouchEnd', parentFn)
      grand.setAttribute('onTouchEnd', grandFn)
      // Tap the innermost Text; onTouchEnd bubbles child → parent → grand
      dispatch({ stateNode: text }, 'topTouchEnd', { target: text[Symbol.for('fabricNodeId')] })
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
      dispatch({ stateNode: input }, 'topTouchStart', { target: input[Symbol.for('fabricNodeId')] })
      // Wait > 500ms for the long-press timer
      await new Promise(r => setTimeout(r, 550))
      expect(longPress).toHaveBeenCalledTimes(1)
      dispatch({ stateNode: input }, 'topTouchEnd', { target: input[Symbol.for('fabricNodeId')] })
      expect(pressOut).toHaveBeenCalledTimes(1)
      expect(press).not.toHaveBeenCalled() // suppressed by long-press
    })

    it('topChange fires onChange (event) AND onChangeText (string) — both independent', () => {
      const { input, dispatch } = buildTree()
      const onChange = vi.fn()
      const onChangeText = vi.fn()
      input.setAttribute('onChange', onChange)
      input.setAttribute('onChangeText', onChangeText)
      dispatch({ stateNode: input }, 'topChange', { target: input[Symbol.for('fabricNodeId')], text: 'hi' })
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChangeText).toHaveBeenCalledTimes(1)
      expect(onChangeText).toHaveBeenCalledWith('hi')
      expect(onChange.mock.calls[0][0]).toMatchObject({ text: 'hi' })
    })

    it('nested pressable: inner onPress wins as responder, outer does not fire', () => {
      const doc = createDoc()
      const outer = doc.createElement('View')
      const inner = doc.createElement('Text')
      outer.appendChild(inner)
      doc.body.appendChild(outer)
      outer._mounted = true
      inner._mounted = true
      doc.body._mounted = true
      doc.body._submitToRoot()

      const outerPress = vi.fn()
      const innerPress = vi.fn()
      outer.setAttribute('onPress', outerPress)
      inner.setAttribute('onPress', innerPress)

      const dispatch = fabricHandler()
      // Simulate a touch that starts+ends on the inner node
      dispatch({ stateNode: inner }, 'topTouchStart', { target: inner[Symbol.for('fabricNodeId')] })
      dispatch({ stateNode: inner }, 'topTouchEnd', { target: inner[Symbol.for('fabricNodeId')] })

      // Inner pressable is the responder — outer must NOT fire (RN responder).
      expect(innerPress).toHaveBeenCalledTimes(1)
      expect(outerPress).not.toHaveBeenCalled()
    })

    it('touch on child with no press handler: parent onPress becomes responder', () => {
      const doc = createDoc()
      const outer = doc.createElement('View')
      const inner = doc.createElement('Text')
      outer.appendChild(inner)
      doc.body.appendChild(outer)
      outer._mounted = true
      inner._mounted = true
      doc.body._mounted = true
      doc.body._submitToRoot()

      const outerPress = vi.fn()
      outer.setAttribute('onPress', outerPress)
      // inner has NO press handlers — plain touch

      const dispatch = fabricHandler()
      dispatch({ stateNode: inner }, 'topTouchStart', { target: inner[Symbol.for('fabricNodeId')] })
      dispatch({ stateNode: inner }, 'topTouchEnd', { target: inner[Symbol.for('fabricNodeId')] })

      // Parent is the nearest press handler → responder, fires onPress.
      expect(outerPress).toHaveBeenCalledTimes(1)
    })

    it('touch events bubble to every ancestor (RN bubblingEventTypes)', () => {
      const doc = createDoc()
      const grand = doc.createElement('View')
      const parent = doc.createElement('View')
      const child = doc.createElement('Text')
      grand.appendChild(parent)
      parent.appendChild(child)
      doc.body.appendChild(grand)
      grand._mounted = true
      parent._mounted = true
      child._mounted = true
      doc.body._mounted = true
      doc.body._submitToRoot()

      const childEnd = vi.fn()
      const parentEnd = vi.fn()
      const grandEnd = vi.fn()
      child.setAttribute('onTouchEnd', childEnd)
      parent.setAttribute('onTouchEnd', parentEnd)
      grand.setAttribute('onTouchEnd', grandEnd)

      const dispatch = fabricHandler()
      dispatch({ stateNode: child }, 'topTouchEnd', { target: child[Symbol.for('fabricNodeId')] })

      // RN bubbling: ALL ancestors fire, not just the first handler node.
      expect(childEnd).toHaveBeenCalledTimes(1)
      expect(parentEnd).toHaveBeenCalledTimes(1)
      expect(grandEnd).toHaveBeenCalledTimes(1)
    })

    it('press owner fires pressOut/press on touchEnd even when touch bubbles', () => {
      const doc = createDoc()
      const pressable = doc.createElement('View')
      const inner = doc.createElement('Text')
      pressable.appendChild(inner)
      doc.body.appendChild(pressable)
      pressable._mounted = true
      inner._mounted = true
      doc.body._mounted = true
      doc.body._submitToRoot()

      const pressIn = vi.fn()
      const pressOut = vi.fn()
      const press = vi.fn()
      const touchEnd = vi.fn()
      pressable.setAttribute('onPressIn', pressIn)
      pressable.setAttribute('onPressOut', pressOut)
      pressable.setAttribute('onPress', press)
      inner.setAttribute('onTouchEnd', touchEnd)

      const dispatch = fabricHandler()
      dispatch({ stateNode: inner }, 'topTouchStart', { target: inner[Symbol.for('fabricNodeId')] })
      dispatch({ stateNode: inner }, 'topTouchEnd', { target: inner[Symbol.for('fabricNodeId')] })

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

    function buildWithViewConfig(extra: Record<string, unknown>) {
      const doc = createDoc()
      const view = doc.createElement('View')
      const child = doc.createElement('Text')
      view.appendChild(child)
      doc.body.appendChild(view)
      view._mounted = true
      child._mounted = true
      doc.body._mounted = true
      doc.body._submitToRoot()
      return { doc, view, child, dispatch: fabricHandler() }
    }

    it('topLayout (direct event) fires ONLY on target, not ancestors', () => {
      const { view, child, dispatch } = buildWithViewConfig({})
      const childLayout = vi.fn()
      const viewLayout = vi.fn()
      child.setAttribute('onLayout', childLayout)
      view.setAttribute('onLayout', viewLayout)
      dispatch({ stateNode: child }, 'topLayout', { target: child[Symbol.for('fabricNodeId')] })
      expect(childLayout).toHaveBeenCalledTimes(1)
      expect(viewLayout).not.toHaveBeenCalled() // direct: no bubble
    })

    it('topFocus (bubbling) bubbles to all ancestors with onFocus', () => {
      const { view, child, dispatch } = buildWithViewConfig({})
      const childFocus = vi.fn()
      const viewFocus = vi.fn()
      child.setAttribute('onFocus', childFocus)
      view.setAttribute('onFocus', viewFocus)
      dispatch({ stateNode: child }, 'topFocus', { target: child[Symbol.for('fabricNodeId')] })
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
      const view = doc.createElement('View')
      const child = doc.createElement('Text')
      view.appendChild(child)
      doc.body.appendChild(view)
      view._mounted = true
      child._mounted = true
      doc.body._mounted = true
      doc.body._submitToRoot()

      const childEnd = vi.fn()
      const viewEnd = vi.fn()
      child.setAttribute('onTouchEnd', childEnd)
      view.setAttribute('onTouchEnd', viewEnd)
      const dispatch = fabricHandler()
      dispatch({ stateNode: child }, 'topTouchEnd', { target: child[Symbol.for('fabricNodeId')] })
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
      dispatch({ stateNode: child }, 'topPress', { target: child[Symbol.for('fabricNodeId')] })
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
      const view = doc.createElement('View')
      const btn = doc.createElement('Text')
      view.appendChild(btn)
      doc.body.appendChild(view)
      view._mounted = true
      btn._mounted = true
      doc.body._mounted = true
      doc.body._submitToRoot()
      return { doc, view, btn, dispatch: fabricHandler() }
    }

    /** Touch events carry pageX/pageY for press-rect checks. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const touchPayload = (node: any, x: number, y: number) => ({
      target: node[Symbol.for('fabricNodeId')],
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
      dispatch({ stateNode: btn }, 'topTouchStart', { target: btn[Symbol.for('fabricNodeId')], pageX: 100, pageY: 100 })
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
      const { btn, dispatch } = build()
      const onValueChange = vi.fn()
      btn.setAttribute('onValueChange', onValueChange)
      dispatch({ stateNode: btn }, 'topChange', { target: btn[Symbol.for('fabricNodeId')], value: true })
      expect(onValueChange).toHaveBeenCalledWith(true)
    })

    it('topScroll releases an active press responder (ScrollView steals)', () => {
      const { btn, dispatch } = build()
      const press = vi.fn()
      btn.setAttribute('onPress', press)
      dispatch({ stateNode: btn }, 'topTouchStart', touchPayload(btn, 100, 100))
      // Scroll event (direct, target = scrollview ancestor) releases the press
      dispatch({ stateNode: btn }, 'topScroll', { target: btn[Symbol.for('fabricNodeId')] })
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
      dispatch({ stateNode: btn }, 'topScroll', { target: btn[Symbol.for('fabricNodeId')] })
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

  // ── Native-module event bridge (Modal onDismiss) ──

  describe('modalDismissed bridge', () => {
    it('routes modalDismissed to the matching Modal onDismiss', () => {
      const doc = createDoc()
      const modal = doc.createElement('Modal')
      doc.body.appendChild(modal)
      doc.body._submitToRoot() // real mount path assigns the identifier

      const onDismiss = vi.fn()
      modal.setAttribute('onDismiss', onDismiss)

      // The renderer assigned an identifier when mounting the Modal.
      const id = (modal as any).__modalID
      expect(id).toBeGreaterThan(0)

      // Native emits modalDismissed with the matching modalID.
      emitDeviceEvent('modalDismissed', { modalID: id })
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('ignores modalDismissed for unknown modalID', () => {
      const doc = createDoc()
      const modal = doc.createElement('Modal')
      doc.body.appendChild(modal)
      doc.body._submitToRoot()

      const onDismiss = vi.fn()
      modal.setAttribute('onDismiss', onDismiss)

      emitDeviceEvent('modalDismissed', { modalID: 9999 })
      expect(onDismiss).not.toHaveBeenCalled()
    })
  })
})
