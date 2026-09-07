/**
 * Official spine-ts 4.1 (npm ESM) WebGL entry — the vendor's own best practice:
 * a single SceneRenderer drawing Skeleton objects inside begin()/end(), exactly
 * as in the official spine-webgl examples. Multi-instance placement uses the
 * SceneRenderer transform argument (translate per draw call).
 *
 * This is the ground-truth baseline for the WebGL group.
 */

import {
  SceneRenderer,
  ManagedWebGLRenderingContext,
  AssetManager
} from '@esotericsoftware/spine-webgl'
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

let renderer: SceneRenderer | null = null
let gl: WebGLRenderingContext | null = null
const instances: Instance[] = []
let animName = ''
let fit: CameraFit = { zoom: 1, cx: 0, cy: 0 }
let assetManager: AssetManager | null = null
let skeletonData: ReturnType<SkeletonBinary['readSkeletonData']> | null = null

function updateCameraFor(n: number): void {
  const sd = instances[0]?.sk.data
  if (!sd || !sd.width) {
    fit = { zoom: 1, cx: 0, cy: 0 }
  } else {
    fit = fitCamera({ x: sd.x, y: sd.y, width: sd.width, height: sd.height }, n)
  }
  if (renderer) {
    // OrthoCamera: zoom scales the viewport, position sets the center.
    const cam = renderer.camera
    cam.position.set(fit.cx, fit.cy, 0)
    cam.zoom = 1 / fit.zoom
    cam.viewportWidth = CANVAS_W
    cam.viewportHeight = CANVAS_H
    cam.update()
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
  // prefix would produce '//c310_00.skel' — a protocol-relative URL that
  // resolves to a bogus host and never loads.
  assetManager = new AssetManager(renderer!.context as ManagedWebGLRenderingContext, '')
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

/** Per-instance draw transform: VertexTransformer that offsets each vertex. */
function instanceTransformers(): Array<((verts: any, count: number, stride: number) => void) | null> {
  const n = instances.length
  const sd = instances[0]?.sk.data
  const w = (sd?.width ?? 1) * 1.1
  const h = (sd?.height ?? 1) * 1.1
  return instances.map((_, i) => {
    const g = gridPos(i, n)
    const dx = g.x * w
    const dy = g.y * h
    if (dx === 0 && dy === 0) return null
    // Vertices are interleaved [x, y, u, v, ...] per `stride` floats — only
    // the x/y positions are offset.
    return (verts: any, count: number, stride: number) => {
      for (let j = 0; j < count; j += stride) {
        verts[j] += dx
        verts[j + 1] += dy
      }
    }
  })
}

function tickInstances(delta: number): void {
  for (const inst of instances) {
    inst.st.update(delta)
    inst.st.apply(inst.sk)
    inst.sk.updateWorldTransform()
  }
}

function drawFrame(): void {
  updateCameraFor(instances.length)
  // SceneRenderer does NOT clear the drawing buffer — the official examples
  // always gl.clear() before begin(). Without this (plus
  // preserveDrawingBuffer:true) every previous frame stays on the canvas →
  // visible motion ghosting.
  gl!.clearColor(0, 0, 0, 0)
  gl!.clear(gl!.COLOR_BUFFER_BIT)
  const transformers = instanceTransformers()
  renderer!.begin()
  instances.forEach((inst, i) => {
    renderer!.drawSkeleton(inst.sk, true, -1, -1, transformers[i])
  })
  renderer!.end()
}

// --- Page setup --------------------------------------------------------------
const host = installStage()
const canvasEl = document.createElement('canvas')
// Match the rasen target: back the canvas with devicePixelRatio physical
// pixels so the browser never upscales the 1024-logical canvas on HiDPI
// screens (upscale = visible pixelation). The logical viewport stays
// CANVAS_W/H — camera math is unchanged.
const DPR = Math.min(window.devicePixelRatio || 1, 2)
canvasEl.width = CANVAS_W * DPR
canvasEl.height = CANVAS_H * DPR
canvasEl.style.width = CANVAS_W + 'px'
canvasEl.style.height = CANVAS_H + 'px'
host.appendChild(canvasEl)
const context = new ManagedWebGLRenderingContext(canvasEl, { alpha: true, preserveDrawingBuffer: true })
gl = context.gl
renderer = new SceneRenderer(canvasEl, context)

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
      ;(window as any).__skelProbeOfficial = instances[0]
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
