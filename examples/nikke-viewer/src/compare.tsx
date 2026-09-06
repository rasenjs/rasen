/**
 * Comparison harness — renders 777 with @rasenjs/webgl + @rasenjs/assets at the
 * SAME canvas size / camera / pose as the official spine-webgl reference, so the
 * two can be pixel-compared.
 *
 * - 2048x2048 canvas (matches official)
 * - bounds-centered ortho fit, factor 0.95 (matches official)
 * - idle pose frozen at t=0 (matches official)
 * - transparent background (official keeps its opaque bg; comparison only looks
 *   at character pixels where BOTH renders are opaque)
 */

import { com, type Mountable } from '@rasenjs/core'
import { mount } from '@rasenjs/dom'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  parseSpineBinary,
  parseSpineAtlas,
  Skeleton,
  AnimationState,
  type SkeletonData,
  type SpineAtlas
} from '@rasenjs/assets'
import { spine as SpineWebgl } from '@rasenjs/webgl'

const VIEW = 2048

useReactiveRuntime()

const skeleton = ref<Skeleton | null>(null)
const atlas = ref<SpineAtlas | null>(null)
const atlasImg = ref<HTMLImageElement | null>(null)
const state = ref<AnimationState | null>(null)
const frame = ref(0)

async function load777(): Promise<void> {
  const [skelResp, atlasResp] = await Promise.all([
    fetch('/777.skel'),
    fetch('/777.atlas')
  ])
  if (!skelResp.ok || !atlasResp.ok) throw new Error('asset fetch failed')
  const skelBuf = new Uint8Array(await skelResp.arrayBuffer())
  const atlasText = await atlasResp.text()
  const parsedAtlas = parseSpineAtlas(atlasText)
  const data: SkeletonData = parseSpineBinary(skelBuf)

  const pngName =
    atlasText
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0 && /\.(png|webp|jpe?g)$/i.test(l)) ?? '777.png'
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('image load failed'))
    img.src = '/' + pngName
  })

  const sk = new Skeleton(data)
  const st = new AnimationState(sk)
  const names = st.animationNames
  st.setAnimation(names[0] ?? 'idle', true)
  st.update(0) // start the track (mirrors official update(0))
  st.apply() // idle at t=0
  sk.updateWorldTransform()
  skeleton.value = sk
  atlas.value = parsedAtlas
  atlasImg.value = img
  state.value = st
  ;(window as unknown as Record<string, unknown>).__myBounds = {
    x: sk.data.x,
    y: sk.data.y,
    width: sk.data.width,
    height: sk.data.height
  }
  frame.value++
}

const Stage = com(() => (
  <canvas
    className="block"
    width={VIEW}
    height={VIEW}
    contextType="webgl"
    contextOptions={{ alpha: true, preserveDrawingBuffer: true }}
    renderOptions={{ clearColor: 'rgba(0,0,0,0)', continuousRender: true }}
  >
    <SpineWebgl
      skeleton={skeleton}
      atlas={atlas}
      atlasImg={atlasImg}
      state={state}
      showBones={ref(false)}
      frame={frame}
      width={VIEW}
      height={VIEW}
      skipTonemap={true}
    />
  </canvas>
))

const App = com(() => (
  <div style={{ width: VIEW + 'px', height: VIEW + 'px', background: '#0b1020' }}>
    <Stage />
  </div>
))

export const app = (): Mountable<HTMLElement> => App()

const container = document.getElementById('app')
if (container) mount(app(), container)

load777()
  .then(() => {
    setTimeout(() => {
      const cv = container?.querySelector('canvas') as HTMLCanvasElement | null
      if (!cv) {
        ;(window as unknown as Record<string, unknown>).__mineDone = true
        ;(window as unknown as Record<string, unknown>).__mineErr = 'no canvas'
        return
      }
      const gl = cv.getContext('webgl') as WebGLRenderingContext
      const w = cv.width
      const h = cv.height
      const px = new Uint8Array(w * h * 4)
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
      // Compact base64 transfer (raw RGBA, bottom-up — same as official readPixels).
      let bin = ''
      const chunk = 0x8000
      for (let i = 0; i < px.length; i += chunk) {
        bin += String.fromCharCode.apply(null, px.subarray(i, i + chunk) as unknown as number[])
      }
      ;(window as unknown as Record<string, unknown>).__mineB64 = btoa(bin)
      ;(window as unknown as Record<string, unknown>).__mineDone = true
    }, 1200)
  })
  .catch((e: unknown) => {
    ;(window as unknown as Record<string, unknown>).__mineDone = true
    ;(window as unknown as Record<string, unknown>).__mineErr = String(e)
  })
