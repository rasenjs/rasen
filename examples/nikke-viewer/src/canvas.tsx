/**
 * Canvas-mode viewer — renders 777 with @rasenjs/canvas-2d + @rasenjs/assets so
 * the Canvas2D renderer (examples/nikke-viewer/src/spine.ts) can be inspected
 * for the dark/bright seam issue independently of the WebGL renderer.
 *
 * Uses the same 777 assets as the WebGL compare harness (/777.skel, /777.atlas,
 * /777.png) and paints a dark backdrop (bg) so semi-transparent edges composite
 * against a stage that matches the WebGL viewer instead of the page background.
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
import { spine as Spine } from '@rasenjs/canvas-2d'

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
  st.update(0)
  st.apply()
  sk.updateWorldTransform()
  skeleton.value = sk
  atlas.value = parsedAtlas
  atlasImg.value = img
  state.value = st
  frame.value++
}

const Stage = com(() => (
  <canvas
    className="block"
    width={VIEW}
    height={VIEW}
    contextType="2d"
    camera={{ x: 0, y: 0, zoom: 1 }}
  >
    <Spine
      skeleton={skeleton}
      atlas={atlas}
      atlasImg={atlasImg}
      state={state}
      showBones={ref(false)}
      frame={frame}
      width={VIEW}
      height={VIEW}
      bg={'#0a0a0a'}
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
    ;(window as unknown as Record<string, unknown>).__mineDone = true
  })
  .catch((e: unknown) => {
    ;(window as unknown as Record<string, unknown>).__mineDone = true
    ;(window as unknown as Record<string, unknown>).__mineErr = String(e)
  })
