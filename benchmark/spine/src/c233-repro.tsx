/**
 * c233 (Dorothy) regression page — single instance of the NIKKE c233
 * skeleton, driven headlessly by verify-c233.mjs.
 *
 * c233 is the multi-page-atlas + heavy-blend-mode character that exposed the
 * batch fast-lane flushMerged off-by-one (every merged sealed run silently
 * dropped its LAST attachment; single-item runs misread items[f-1] and could
 * abort the whole flush). c310 (single texture, one run) could not catch it.
 *
 * The page replicates the bench protocol (deterministic fixed-delta stepping
 * via window.__bench) against the SAME gfx/assets builds the other targets
 * use, so pixel regressions here fail the visual gate.
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
import { spine as SpineWebgl } from '@rasenjs/gfx'
import { installStage, timed, measureAnimation, nextPaint, type BenchAPI } from './bench-api'
import { CANVAS_H, CANVAS_W, FIXED_DELTA } from '../shared/spec'

useReactiveRuntime()

const ASSET = '/c233/c233_00'
const VIEW = 1600

interface Instance {
  sk: Skeleton
  st: AnimationState
}

const skeletonData = shallowRef<SkeletonData | null>(null)
const atlas = shallowRef<SpineAtlas | null>(null)
const atlasImg = shallowRef<HTMLImageElement | null>(null)
const atlasImgs = shallowRef<Map<string, HTMLImageElement> | null>(null)
const frame = ref(0)
const camera = ref({ x: 0, y: 0, zoom: 1 })
const instances = shallowRef<Instance[]>([])
const animName = ref('')

function fitCamera(): void {
  const d = skeletonData.value
  const w = d?.width ?? 1600
  const h = d?.height ?? 1600
  const base = Math.min(CANVAS_W / w, CANVAS_H / h) * 0.92
  camera.value = { x: (d?.x ?? 0) + w / 2, y: (d?.y ?? 0) + h / 2, zoom: base }
}

function makeInstance(): Instance {
  const sk = new Skeleton(skeletonData.value!)
  // Combined skins (official addSkin) — NIKKE characters store accessory
  // parts in extra skins.
  sk.extraSkins = skeletonData.value!.skins
    .filter((s) => s.name !== 'default')
    .map((s) => s.name)
  const st = new AnimationState(sk as never)
  st.setAnimation(animName.value, true)
  return { sk, st }
}

function tickInstances(delta: number): void {
  for (const inst of instances.value) {
    inst.st.update(delta)
    inst.st.apply()
  }
  frame.value++
}

const Stage = com(() => (
  <canvas
    width={CANVAS_W}
    height={CANVAS_H}
    contextType="webgl"
    contextOptions={{ alpha: true, preserveDrawingBuffer: true }}
    renderOptions={{ clearColor: 'rgba(0,0,0,0)', continuousRender: false }}
    camera={camera}
  >
    {each(instances, (inst: Instance) => (
      <SpineWebgl
        skeleton={shallowRef(inst.sk) as never}
        atlas={atlas}
        atlasImg={atlasImg}
        atlasImgs={atlasImgs}
        state={shallowRef(inst.st) as never}
        animation={animName}
        frame={frame}
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

async function loadAssets(): Promise<void> {
  const [skelResp, atlasResp] = await Promise.all([
    fetch(`${ASSET}.skel`),
    fetch(`${ASSET}.atlas`)
  ])
  if (!skelResp.ok || !atlasResp.ok) throw new Error('asset fetch failed')
  const skelBuf = new Uint8Array(await skelResp.arrayBuffer())
  const atlasText = await atlasResp.text()
  skeletonData.value = parseSpineBinary(skelBuf)
  atlas.value = parseSpineAtlas(atlasText)

  // Every atlas page image (multi-page: effects live on c233_00_2.png).
  const pageNames = atlasText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && /\.(png|webp|jpe?g)$/i.test(l))
  const imgs = new Map<string, HTMLImageElement>()
  for (const pngName of pageNames) {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`image load failed: ${pngName}`))
      img.src = ASSET.replace(/[\w_\-]+$/, '') + pngName
    })
    imgs.set(pngName, img)
  }
  atlasImgs.value = imgs
  atlasImg.value = imgs.values().next().value as HTMLImageElement
}

const bench: BenchAPI = {
  async load() {
    return timed(async () => {
      await loadAssets()
      const st0 = new AnimationState(new Skeleton(skeletonData.value!) as never)
      animName.value = st0.animationNames[0] ?? ''
      fitCamera()
      instances.value = [makeInstance()]
      await nextPaint()
    })
  },
  async createInstances(n: number) {
    return timed(async () => {
      while (instances.value.length < n) instances.value.push(makeInstance())
      instances.value = [...instances.value]
      await nextPaint()
    })
  },
  async poseOnly(ticks: number) {
    const t0 = performance.now()
    for (let i = 0; i < ticks; i++) {
      for (const inst of instances.value) {
        inst.st.update(FIXED_DELTA)
        inst.st.apply()
      }
    }
    return (performance.now() - t0) / ticks
  },
  async animate(durationMs: number, n: number) {
    if (instances.value.length < n) await bench.createInstances(n)
    return measureAnimation(durationMs, n, tickInstances)
  },
  async debugStep(steps: number) {
    for (let i = 0; i < steps; i++) tickInstances(FIXED_DELTA)
    await nextPaint()
  }
}

window.__bench = bench
