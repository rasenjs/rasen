// Perry AOT compile + run smoke test for Rasen.
//
// Strategy: use Rasen's own ReactiveRuntime interface, implement it with a
// pure-TS Signal (no third-party reactive library, no perry/ui State). Then
// exercise:
//   - reactive primitives: ref / setValue / unref from @rasenjs/core
//   - math: vec3f / addVec3 / normalize from @rasenjs/math
//
// Goal: prove Perry's LLVM pipeline can compile and run real Rasen-shaped
// code that consumes @rasenjs/core and @rasenjs/math.
//
// If `perry check` passes → static validation clean (Proxy constraints etc.).
// If `perry run` produces PASS below → runtime works end-to-end on macOS.

import { ref, setValue, unref, setReactiveRuntime, getReactiveRuntime, type ReactiveRuntime } from '@rasenjs/core'
import { vec3f, addVec3, normalize } from '@rasenjs/math'

// ---------------------------------------------------------------------------
// Minimal Signal-based ReactiveRuntime — same shape as our standalone test
// but adapted to Rasen's 6-method contract: subscribe/unref/isRef/
// effectScope/ref/setValue.
// ---------------------------------------------------------------------------

type Stop = () => void
type Sub<T> = (v: T) => void

class Signal<T> {
  private _v: T
  private subs: Sub<T>[] = []
  constructor(initial: T) { this._v = initial }
  get value(): T { return this._v }
  set value(next: T) {
    if (Object.is(next, this._v)) return
    this._v = next
    const snap = this.subs.slice()
    for (const s of snap) s(next)
  }
  sub(fn: Sub<T>): Stop {
    this.subs.push(fn)
    return () => { this.subs = this.subs.filter(s => s !== fn) }
  }
}

const runtime: ReactiveRuntime = {
  // ref → wrap a value in a Signal; return the signal as the Rasen callable ref.
  ref<T>(initial: T) {
    const sig = new Signal<T>(initial)
    const refObj = (() => sig.value) as { (): T; value: T }
    Object.defineProperty(refObj, 'value', {
      get() { return sig.value },
      set(v: T) { sig.value = v },
      enumerable: true,
    })
    // Stash the Signal for setValue/sub access.
    ;(refObj as any).__sig = sig
    return refObj as any
  },
  // unref → unwrap ref/callable ref/raw value to plain value.
  unref(value: any) {
    if (value && typeof value === 'function') {
      // Could be a ref or a getter; treat as ref (callable shape).
      const sig = (value as any).__sig as Signal<any> | undefined
      return sig ? sig.value : value()
    }
    if (value && typeof value === 'object' && 'value' in value && '__sig' in value) {
      return (value as any).__sig.value
    }
    return value
  },
  // isRef → anything with the stashed Signal.
  isRef(value: any) {
    return !!(value && typeof value === 'object' && '__sig' in value)
  },
  // setValue → write through to the Signal.
  setValue(target: any, value: any) {
    const sig = target?.__sig as Signal<any> | undefined
    if (sig) { sig.value = value; return }
    if (target && typeof target === 'object' && 'value' in target) {
      target.value = value
      return
    }
    throw new Error('setValue: target is not a ref')
  },
  // effectScope — for the smoke test we don't need real scope; run fn once.
  effectScope(fn: () => void) {
    fn()
    return () => {}
  },
  // subscribe → observe a ref's value changes.
  subscribe(target: any, fn: Sub<any>): Stop {
    const sig = target?.__sig as Signal<any> | undefined
    if (!sig) throw new Error('subscribe: target is not a ref')
    return sig.sub(fn)
  },
}

// ---------------------------------------------------------------------------
// Drive the experiment
// ---------------------------------------------------------------------------
console.log('=== Rasen + Perry AOT smoke test ===')

setReactiveRuntime(runtime)
const installed = getReactiveRuntime()
console.log('runtime installed:', installed === runtime, '(expect true)')

// --- Math exercise (no reactivity) ---------------------------------------
const a = vec3f(1, 2, 3)
const b = vec3f(10, 20, 30)
const c = addVec3(a, b)
console.log('addVec3 =', c.x, c.y, c.z, '(expect 11, 22, 33)')

const n = normalize(vec3f(3, 0, 4))
console.log('normalize(3,0,4) =', n.x, n.y, n.z.toFixed(4), '(expect 0.6, 0, 0.8)')

// --- Reactive exercise via Rasen's own API -------------------------------
const r = ref<number>(0)
const s = ref<string>('init')

let rFires = 0
let sFires = 0
const offR = runtime.subscribe(r, (v: number) => {
  rFires++
  console.log('[count subscriber] ->', v, '(fires:', rFires, ')')
})
const offS = runtime.subscribe(s, (v: string) => {
  sFires++
  console.log('[name subscriber]  ->', v, '(fires:', sFires, ')')
})

console.log('initial r =', unref(r), ', s =', unref(s))

// Drive through Rasen's setValue (re-uses our runtime's setValue path).
runtime.setValue(r, 1)
runtime.setValue(r, 2)
runtime.setValue(r, 2)  // dedup
runtime.setValue(r, 3)
runtime.setValue(s, 'a')
runtime.setValue(s, 'a')  // dedup
runtime.setValue(s, 'b')

offR()
runtime.setValue(r, 99)  // post-unsubscribe → no fire

console.log('=== final ===')
console.log('r final =', unref(r), '(expect 99)')
console.log('s final =', unref(s), '(expect b)')
console.log('rFires  =', rFires, '(expect 3)')
console.log('sFires  =', sFires, '(expect 2)')

const pass =
  c.x === 11 && c.y === 22 && c.z === 33 &&
  Math.abs(n.x - 0.6) < 1e-6 && Math.abs(n.z - 0.8) < 1e-6 &&
  unref(r) === 99 &&
  unref(s) === 'b' &&
  rFires === 3 &&
  sFires === 2

if (pass) {
  console.log('PASS: Perry AOT compiled+ran Rasen core + math + reactive')
} else {
  console.log('FAIL: see expected values above')
}
