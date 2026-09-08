/**
 * Side-by-side pixel comparison: OFFICIAL spine-ts 4.1 runtime vs the Rasen
 * runtime, rendering the same skeleton + animation with the same camera fit
 * and synchronized animation clocks. Used to validate Rasen's binary/atlas
 * parsing and rendering against the vendor ground truth.
 *
 * URL params: ?char=c103&pose=cover&anim=cover_idle&t=0.5
 * window.__snap() → [officialDataURL, rasenDataURL] for pixel diffing.
 */
import { com } from '@rasenjs/core'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-vue'
import { shallowRef } from '@vue/reactivity'
import { canvas, mount } from '@rasenjs/dom'
import {
  parseSpineBinary,
  parseSpineAtlas,
  Skeleton,
  AnimationState,
  type SkeletonData,
  type SpineAtlas
} from '@rasenjs/assets'
import { spine as SpineWebgl } from '@rasenjs/webgl'
import {
  SceneRenderer,
  ManagedWebGLRenderingContext
} from '@esotericsoftware/spine-webgl'
import {
  TextureAtlas,
  AtlasAttachmentLoader,
  SkeletonBinary,
  Skeleton as OfficialSkeleton,
  AnimationState as OfficialAnimationState,
  AnimationStateData as OfficialAnimationStateData
} from '@esotericsoftware/spine-core'

useReactiveRuntime()

const VIEW = 1024
const q = new URLSearchParams(location.search)
const CHAR = q.get('char') ?? 'c103'
const POSE = q.get('pose') ?? 'cover'
const ANIM = q.get('anim') ?? 'cover_idle'
// Optional spine position offset (Rasen side only) — verifies the x/y/z props.
const OX = Number(q.get('ox') ?? 0)
const OY = Number(q.get('oy') ?? 0)
const OZ = Number(q.get('oz') ?? 0)
// FB pose lives at the character root with the `<char>_00` file stem; cover /
// aim poses live in subdirectories with `<char>_<pose>_00`.
const FILE_BASE = POSE === 'fb' ? `${CHAR}_00` : `${CHAR}_${POSE}_00`
const BASE = POSE === 'fb'
  ? `https://raw.githubusercontent.com/Nikke-db/Nikke-db.github.io/main/l2d/${CHAR}/`
  : `https://raw.githubusercontent.com/Nikke-db/Nikke-db.github.io/main/l2d/${CHAR}/${POSE}/`

// ---------- shared asset loading ----------
interface Loaded {
  skelBuf: Uint8Array
  atlasText: string
  img: HTMLImageElement
  pageNames: string[]
  pageImgs: Map<string, HTMLImageElement>
}

async function loadAssets(): Promise<Loaded> {
  const [skelResp, atlasResp] = await Promise.all([
    fetch(`${BASE}${FILE_BASE}.skel`),
    fetch(`${BASE}${FILE_BASE}.atlas`)
  ])
  if (!skelResp.ok || !atlasResp.ok) throw new Error('asset fetch failed')
  const skelBuf = new Uint8Array(await skelResp.arrayBuffer())
  const atlasText = await atlasResp.text()
  const pageNames = atlasText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && /\.(png|webp|jpe?g)$/i.test(l))
  const pageImgs = new Map<string, HTMLImageElement>()
  for (const pngName of pageNames) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`image load failed: ${pngName}`))
      img.src = `${BASE}${pngName}`
    })
    pageImgs.set(pngName, img)
  }
  const img = pageImgs.values().next().value as HTMLImageElement
  return { skelBuf, atlasText, img, pageNames, pageImgs }
}

// ---------- official side ----------
import { GLTexture } from '@esotericsoftware/spine-webgl'

// ---------- rasen side ----------
const skeleton = shallowRef<Skeleton | null>(null)
const atlasRef = shallowRef<SpineAtlas | null>(null)
const atlasImg = shallowRef<HTMLImageElement | null>(null)
const atlasImgs = shallowRef<Map<string, HTMLImageElement> | null>(null)
const state = shallowRef<AnimationState | null>(null)
const frame = ref(0)
const camera = ref({ x: 0, y: 0, zoom: 1 })

const RasenStage = com(() => (
  <canvas
    width={VIEW}
    height={VIEW}
    contextType="webgl"
    contextOptions={{ alpha: true, preserveDrawingBuffer: true }}
    renderOptions={{ clearColor: 'rgba(0,0,0,0)', continuousRender: true }}
    camera={camera}
  >
    <SpineWebgl
      skeleton={skeleton as never}
      atlas={atlasRef as never}
      atlasImg={atlasImg as never}
      atlasImgs={atlasImgs as never}
      state={state as never}
      animation={ref(ANIM) as never}
      frame={frame}
      width={VIEW}
      height={VIEW}
      x={ref(OX) as never}
      y={ref(OY) as never}
      z={ref(OZ) as never}
      skipTonemap={true}
    />
  </canvas>
))

// ---------- boot ----------
const loaded = await loadAssets()

// Shared camera fit from OUR parsed skeleton data bounds (same numbers the
// official runtime reports for the same file).
const parsedData: SkeletonData = parseSpineBinary(loaded.skelBuf)
const fit = {
  zoom: Math.min(VIEW / parsedData.width, VIEW / parsedData.height) * 0.92,
  cx: (parsedData.x ?? 0) + parsedData.width / 2,
  cy: (parsedData.y ?? 0) + parsedData.height / 2
}

// Official setup (declared above to keep the official block self-contained)
const officialCanvas = document.getElementById('official') as HTMLCanvasElement
const officialCtx = new ManagedWebGLRenderingContext(officialCanvas, {
  alpha: true,
  preserveDrawingBuffer: true,
  premultipliedAlpha: true
})
const officialAtlas = new TextureAtlas(loaded.atlasText)
for (const page of officialAtlas.pages) {
  page.setTexture(new GLTexture(officialCtx, loaded.pageImgs.get(page.name) ?? loaded.img))
}
const officialData = new SkeletonBinary(new AtlasAttachmentLoader(officialAtlas)).readSkeletonData(loaded.skelBuf)
const officialSk = new OfficialSkeleton(officialData)
const officialSt = new OfficialAnimationState(new OfficialAnimationStateData(officialData))
officialSt.setAnimation(0, ANIM, true)
const officialRenderer = new SceneRenderer(officialCanvas, officialCtx)
officialRenderer.camera.position.set(fit.cx, fit.cy, 0)
officialRenderer.camera.zoom = 1 / fit.zoom
officialRenderer.camera.viewportWidth = VIEW
officialRenderer.camera.viewportHeight = VIEW
officialRenderer.camera.update()

// Rasen setup
skeleton.value = new Skeleton(parsedData)
atlasRef.value = parseSpineAtlas(loaded.atlasText)
atlasImg.value = loaded.img
atlasImgs.value = loaded.pageImgs
state.value = new AnimationState(skeleton.value)
camera.value = { x: fit.cx, y: fit.cy, zoom: fit.zoom }

const host = document.getElementById('rasen-host')!
const rasenEl = document.createElement('div')
rasenEl.style.width = VIEW + 'px'
rasenEl.style.height = VIEW + 'px'
host.appendChild(rasenEl)
mount(RasenStage(), rasenEl)

// Synchronized clocks: one rAF drives both runtimes with the same delta.
let last = performance.now()
const tick = (): void => {
  const now = performance.now()
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  officialSt.update(dt)
  officialSt.apply(officialSk)
  officialSk.updateWorldTransform()
  const gl = officialCtx.gl
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  officialRenderer.begin()
  officialRenderer.drawSkeleton(officialSk, true)
  officialRenderer.end()

  state.value!.update(dt)
  state.value!.apply()
  skeleton.value!.updateWorldTransform()
  frame.value++
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

// Pause support + snapshot hook for pixel diffing.
;(window as unknown as Record<string, unknown>).__paused = false
;(window as unknown as Record<string, unknown>).__snap = (): string[] => [
  officialCanvas.toDataURL('image/png'),
  (rasenEl.querySelector('canvas') as HTMLCanvasElement).toDataURL('image/png')
]
