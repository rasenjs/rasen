/**
 * Rasen WebGL entry — @rasenjs/dom canvas + @rasenjs/canvas-2d spine component.
 *
 * Idiomatic usage exactly as in examples/nikke-viewer: refs drive the spine
 * component; each animation tick bumps `frame` which rebuilds the mesh.
 * Multi-instance mounting uses `each()` over a reactive instance list (the
 * idiomatic Rasen list pattern — a static empty children array at mount time
 * would crash the canvas component).
 */

import { each, com } from '@rasenjs/core'
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
import { spine as SpineCanvas } from '@rasenjs/canvas-2d'
import {
  installStage,
  timed,
  measureAnimation,
  nextPaint,
  pickAnimation,
  type BenchAPI
} from './bench-api'
import {
  ASSET_ATLAS,
  ASSET_PNG,
  ASSET_SKEL,
  CANVAS_H,
  CANVAS_W,
  FIXED_DELTA,
  fitCamera,
  gridPos,
  type CameraFit
} from '../shared/spec'

useReactiveRuntime()

const VIEW = CANVAS_W

interface Instance {
  sk: Skeleton
  st: AnimationState
}

const skeletonData = shallowRef<SkeletonData | null>(null)
const atlas = shallowRef<SpineAtlas | null>(null)
const atlasImg = shallowRef<HTMLImageElement | null>(null)
const frame = ref(0)
// Canvas-2d spine owns its transform (no renderer camera): the shared fit is
// solved into scale/x/y so the instance-grid bbox centers on the canvas.
const scale = ref(1)
const posX = ref(0)
const posY = ref(0)

// Reactive instance list — drives `each()` below.
const instances = shallowRef<Instance[]>([])
const animName = ref('')

let fit: CameraFit = { zoom: 1, cx: 0, cy: 0 }

function updateCameraFor(n: number): void {
  const d = skeletonData.value
  if (!d || !d.width) {
    fit = { zoom: 1, cx: 0, cy: 0 }
  } else {
    fit = fitCamera({ x: d.x ?? 0, y: d.y ?? 0, width: d.width, height: d.height }, n)
  }
  scale.value = fit.zoom
  posX.value = CANVAS_W / 2 - fit.zoom * fit.cx
  posY.value = CANVAS_H / 2 + fit.zoom * fit.cy
}

async function loadAssets(): Promise<void> {
  const [skelResp, atlasResp, img] = await Promise.all([
    fetch(ASSET_SKEL),
    fetch(ASSET_ATLAS),
    new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error(`image load failed: ${ASSET_PNG}`))
      i.src = ASSET_PNG
    })
  ])
  const skelBuf = new Uint8Array(await skelResp.arrayBuffer())
  const atlasText = await atlasResp.text()

  atlas.value = parseSpineAtlas(atlasText)
  skeletonData.value = parseSpineBinary(skelBuf)
  atlasImg.value = img
}

function makeInstance(): Instance {
  const sk = new Skeleton(skeletonData.value!)
  const st = new AnimationState(sk)
  st.setAnimation(animName.value, true)
  st.update(0)
  st.apply()
  sk.updateWorldTransform()
  return { sk, st }
}

/** Apply the shared grid layout to skeleton-level x/y (world units). */
function layoutInstances(): void {
  const n = instances.value.length
  const w = (skeletonData.value?.width ?? 1) * 1.1
  const h = (skeletonData.value?.height ?? 1) * 1.1
  instances.value.forEach((inst, i) => {
    const g = gridPos(i, n)
    inst.sk.x = g.x * w
    inst.sk.y = g.y * h
  })
}

/** Advance every instance's animation clock by a fixed delta. */
function tickInstances(delta: number): void {
  for (const inst of instances.value) {
    inst.st.update(delta)
    inst.st.apply()
    inst.sk.updateWorldTransform()
  }
  frame.value++
}

const Stage = com(() => (
  <canvas
    width={CANVAS_W}
    height={CANVAS_H}
  >
    {each(instances, (inst: Instance) => (
      <SpineCanvas
        skeleton={shallowRef(inst.sk) as never}
        atlas={atlas}
        atlasImg={atlasImg}
        state={shallowRef(inst.st) as never}
        animation={animName}
        frame={frame}
        width={VIEW}
        height={VIEW}
        x={posX}
        y={posY}
        scale={scale}
        width={VIEW}
        height={VIEW}
        skipTonemap={true}
      />
    ))}
  </canvas>
))

const App = com(() => (
  <div style={{ width: CANVAS_W + 'px', height: CANVAS_H + 'px' }}>
    <Stage />
  </div>
))

const stage = installStage()
mount(App(), stage)

const bench: BenchAPI = {
  async load() {
    return timed(async () => {
      await loadAssets()
      const names = new AnimationState(new Skeleton(skeletonData.value!)).animationNames
      animName.value = pickAnimation(names)
      updateCameraFor(1)
      instances.value = [makeInstance()]
      await nextPaint()
    })
  },
  async createInstances(n) {
    return timed(async () => {
      while (instances.value.length < n) instances.value.push(makeInstance())
      updateCameraFor(instances.value.length)
      layoutInstances()
      instances.value = [...instances.value]
      await nextPaint()
    })
  },
  async poseOnly(ticks) {
    const t0 = performance.now()
    for (let i = 0; i < ticks; i++) {
      for (const inst of instances.value) {
        inst.st.update(FIXED_DELTA)
        inst.st.apply()
        inst.sk.updateWorldTransform()
      }
    }
    return (performance.now() - t0) / ticks
  },
  async animate(durationMs, n) {
    if (instances.value.length < n) await bench.createInstances(n)
    return measureAnimation(durationMs, n, tickInstances)
  },
  async debugStep(steps) {
    for (let i = 0; i < steps; i++) tickInstances(FIXED_DELTA)
    await nextPaint()
  }
}

window.__bench = bench

// AUTOPLAY: load + animate on page open so the page is never blank when
// inspected manually. Skipped in bench mode (?bench=1) — the harness drives
// load()/animate() itself, and a second driver advancing the same animation
// clocks causes visible frame jumps (looks like ghosting).
if (!location.search.includes('bench=1')) {
  setTimeout(() => {
    window.__bench.load().then(() => {
      window.__bench.animate(365 * 24 * 3600 * 1000, 1).catch(() => {})
    }).catch((e) => console.error('autoplay load failed:', e))
  }, 50)
}
