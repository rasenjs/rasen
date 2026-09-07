/**
 * Official spine-ts 4.1 (npm ESM) Canvas2D entry — the vendor's own best
 * practice: SkeletonRenderer.draw(skeleton) per frame with a ctx transform
 * mapping world units to the canvas (as in the official spine-canvas examples).
 *
 * Ground-truth baseline for the Canvas2D group.
 */

import {
  AssetManager as CanvasAssetManager,
  SkeletonRenderer
} from '@esotericsoftware/spine-canvas'
import {
  TextureAtlas,
  AtlasAttachmentLoader,
  SkeletonBinary,
  Skeleton,
  AnimationState,
  AnimationStateData
} from '@esotericsoftware/spine-core'
import type { Spine } from '@esotericsoftware/spine-core'

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
  ASSET_SKEL,
  CANVAS_H,
  CANVAS_W,
  FIXED_DELTA,
  fitCamera,
  gridPos,
  type CameraFit
} from '../shared/spec'

interface Instance {
  sk: Spine
  st: AnimationState
}

let renderer: SkeletonRenderer | null = null
let ctx: CanvasRenderingContext2D | null = null
const instances: Instance[] = []
let animName = ''
let fit: CameraFit = { zoom: 1, cx: 0, cy: 0 }
let assetManager: CanvasAssetManager | null = null
let skeletonData: ReturnType<SkeletonBinary['readSkeletonData']> | null = null

function updateCameraFor(n: number): void {
  const sd = instances[0]?.sk.data
  if (!sd || !sd.width) {
    fit = { zoom: 1, cx: 0, cy: 0 }
  } else {
    fit = fitCamera({ x: sd.x, y: sd.y, width: sd.width, height: sd.height }, n)
  }
}

function makeInstance(): Instance {
  const sk = new Skeleton(skeletonData!)
  const st = new AnimationState(new AnimationStateData(skeletonData!))
  st.setAnimation(0, animName, true)
  st.update(0)
  st.apply(sk)
  sk.updateWorldTransform()
  return { sk, st }
}

async function loadAssets(): Promise<void> {
  // pathPrefix must be EMPTY: ASSET_* paths already start with '/'. A '/'
  // prefix would produce '//c310_00.skel' — a protocol-relative URL.
  assetManager = new CanvasAssetManager('')
  assetManager.loadBinary(ASSET_SKEL)
  assetManager.loadTextureAtlas(ASSET_ATLAS)
  await new Promise<void>((resolve, reject) => {
    const wait = () => {
      if (assetManager!.isLoadingComplete()) {
        if (assetManager!.hasErrors()) reject(new Error(JSON.stringify(assetManager!.getErrors())))
        else resolve()
      } else setTimeout(wait, 50)
    }
    wait()
  })
}

function drawFrame(): void {
  updateCameraFor(instances.length)
  const n = instances.length
  const sd = instances[0]?.sk.data
  const w = (sd?.width ?? 1) * 1.1
  const h = (sd?.height ?? 1) * 1.1
  // World → screen: x' = zoom*(x-cx) + W/2 ; y' = H/2 - zoom*(y-cy)
  ctx!.setTransform(DPR, 0, 0, DPR, 0, 0)
  ctx!.clearRect(0, 0, CANVAS_W, CANVAS_H)
  ctx!.save()
  ctx!.translate(CANVAS_W / 2, CANVAS_H / 2)
  ctx!.scale(fit.zoom, -fit.zoom)
  ctx!.translate(-fit.cx, -fit.cy)
  instances.forEach((inst, i) => {
    const g = gridPos(i, n)
    ctx!.save()
    ctx!.translate(g.x * w, g.y * h)
    renderer!.draw(inst.sk)
    ctx!.restore()
  })
  ctx!.restore()
}

function tickInstances(delta: number): void {
  for (const inst of instances) {
    inst.st.update(delta)
    inst.st.apply(inst.sk)
    inst.sk.updateWorldTransform()
  }
}

// --- Page setup --------------------------------------------------------------
const host = installStage()
// Match the rasen target: back the canvas with devicePixelRatio physical
// pixels so HiDPI screens never upscale the logical 1024 canvas (pixelation).
const DPR = Math.min(window.devicePixelRatio || 1, 2)
const canvasEl = document.createElement('canvas')
canvasEl.width = CANVAS_W * DPR
canvasEl.height = CANVAS_H * DPR
canvasEl.style.width = CANVAS_W + 'px'
canvasEl.style.height = CANVAS_H + 'px'
host.appendChild(canvasEl)
ctx = canvasEl.getContext('2d')!
// c310 is an all-mesh rig: the default drawImages path only paints
  // RegionAttachments and would render nothing. triangleRendering=true is the
  // official renderer's mesh path (SkeletonRenderer.drawTriangles).
  renderer = new SkeletonRenderer(ctx)
  renderer.triangleRendering = true

const bench: BenchAPI = {
  async load() {
    return timed(async () => {
      await loadAssets()
      // require(ATLAS) returns a fully-parsed TextureAtlas with textures bound.
      const atlas = assetManager!.require(ASSET_ATLAS) as TextureAtlas
      skeletonData = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(
        assetManager!.require(ASSET_SKEL)
      )
      animName = pickAnimation(skeletonData.animations.map((a: any) => a.name))
      instances.push(makeInstance())
      updateCameraFor(1)
      drawFrame()
      await nextPaint()
    })
  },
  async createInstances(n) {
    return timed(async () => {
      while (instances.length < n) instances.push(makeInstance())
      updateCameraFor(instances.length)
      drawFrame()
      await nextPaint()
    })
  },
  async poseOnly(ticks) {
    const t0 = performance.now()
    for (let i = 0; i < ticks; i++) tickInstances(FIXED_DELTA)
    return (performance.now() - t0) / ticks
  },
  async animate(durationMs, n) {
    if (instances.length < n) await bench.createInstances(n)
    return measureAnimation(durationMs, n, (delta) => {
      tickInstances(delta)
      drawFrame()
    })
  },
  async debugStep(steps) {
    for (let i = 0; i < steps; i++) tickInstances(FIXED_DELTA)
    drawFrame()
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
export {}
