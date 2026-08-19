/**
 * Standalone test — verifies the WebGL `each` component renders dynamic
 * billboards (the mechanism behind FPS hit impacts).
 */

import { configureTags, com } from '@rasenjs/core'
import { mount } from '@rasenjs/dom'
import { ref } from '@rasenjs/reactive-signals'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { FirstPersonCamera, billboard, each, getRenderContext } from '@rasenjs/webgl'

useReactiveRuntime()
configureTags({ '': { firstPersonCamera: FirstPersonCamera, billboard, each } })

const log = document.getElementById('log')!
const items = ref<Array<{ x: number; y: number; z: number; tex: HTMLCanvasElement }>>([])

// Debug counters
const dbg = { eachDraw: 0, billboardDraw: 0, eachRegistered: false, billboardRegistered: 0 }
;(window as unknown as { __dbg: typeof dbg }).__dbg = dbg

// Build a simple colored texture (red square with white center)
function makeTex(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 64; c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 64, 64)
  ctx.fillStyle = '#fff'
  ctx.fillRect(16, 16, 32, 32)
  return c
}

const App = com((_p: unknown) => {
  const eye = ref({ x: 0, y: 1.6, z: 0 })
  const yaw = ref(0)
  const pitch = ref(0)
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <canvas width={800} height={600} contextType="webgl2"
        contextOptions={{ clearColor: '#87CEEB', preserveDrawingBuffer: true }}
        style={{ width: '100%', height: '100%', display: 'block' }}>
        <firstPersonCamera position={eye} yaw={yaw} pitch={pitch} fov={(80 * Math.PI) / 180} near={0.1} far={200} />
        {each(() => items.value, (it) => {
          dbg.billboardDraw++
          return (
            <billboard x={it.x} y={it.y} z={it.z} width={0.5} height={0.5} texture={it.tex} mode="full" />
          )
        })}
      </canvas>
    </div>
  )
})

mount(App({}), document.getElementById('app')!)

// Add 3 billboards at known positions in front of the camera
const tex = makeTex('#ff0000')
items.value = [
  { x: 0, y: 1.6, z: -3, tex },
  { x: 1, y: 1.6, z: -4, tex },
  { x: -1, y: 1.6, z: -5, tex },
]
log.textContent = 'added 3 items: ' + items.value.length

// Expose render context for debugging
const canvasEl = document.querySelector('canvas')!
const gl = canvasEl.getContext('webgl2')!
const rc = getRenderContext(gl)
;(window as unknown as { __rc: unknown }).__rc = rc
;(window as unknown as { __dbg: typeof dbg }).__dbg = dbg

// Expose for testing
;(window as unknown as { __eachTest: unknown }).__eachTest = {
  items,
  add: () => {
    items.value = [...items.value, { x: Math.random() * 2 - 1, y: 1.6, z: -3 - Math.random() * 3, tex }]
    log.textContent = 'items: ' + items.value.length
  },
  remove: () => {
    items.value = items.value.slice(0, -1)
    log.textContent = 'items: ' + items.value.length
  },
}