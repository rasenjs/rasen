/**
 * pixi-spine 4.0.6 + pixi.js v7 entry — the community standard for WebGL
 * spine rendering. Idiomatic usage: Pixi Application + Spine display objects
 * created from a runtime-4.1 SkeletonBinary; atlas pages bind pixi Textures.
 *
 * Multi-instance placement uses container position (screen-space), matching
 * the grid layout of the other entries.
 */

import { Application, Texture, Container } from 'pixi.js'
import { Spine } from 'pixi-spine'
import { TextureAtlas } from '@pixi-spine/base'
import {
  AtlasAttachmentLoader,
  SkeletonBinary
} from '@pixi-spine/runtime-4.1'
import type { SkeletonData } from '@pixi-spine/runtime-4.1'

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

let app: Application | null = null
const instances: Spine[] = []
let animName = ''
let fit: CameraFit = { zoom: 1, cx: 0, cy: 0 }
let spineData: SkeletonData | null = null
let stage: Container | null = null

function updateCameraFor(n: number): void {
  const sd = (spineData as any)
  if (!sd || !sd.width) {
    fit = { zoom: 1, cx: 0, cy: 0 }
  } else {
    fit = fitCamera({ x: sd.x, y: sd.y, width: sd.width, height: sd.height }, n)
  }
}

function layoutInstances(): void {
  const n = instances.length
  const sd = (spineData as any)
  const w = (sd?.width ?? 1) * 1.1
  const h = (sd?.height ?? 1) * 1.1
  instances.forEach((sp, i) => {
    const g = gridPos(i, n)
    // World→screen: x' = zoom*(x-cx)+W/2 ; y' = H/2 - zoom*(y-cy)
    // Pixi transform: screen = (world - pivot) * scale + position.
    // pixi-spine bakes the y-flip into its bone matrices — its world vertices
    // live in y-DOWN space, mirrored vs the official runtime (content center
    // sits at y = -cy). So the vertical mapping uses +cyPixi instead of -cy.
    const cyPixi = -fit.cy
    sp.position.set(
      CANVAS_W / 2 + g.x * w * fit.zoom - fit.cx * fit.zoom,
      CANVAS_H / 2 - g.y * h * fit.zoom - cyPixi * fit.zoom
    )
    sp.scale.set(fit.zoom, fit.zoom)
  })
}

/** Advance the pixi-spine animation state (its own runtime). */
function tickInstances(delta: number): void {
  for (const sp of instances) {
    sp.state.update(delta)
    sp.state.apply(sp.skeleton)
    sp.skeleton.updateWorldTransform()
  }
}

const bench: BenchAPI = {
  async load() {
    return timed(async () => {
      app = new Application({ width: CANVAS_W, height: CANVAS_H, backgroundAlpha: 0, autoStart: false })
      stage = app.stage
      const host = installStage()
      host.appendChild(app.view as HTMLCanvasElement)

      // Fetch + parse (pixi-spine's own parsers — part of its real load path).
      const [skelResp, atlasResp] = await Promise.all([
        fetch(ASSET_SKEL),
        fetch(ASSET_ATLAS)
      ])
      const skelBuf = new Uint8Array(await skelResp.arrayBuffer())
      const atlasText = await atlasResp.text()

      // The atlas parser resolves regions ASYNCHRONOUSLY (page textures decode
      // in parallel) — the skeleton MUST be parsed only after the atlas
      // reports completion via its third-argument callback, or regions are
      // missing and attachment loading throws.
      const atlas = await new Promise<TextureAtlas>((resolve, reject) => {
        new TextureAtlas(
          atlasText,
          (pageName, cb) => {
            const img = new Image()
            img.onload = () => cb(Texture.from(img))
            img.onerror = () => cb(null as any)
            img.src = ASSET_PNG.replace(/[^/]*$/, pageName)
          },
          (result) => {
            if (result) resolve(result)
            else reject(new Error('atlas texture load failed'))
          }
        )
      })
      const loader = new AtlasAttachmentLoader(atlas)
      spineData = new SkeletonBinary(loader).readSkeletonData(skelBuf)

      const sp = new Spine(spineData)
      animName = pickAnimation(spineData.animations.map((a: any) => a.name))
      sp.state.setAnimation(0, animName, true)
      sp.state.update(0)
      sp.state.apply(sp.skeleton)
      sp.skeleton.updateWorldTransform()
      instances.push(sp)
      stage.addChild(sp)
      updateCameraFor(1)
      layoutInstances()
      ;(window as any).__pixiSpine = instances[0]
      ;(window as any).__pixiStage = stage
      app.render()
      await nextPaint()
    })
  },
  async createInstances(n) {
    return timed(async () => {
      while (instances.length < n) {
        const sp = new Spine(spineData!)
        sp.state.setAnimation(0, animName, true)
        sp.state.update(0)
        sp.state.apply(sp.skeleton)
        sp.skeleton.updateWorldTransform()
        instances.push(sp)
        stage!.addChild(sp)
      }
      updateCameraFor(instances.length)
      layoutInstances()
      app!.render()
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
      layoutInstances()
      app!.render()
    })
  },
  async debugStep(steps) {
    for (let i = 0; i < steps; i++) tickInstances(FIXED_DELTA)
    layoutInstances()
    app!.render()
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
