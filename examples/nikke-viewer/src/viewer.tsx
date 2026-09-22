/**
 * NIKKE Character Viewer — standalone example built with @rasenjs/dom + unocss,
 * rendered through the @rasenjs/canvas-2d Spine component.
 *
 * References the interaction/functionality of nikkeviewer.com:
 *   - Left sidebar with category tabs (Characters / Scenes / Chibi / Story),
 *     classified the same way the reference site does (by model id):
 *       characters → /^c\d+(_\d+)?$/, chibi → /^smol_/, story → /^story/,
 *       everything else → scenes.
 *   - Characters are grouped into two levels: level 1 is the character
 *     (base id, e.g. c810 "2B"), level 2 lists that character's costume
 *     variants (c810_01 "Metamorphic Damage", …) with sprite thumbnails.
 *   - Selecting a variant loads its skeleton; the right panel exposes the
 *     three Nikke pose skeletons — FB (full-body idle), Cover and Aim
 *     (the two crouch poses), loaded from `<id>/cover/…` / `<id>/aim/…`.
 *
 * Assets stream live from the public Nikke-db GitHub repository; display
 * names come from Nikke-db's l2d.json (CORS-friendly GitHub Pages).
 *
 * Written in JSX (jsxImportSource: @rasenjs/dom). Reactive state uses Vue refs
 * directly (ref.value = ...), per Rasen's "bring your own reactivity" model.
 */

import { com, each, type Mountable } from '@rasenjs/core'
import { text, when } from '@rasenjs/dom'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-vue'
import { watch } from '@vue/reactivity'
import { template, createRouter, createBrowserHistory } from '@rasenjs/router-dom'
import { z } from 'zod'
import {
  parseSpineBinary,
  parseSpineAtlas,
  Skeleton,
  AnimationState,
  getAnimationDuration,
  type SkeletonData,
  type SpineAtlas
} from '@rasenjs/assets'
import { spine as SpineWebgl, getWebGPURenderer, type GpuCanvasContext } from '@rasenjs/gfx'
import { spine as SpineCanvas } from '@rasenjs/canvas-2d'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIEW = 1024 // logical canvas size
const GITHUB_API =
  'https://api.github.com/repos/Nikke-db/Nikke-db.github.io/contents/l2d?ref=main'
const RAW_BASE = 'https://raw.githubusercontent.com/Nikke-db/Nikke-db.github.io/main/l2d'
const SPRITE_BASE = 'https://nikke-db.github.io/images/sprite'
const L2D_NAMES_URL = 'https://nikke-db.github.io/js/json/l2d.json'
const FALLBACK_CHARS = ['777', 'absolute', 'acpufreeze', 'alonesurvivor', 'arcanearchive']

const BG_PRESETS: Array<{ name: string; color: string }> = [
  { name: 'Dark', color: '#0b1020' },
  { name: 'Black', color: '#000000' },
  { name: 'White', color: '#f5f5f5' },
  { name: 'Navy', color: '#0f1e3d' },
  { name: 'Green', color: '#0c2a1e' }
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'characters' | 'scenes' | 'chibi' | 'story'
type PoseKind = 'fb' | 'cover' | 'aim'
type L2dEntry = { id: string; name: string }

type Row =
  | { kind: 'group'; id: string; name: string; thumb: string; variants: L2dEntry[] }
  | { kind: 'entry'; id: string; name: string; thumb: string; entry: L2dEntry }

const TAB_LABELS: Array<{ tab: Tab; label: string }> = [
  { tab: 'characters', label: 'Characters' },
  { tab: 'scenes', label: 'Scenes' },
  { tab: 'chibi', label: 'Chibi' },
  { tab: 'story', label: 'Story' }
]

// ---------------------------------------------------------------------------
// Reactive state (Vue refs — set via .value, per Rasen conventions)
// ---------------------------------------------------------------------------

// The reactive runtime must be set before any ref() is created. viewer.tsx is
// imported (and its module-level refs instantiated) before main.tsx's body
// runs, so we bootstrap it here rather than in the entry.
useReactiveRuntime()

const entries = ref<L2dEntry[]>([])
const activeTab = ref<Tab>('characters')
const search = ref('')
const rows = ref<Row[]>([])
const expandedId = ref<string | null>(null)
const selectedChar = ref('')
const currentName = ref('')
const currentPose = ref<PoseKind>('fb')
const poseAvailability = ref<{ cover: boolean; aim: boolean }>({ cover: false, aim: false })
const currentAnim = ref('')
const status = ref('Loading character list…')
const loaded = ref(false)

/**
 * True while the pixel fit is still re-framing the model.
 *
 * The fit can only measure PIXELS, so it cannot run before something has been
 * drawn — which means it used to correct the framing up to three times while the
 * character was already on screen. Measured on c405: the deterministic bone fit
 * is ~2x too large (w 2916 vs the true 1437), the first round halves it, and the
 * three rounds together move 13.7% of the pixels. The character was therefore
 * shown mis-framed and then re-framed under the viewer's nose, up to 5x the
 * per-frame motion of the animation itself.
 *
 * Treating the fit as part of loading removes that: the model is revealed once
 * framing has settled, so the corrections happen behind the loading overlay. The
 * canvas must keep RENDERING while this is true (the fit measures it) — the
 * overlay only covers it, it must not be hidden with display:none.
 */
const framing = ref(false)

/**
 * Frames still to wait before lifting the overlay.
 *
 * A camera change is applied during a tick but only reaches the canvas on the
 * NEXT painted frame. Clearing `framing` in the same tick as the last fit round
 * therefore still exposes that round: the overlay came down one frame before the
 * pixels it was hiding changed. Verified with the frame probe — the reveal was
 * reported at frame 34 while the last re-framing landed in frame 35's pixels.
 *
 * So the reveal is deferred by one frame, which is exactly enough to keep the
 * final correction covered.
 */
let revealAfter = 0
/**
 * Frames the overlay may stay up, ever.
 *
 * The tick's fit branch is guarded by `atlasImg || atlasImgs` with `&&` short
 * circuiting, so if the atlas never arrives `framesSinceFitRequest` never
 * increments and the fit never reports itself finished — which would leave the
 * overlay up forever behind an empty status line. That is a worse failure than
 * the one being fixed, so the reveal has its own deadline that does not depend on
 * anything the fit does.
 */
let framingFrames = 0
const FRAMING_MAX_FRAMES = 240

const bg = ref('#0b1020')
const panX = ref(0)
const panY = ref(0)
const zoom = ref(1)
const showBones = ref(false)
const renderMode = ref<'webgl' | 'webgpu' | 'canvas'>('canvas')

// WebGPU device (requested lazily on first switch to the webgpu renderer;
// the canvas bridge mounts synchronously, so the device must exist by then).
const webgpuDevice = ref<GPUDevice | null>(null)
async function ensureWebgpuDevice(): Promise<boolean> {
  if (webgpuDevice.value) return true
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu
  if (!gpu) return false
  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return false
    webgpuDevice.value = await adapter.requestDevice()
    return true
  } catch {
    return false
  }
}
const showTechInfo = ref(false)

// ---------------------------------------------------------------------------
// UI settings persistence (localStorage) — background / renderer / show bones.
// These are view preferences, deliberately kept out of the URL (selection
// state lives in the router instead).
// ---------------------------------------------------------------------------

const SETTINGS_KEY = 'nikke-viewer:settings'

type StoredSettings = { bg?: string; renderMode?: 'webgl' | 'canvas'; showBones?: boolean }

function loadStoredSettings(): StoredSettings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as StoredSettings
  } catch {
    return {}
  }
}

const stored = loadStoredSettings()
if (stored.bg) bg.value = stored.bg
if (stored.renderMode) renderMode.value = stored.renderMode
if (stored.showBones !== undefined) showBones.value = stored.showBones

watch([bg, renderMode, showBones], () => {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ bg: bg.value, renderMode: renderMode.value, showBones: showBones.value })
    )
  } catch {
    /* persistence is best-effort (private mode / quota) */
  }
})

// Renderer mode switch: the canvas remounts and a pending async WebGPU pixel
// fit (if any) belongs to the OLD mode's frame — invalidate it so it cannot
// clobber the new mode's camera with stale content bounds.
watch(renderMode, () => {
  fitGeneration++
})

// A restored webgpu renderMode mounts the webgpu canvas immediately — but the
// device request is async and the canvas bridge mount is sync. Request the
// device up front and gate the canvas on its presence (see the webgpu branch
// in the stage JSX); the canvas simply renders once the device resolves.
if (renderMode.value === 'webgpu') {
  void ensureWebgpuDevice().then((ok) => {
    if (!ok) {
      renderMode.value = 'webgl'
      status.value = 'WebGPU is not available in this browser — switched to WebGL'
    }
  })
}

// ---------------------------------------------------------------------------
// Router — character / pose / animation selection is URL-driven so any view
// can be shared or reloaded (SPA fallback rewrite configured on Vercel).
// ---------------------------------------------------------------------------

const router = createRouter(
  {
    home: { path: '/' },
    char: template`/char/${{ id: z.string() }}`,
    charPose: template`/char/${{ id: z.string() }}/pose/${{
      pose: z.enum(['fb', 'cover', 'aim'])
    }}`,
    charPoseAnim: template`/char/${{ id: z.string() }}/pose/${{
      pose: z.enum(['fb', 'cover', 'aim'])
    }}/anim/${{ anim: z.string() }}`
  },
  { history: createBrowserHistory() }
)

type SelectionRoute = typeof router.routes.char

/** Encode a path param (anim names may contain spaces etc.). */
function encParam(value: string): string {
  return encodeURIComponent(value)
}

/** Decode a matched param; returns raw value if malformed. */
function decParam(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Read char/pose/anim from a route match (missing segments fall back). */
function readSelection(match: { params: Record<string, unknown> } | null): {
  id: string
  pose: PoseKind
  anim: string
} {
  const params = match?.params ?? {}
  const pose = params.pose === 'cover' || params.pose === 'aim' ? params.pose : 'fb'
  return { id: decParam(params.id), pose, anim: decParam(params.anim) }
}

const frame = ref(0)

// Currently loaded character runtime state.
const skeleton = ref<Skeleton | null>(null)
const atlas = ref<SpineAtlas | null>(null)
const atlasImg = ref<HTMLImageElement | null>(null)
const atlasImgs = ref<Map<string, HTMLImageElement> | null>(null)
const state = ref<AnimationState | null>(null)

/**
 * WebGL-branch camera config (the WebGL family keeps a renderer-level camera;
 * the canvas-2d renderer has none). The canvas-2d spine component owns its
 * transform, so the same fit is solved a second time into scale/x/y props:
 *
 *   screenX = fitX + fitScale * localX
 *   screenY = fitY - fitScale * localY
 *
 * Matching the spine fit convention
 *   screenX = (worldX - cx)*fit*zoomUser + W/2 + panUser
 * gives: fitScale = fit*zoomUser, fitX = W/2 + panX - fitScale*cx,
 *        fitY = H/2 + panY + fitScale*cy.
 */
/**
 * Measure the rendered content bbox from canvas pixels and re-fit ONCE.
 * Returns true when the fit was applied (or scheduled, for the async WebGPU
 * readback), false when there was nothing to measure yet (the first draw may
 * land a frame or two later on slow devices — the caller retries) or when
 * the readback failed (tainted canvas, lost context). Works for every model
 * type: pixels reflect meshes that extend beyond bones, scene backgrounds,
 * and camera-style animations alike.
 */
function refineFitFromPixels(): boolean {
  const cv = getCanvas()
  if (!cv || !fitBounds.value) return false
  const rect = cv.getBoundingClientRect()
  const dpr = cv.width / rect.width || 1
  const BW = cv.width
  const BH = cv.height
  let minX = BW, minY = BH, maxX = -1, maxY = -1

  if (renderMode.value === 'webgpu') {
    // WebGPU canvas pixels are unreadable from the main thread after
    // presentation — but the renderer's flushAndRead re-runs the FULL frame
    // inside a readback command buffer, giving the same ground-truth pixels
    // the GL path measures. (A previous fallback here faked the whole canvas
    // as the content bbox, which clobbered the deterministic bone fit —
    // after a mode/model switch the camera disagreed with the other modes.)
    // `getWebGPURenderer` is keyed by the WebGPU CONTEXT, not by the canvas
    // element — the renderer registry is a WeakMap the renderer populates with
    // the object `getContext('webgpu')` handed it. Passing the element used to
    // return null on every call, and because the callers treat null as "readback
    // unavailable, keep the deterministic bone fit", the WebGPU pixel fit was
    // silently dead: this mode alone never refined its framing and stayed at the
    // un-refined bone fit, which reads as "WebGPU renders far less of the scene"
    // even though the geometry it draws is identical. (TypeScript flagged the
    // old call as TS2345; the example's typecheck was not part of the build.)
    const gpuCtx = cv.getContext('webgpu') as GpuCanvasContext | null
    const renderer = gpuCtx ? getWebGPURenderer(gpuCtx) : null
    if (!renderer || BW === 0 || BH === 0) return false
    const dpr0 = dpr
    const gen = fitGeneration
    void renderer
      .flushAndRead()
      .then((px: Uint8ClampedArray) => {
        if (gen !== fitGeneration || renderMode.value !== 'webgpu') return
        let mnX = BW, mnY = BH, mxX = -1, mxY = -1
        for (let y = 0; y < BH; y += 2) {
          for (let x = 0; x < BW; x += 2) {
            const i = (y * BW + x) * 4
            if (px[i + 3] > 10) {
              if (x < mnX) mnX = x
              if (x > mxX) mxX = x
              if (y < mnY) mnY = y
              if (y > mxY) mxY = y
            }
          }
        }
        if (mxX < 0) return
        applyPixelFit(mnX, mnY, mxX, mxY, dpr0)
      })
      .catch((err) => {
        // Not silent: a readback failure here means this mode keeps the
        // un-refined bone fit, which looks like missing content. Say so
        // instead of leaving the user to compare screenshots.
        console.warn('[nikke] WebGPU pixel fit readback failed:', err)
      })
    return true
  } else if (renderMode.value === 'webgl') {
    // The bridge mounts WebGL2-first; getContext('webgl') on a webgl2 canvas
    // returns null, so query webgl2 first (same policy as the bridge).
    const gl = (cv.getContext('webgl2') ?? cv.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return false
    const px = new Uint8Array(BW * BH * 4)
    gl.readPixels(0, 0, BW, BH, gl.RGBA, gl.UNSIGNED_BYTE, px)
    // WebGL origin is bottom-left — collect bbox then flip y once.
    let mnY = BH, mxY = -1
    for (let y = 0; y < BH; y += 2) {
      for (let x = 0; x < BW; x += 2) {
        const i = (y * BW + x) * 4
        if (px[i + 3] > 10) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < mnY) mnY = y
          if (y > mxY) mxY = y
        }
      }
    }
    if (maxX < 0) return false
    minY = BH - 1 - mxY
    maxY = BH - 1 - mnY
  } else {
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D | null
    if (!ctx) return false
    const img = ctx.getImageData(0, 0, BW, BH).data
    const hex = bg.value.replace('#', '')
    const bgR = parseInt(hex.slice(0, 2), 16)
    const bgG = parseInt(hex.slice(2, 4), 16)
    const bgB = parseInt(hex.slice(4, 6), 16)
    for (let y = 0; y < BH; y += 2) {
      for (let x = 0; x < BW; x += 2) {
        const i = (y * BW + x) * 4
        const d =
          Math.abs(img[i] - bgR) + Math.abs(img[i + 1] - bgG) + Math.abs(img[i + 2] - bgB)
        if (d > 30) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
  }
  if (maxX < 0) return false
  applyPixelFit(minX, minY, maxX, maxY, dpr)
  return true
}

/**
 * Convert a measured content bbox (canvas physical px) into a fitBounds
 * update. Shared by the synchronous readbacks (WebGL / Canvas 2D) and the
 * async WebGPU readback, so every mode fits from the same ground truth and
 * the camera stays consistent across renderer switches.
 */
function applyPixelFit(
  minX: number, minY: number, maxX: number, maxY: number,
  dpr: number
): void {
  // Pixel bbox (physical) → logical px → world coords via the current fit.
  const lx0 = minX / dpr
  const lx1 = maxX / dpr
  const ly0 = minY / dpr
  const ly1 = maxY / dpr
  let wx0: number, wx1: number, wy0: number, wy1: number
  if (renderMode.value !== 'canvas') {
    const cam = camera.value
    wx0 = cam.x + (lx0 - stageW.value / 2) / cam.zoom
    wx1 = cam.x + (lx1 - stageW.value / 2) / cam.zoom
    wy1 = cam.y + (stageH.value / 2 - ly0) / cam.zoom
    wy0 = cam.y + (stageH.value / 2 - ly1) / cam.zoom
  } else {
    const s = fitScale.value || 1
    wx0 = (lx0 - fitX.value) / s
    wx1 = (lx1 - fitX.value) / s
    wy0 = (fitY.value - ly1) / s
    wy1 = (fitY.value - ly0) / s
  }
  const pad = 1.04
  fitBounds.value = {
    cx: (wx0 + wx1) / 2,
    cy: (wy0 + wy1) / 2,
    w: Math.max(1e-6, (wx1 - wx0) * pad),
    h: Math.max(1e-6, (wy1 - wy0) * pad)
  }
  fitStats.pixelFits++
  fitStats.lastPixelFit = `bboxPx=(${minX},${minY},${maxX},${maxY}) dpr=${dpr} cam=${JSON.stringify(camera.value)} mode=${renderMode.value}`
  // updateCamera re-runs via the fitBounds watcher.
}

function updateCamera(): void {
  const W = stageW.value
  const H = stageH.value
  const box = fitBounds.value
  if (!box) {
    camera.value = { x: 0, y: 0, zoom: 1 }
    fitScale.value = 1
    fitX.value = W / 2
    fitY.value = H / 2
    return
  }
  // NOTE: the fit center/scale come from the captured pose box — many Nikke
  // models ship skel headers whose x/y/width/height are far away from where
  // the animation actually poses the character.
  const cx = box.cx
  const cy = box.cy
  const base = Math.min(W / box.w, H / box.h)
  const Z = base * 0.92 * zoom.value
  camera.value = {
    zoom: Z,
    x: cx - panX.value / Z,
    y: cy + panY.value / Z,
  }
  fitScale.value = Z
  fitX.value = W / 2 + panX.value - Z * cx
  fitY.value = H / 2 + panY.value + Z * cy
}
const camera = ref({ x: 0, y: 0, zoom: 1 })
// Canvas-2D spine transform (no renderer camera — the component owns it).
const fitScale = ref(1)
const fitX = ref(0)
const fitY = ref(0)


// Element ref for the stage (screenshot / fullscreen / pan-zoom host).
const stageRef = ref<HTMLElement | null>(null)

// The fit reference: bone bbox of the pose captured ONCE at load /
// animation-switch time (deterministic — the same animation always yields
// the same box). Stage resizes re-project against this stored box instead
// of re-measuring, so the framing never visibly shifts or wobbles.
const fitBounds = ref<{ cx: number; cy: number; w: number; h: number } | null>(null)

/**
 * Fit generation: bumped whenever the fit's subject changes (model/animation
 * load, renderer mode switch). The WebGPU pixel fit resolves ASYNC (readback
 * command buffer); the generation guard makes a stale resolution — one that
 * started before a model/mode switch — a no-op instead of clobbering the new
 * subject's fit with the old frame's content box.
 */
let fitGeneration = 0
/** Diagnostics: how many times each fit path applied, and the last outcome. */
const fitStats = { pixelFits: 0, lastPixelFit: '' as string }

// One-shot pixel fit: after the model's first frame is actually drawn,
// measure the rendered content bbox from canvas pixels and re-fit once.
// Pixels are ground truth — they are immune to garbage skel headers, bone
// endpoints not bounding meshes, and camera-style animations that travel.
let pendingPixelFit = false
let framesSinceFitRequest = 0

/**
 * Diagnostic seam: `?nofit=1` (or `globalThis.__nikkeNoPixelFit`) turns the pixel
 * fit off, leaving only the deterministic bone fit.
 *
 * It exists so "is the picture moving because of the fit?" can be answered with
 * an A/B instead of by correlating timestamps. The fit re-writes the framing up
 * to three times AFTER the model is already on screen, so it can re-frame the
 * character while the user is watching — which reads as the picture jumping.
 * With this flag the frames of a run either jump or they do not.
 *
 * Cached: read per frame, never changes mid-run.
 */
let pixelFitAllowed: boolean | null = null
function pixelFitEnabled(): boolean {
  if (pixelFitAllowed === null) {
    const fromUrl =
      typeof location !== 'undefined' &&
      typeof location.search === 'string' &&
      /[?&]nofit=1/.test(location.search)
    const g = globalThis as { __nikkeNoPixelFit?: boolean }
    pixelFitAllowed = !(fromUrl || g.__nikkeNoPixelFit === true)
  }
  return pixelFitAllowed
}
/** Completed pixel-fit rounds for the current fit cycle (converges in ≤3). */
let pixelFitRounds = 0

/**
 * Measure the bone bbox UNION over the whole animation loop, by sampling the
 * timeline synchronously. The t=0 pose of many Nikke models is not
 * representative of the loop (the model drifts), so fitting a single frame
 * left the content off-center / wrongly scaled for most of the playback.
 * The union box is deterministic (same animation → same box) and keeps the
 * model centered and fully visible for the entire loop. One pass at load /
 * animation-switch — never per-frame, so the framing never visibly moves.
 */
function captureFitBounds(): void {
  const sk = skeleton.value
  const st = state.value
  if (!sk || !st || !sk.bones.length || !st.currentAnimation) {
    fitBounds.value = null
    return
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const acc = (b: (typeof sk.bones)[number]): void => {
    const len = b.data.length ?? 0
    const x2 = b.worldX + b.a * len
    const y2 = b.worldY + b.c * len
    if (b.worldX < minX) minX = b.worldX
    if (b.worldX > maxX) maxX = b.worldX
    if (x2 < minX) minX = x2
    if (x2 > maxX) maxX = x2
    if (b.worldY < minY) minY = b.worldY
    if (b.worldY > maxY) maxY = b.worldY
    if (y2 < minY) minY = y2
    if (y2 > maxY) maxY = y2
  }
  const anim = sk.data.animations[st.currentAnimation]
  const dur = Math.max(0.05, getAnimationDuration(anim))
  const SAMPLES = 48
  const step = dur / SAMPLES
  // t=0 (pose applied by the caller), then the rest of the loop.
  for (const b of sk.bones) acc(b)
  for (let i = 0; i < SAMPLES; i++) {
    st.update(step)
    st.apply()
    for (const b of sk.bones) acc(b)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    fitBounds.value = null
    return
  }
  // Small padding: mesh vertices can extend slightly past bone endpoints.
  fitBounds.value = {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: Math.max(1, (maxX - minX) * 1.1),
    h: Math.max(1, (maxY - minY) * 1.1)
  }
  // Rewind to t=0 so playback starts from the beginning.
  st.setAnimation(st.currentAnimation, true)
  st.apply()
}

// Live stage box (CSS px). The canvas logical size tracks it so the drawing
// buffer always matches the element aspect — no letterboxing, full bleed.
const stageW = ref(VIEW)
const stageH = ref(VIEW)
let stageObserver: ResizeObserver | null = null
watch(stageRef, (el) => {
  stageObserver?.disconnect()
  stageObserver = null
  if (!el) return
  stageObserver = new ResizeObserver((entries) => {
    const r = entries[0].contentRect
    if (r.width > 1 && r.height > 1) {
      stageW.value = Math.round(r.width)
      stageH.value = Math.round(r.height)
    }
  })
  stageObserver.observe(el)
})

watch([fitBounds, panX, panY, zoom, stageW, stageH], updateCamera)
updateCamera()

/** Resolve the <canvas> element rendered inside the stage. */
function getCanvas(): HTMLCanvasElement | null {
  return (stageRef.value?.querySelector('canvas') as HTMLCanvasElement | null) ?? null
}

// ---------------------------------------------------------------------------
// Classification & naming (mirrors nikkeviewer.com's rules)
// ---------------------------------------------------------------------------

function classify(id: string): Tab {
  if (/^c\d+(_\d+)?$/.test(id)) return 'characters'
  if (/^smol_/.test(id)) return 'chibi'
  if (/^story/.test(id)) return 'story'
  return 'scenes'
}

/** Sprite thumbnail used by Nikke-db for characters & chibis. */
function spriteUrl(id: string): string {
  return `${SPRITE_BASE}/si_${id}_00_s.png`
}

/** Prettified fallback when l2d.json has no name for an id. */
function fallbackName(id: string): string {
  if (/^c\d+(_\d+)?$/.test(id)) return id
  return id
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function tabCount(tab: Tab): number {
  return entries.value.filter((e) => classify(e.id) === tab).length
}

// ---------------------------------------------------------------------------
// Sidebar list building (two-level character grouping)
// ---------------------------------------------------------------------------

watch(
  () => [entries.value, activeTab.value, search.value] as unknown,
  () => {
    const q = search.value.trim().toLowerCase()
    const tab = activeTab.value
    expandedId.value = null

    if (tab !== 'characters') {
      const items = entries.value
        .filter((e) => classify(e.id) === tab)
        .filter((e) => !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
      rows.value = items.map((entry) => ({
        kind: 'entry',
        id: entry.id,
        name: entry.name,
        thumb: spriteUrl(entry.id),
        entry
      }))
      return
    }

    // Characters: group variants (c810_01…) under their base (c810).
    const all = entries.value.filter((e) => classify(e.id) === 'characters')
    const bases = all.filter((e) => /^c\d+$/.test(e.id))
    const variantMap = new Map<string, L2dEntry[]>()
    for (const e of all) {
      if (!/^c\d+_\d+$/.test(e.id)) continue
      const baseId = e.id.replace(/_\d+$/, '')
      if (!variantMap.has(baseId)) variantMap.set(baseId, [])
      variantMap.get(baseId)!.push(e)
    }
    // Virtual groups: variant exists but base dir is missing.
    for (const baseId of variantMap.keys()) {
      if (!bases.some((b) => b.id === baseId)) {
        bases.push({ id: baseId, name: fallbackName(baseId) })
      }
    }
    bases.sort((a, b) => a.name.localeCompare(b.name))

    const groups = bases.map((base) => {
      const variants = [base, ...(variantMap.get(base.id) ?? [])]
      return { base, variants }
    })

    const filtered = groups.filter(({ base, variants }) => {
      if (!q) return true
      if (base.name.toLowerCase().includes(q) || base.id.toLowerCase().includes(q)) return true
      return variants.some(
        (v) => v.name.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)
      )
    })

    rows.value = filtered.map(({ base, variants }) => ({
      kind: 'group',
      id: base.id,
      name: base.name,
      thumb: spriteUrl(base.id),
      variants
    }))
  },
  { immediate: true }
)

/** Level-2 label: strip the base name prefix ("2B Metamorphic Damage" → "Metamorphic Damage"). */
function variantLabel(baseName: string, v: L2dEntry): string {
  let label = v.name
  if (label.startsWith(baseName)) label = label.slice(baseName.length)
  label = label.replace(/^[\s_-]+/, '')
  return label || v.id
}

// ---------------------------------------------------------------------------
// Character loading (pose skeletons: FB / Cover / Aim)
// ---------------------------------------------------------------------------

/** Candidate .skel/.atlas locations for a given model id and pose. */
function skelCandidates(id: string, pose: PoseKind): Array<{ skelUrl: string; dir: string }> {
  if (pose === 'fb') {
    const root = `${RAW_BASE}/${id}`
    const out: Array<{ skelUrl: string; dir: string }> = []
    // Nikke-db uses inconsistent naming; try the common skeleton/atlas variants.
    // Some characters use EventScene_ prefix (e.g. bsideidol → EventScene_bsideidol_01)
    for (const pfx of ['', 'EventScene_']) {
      for (const sfx of ['_00', '_01', '', '_02', '_03']) {
        out.push({ skelUrl: `${root}/${pfx}${id}${sfx}`, dir: root })
      }
    }
    return out
  }
  // Cover / Aim poses live in subdirectories: <id>/cover/<id>_cover_00.skel
  const root = `${RAW_BASE}/${id}/${pose}`
  return ['_00', '', '_01', '_02'].map((sfx) => ({
    skelUrl: `${root}/${id}_${pose}${sfx}`,
    dir: root
  }))
}

/** HEAD-probe whether a pose skeleton exists for this model. */
async function probePose(id: string, pose: Exclude<PoseKind, 'fb'>): Promise<boolean> {
  for (const c of skelCandidates(id, pose)) {
    try {
      const resp = await fetch(`${c.skelUrl}.skel`, { method: 'HEAD' })
      if (resp.ok) return true
    } catch {
      /* ignore */
    }
  }
  return false
}

async function loadCharacter(char: string, pose: PoseKind = 'fb'): Promise<boolean> {
  if (!char) return false
  status.value = `Loading ${char}…`
  loaded.value = false
  try {
    let skelBuf: Uint8Array | null = null
    let atlasText: string | null = null
    let usedDir = ''
    outer: for (const c of skelCandidates(char, pose)) {
      const [skelResp, atlasResp] = await Promise.all([
        fetch(`${c.skelUrl}.skel`),
        fetch(`${c.skelUrl}.atlas`)
      ])
      if (skelResp.ok && atlasResp.ok) {
        skelBuf = new Uint8Array(await skelResp.arrayBuffer())
        atlasText = await atlasResp.text()
        usedDir = c.dir
        break outer
      }
    }
    if (!skelBuf || !atlasText) throw new Error('no .skel/.atlas found')

    const parsedAtlas = parseSpineAtlas(atlasText)
    const data: SkeletonData = parseSpineBinary(skelBuf)

    // Load EVERY atlas page image (multi-page atlases reference several PNGs;
    // loading only the first leaves effects on later pages showing wrong
    // textures). Page names are the non-empty lines ending in an image ext.
    const pageNames = atlasText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && /\.(png|webp|jpe?g)$/i.test(l))
    const pageImgs = new Map<string, HTMLImageElement>()
    for (const pngName of pageNames.length ? pageNames : [`${char}.png`]) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error(`image load failed: ${pngName}`))
        img.src = `${usedDir}/${pngName}`
      })
      pageImgs.set(pngName, img)
    }
    const img = pageImgs.values().next().value as HTMLImageElement

    // NIKKE models keep accessory parts (wingman pods etc.) in separate skins
    // that must be combined with the default one (official addSkin). Single-
    // skin models are unaffected (no extras).
    const sk = new Skeleton(data)
    sk.extraSkins = data.skins.filter((s) => s.name !== 'default').map((s) => s.name)
    skeleton.value = sk
    atlas.value = parsedAtlas
    atlasImg.value = img
    atlasImgs.value = pageImgs
    state.value = new AnimationState(skeleton.value)
    const names = state.value.animationNames
    if (names.length) {
      state.value.setAnimation(names[0], true)
      currentAnim.value = names[0]
      // Capture a rough fit from the animation timeline (see above), then
      // refine it from the actual first painted frame (pixel fit).
      fitGeneration++
      captureFitBounds()
      pendingPixelFit = pixelFitEnabled()
      framing.value = pendingPixelFit
      framingFrames = 0
      framesSinceFitRequest = 0
      pixelFitRounds = 0
    } else {
      currentAnim.value = ''
    }
    selectedChar.value = char
    currentPose.value = pose
    // Refresh restores the URL, so the sidebar tab must follow the loaded
    // model's category (e.g. /char/777 → Scenes) or the highlight looks wrong.
    activeTab.value = classify(char)
    if (/^c\d+_\d+$/.test(char)) expandedId.value = char.replace(/_\d+$/, '')
    const entry = entries.value.find((e) => e.id === char)
    currentName.value = entry ? entry.name : fallbackName(char)
    status.value = ''
    loaded.value = true
    refreshAnimItems()

    // Probe the crouch-pose skeletons (Cover / Aim) to enable/disable buttons.
    poseAvailability.value = { cover: false, aim: false }
    probePose(char, 'cover').then((ok) => {
      if (selectedChar.value === char)
        poseAvailability.value = { ...poseAvailability.value, cover: ok }
    })
    probePose(char, 'aim').then((ok) => {
      if (selectedChar.value === char)
        poseAvailability.value = { ...poseAvailability.value, aim: ok }
    })
    return true
  } catch (err) {
    status.value = `Failed to load "${char}" (${pose}): ${(err as Error).message}`
    loaded.value = false
    return false
  }
}

// ---------------------------------------------------------------------------
// Router ↔ state sync
// ---------------------------------------------------------------------------

/**
 * Apply a route match to the viewer state. Loading only happens when the
 * character/pose actually changes; a same-page anim change just switches the
 * animation on the live AnimationState.
 */
async function applySelection(match: { params: Record<string, unknown> } | null): Promise<void> {
  const { id, pose, anim } = readSelection(match)
  if (!id) return

  // Mobile flow: picking a character closes the list drawer.
  mobileListOpen.value = false

  if (id !== selectedChar.value || pose !== currentPose.value) {
    const ok = await loadCharacter(id, pose)
    if (!ok && pose !== 'fb') {
      // Requested pose skeleton doesn't exist for this model — fall back to
      // FB and rewrite the URL so the address bar reflects reality.
      await router.replace(router.routes.char as SelectionRoute, {
        params: { id: encParam(id) }
      })
      return
    }
  }

  if (anim && state.value && anim !== currentAnim.value) {
    if (state.value.animationNames.includes(anim)) {
      state.value.setAnimation(anim, true)
      currentAnim.value = anim
      // Re-frame once for the new animation's full loop, then pixel-refine.
      fitGeneration++
      captureFitBounds()
      pendingPixelFit = pixelFitEnabled()
      framing.value = pendingPixelFit
      framingFrames = 0
      framesSinceFitRequest = 0
      pixelFitRounds = 0
    }
    // Unknown anim in the URL (e.g. stale link): keep the default animation.
  }
}

router.afterEach((to) => {
  void applySelection(to)
})

// ---------------------------------------------------------------------------
// Components — each stateful piece is wrapped in com() so its reactive
// bindings live in their own effect scope (Rasen idiom; not React-style
// module-level JSX constants concatenated together).
// ---------------------------------------------------------------------------

let dragging = false
let lastX = 0
let lastY = 0

// Mobile drawers: character list (left) and control panel (right).
const mobileListOpen = ref(false)
const mobilePanelOpen = ref(false)

// Multi-pointer tracking for pinch-to-zoom on touch devices.
const activePointers = new Map<number, { x: number; y: number }>()
let pinchStartDist = 0
let pinchStartZoom = 1

/**
 * Pointer events arrive at device rate (often 120Hz+ on trackpads/touch),
 * each one previously writing panX/panY (or zoom) directly — every write ran
 * the full reactive chain (RefImpl set → updateCamera → camera.value set →
 * bridge camera watch → projection recompute). During a drag that chain ran
 * MULTIPLE times per rendered frame (the drag trace shows ~28% of JS time in
 * ref get/set). Now the event handlers only ACCUMULATE deltas; the rAF tick
 * applies them once per rendered frame.
 */
const pendingPan = { x: 0, y: 0 }
let pendingZoom: number | null = null

function hideImgOnError(e: Event): void {
  ;(e.target as HTMLElement).style.display = 'none'
}

function Avatar(props: { src: string; name: string }): Mountable<HTMLElement> {
  return com(() => (
    <span class="w-9 h-9 rounded-full overflow-hidden bg-white/5 flex items-center justify-center shrink-0 relative">
      <img
        src={props.src}
        alt={props.name}
        class="w-full h-full object-cover"
        onError={hideImgOnError}
      />
    </span>
  ))()
}

const Sidebar = com(() => (
  <div>
    {/* Mobile backdrop — closes the drawer on tap. */}
    {when({
      condition: () => mobileListOpen.value,
      then: () => (
        <div
          class="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => (mobileListOpen.value = false)}
        />
      ),
      else: () => <span class="hidden" />
    })}
    <div
      class={() =>
        'fixed md:static md:h-full inset-y-0 left-0 z-40 w-72 max-w-[85vw] shrink-0 bg-neutral-900 border-r border-white/5 flex flex-col transition-transform duration-200 ' +
        (mobileListOpen.value ? 'translate-x-0' : '-translate-x-full md:translate-x-0')
      }
    >
    <div class="flex items-center gap-3 px-4 py-3 md:px-5 md:py-5 border-b border-white/5">
      <img
        src="/nikke-logo.png"
        alt="NIKKE"
        class="w-9 h-9 rounded-xl object-cover shadow-lg shadow-black/40"
      />
      <div class="leading-tight">
        <div class="flex items-center gap-1.5">
          <span class="text-white font-semibold text-[15px]">Rasen</span>
          <button
            title="About the tech stack"
            class="w-4 h-4 rounded-full border border-neutral-600 text-[10px] leading-none text-neutral-400 hover:text-white hover:border-brand-400 hover:bg-white/10 transition flex items-center justify-center"
            onClick={() => (showTechInfo.value = true)}
          >
            ?
          </button>
        </div>
        <div class="text-neutral-400 text-xs">NIKKE Viewer</div>
      </div>
    </div>
    <div class="px-3 pt-3 pb-2">
      <input
        class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-brand-500 focus:bg-white/10 transition"
        placeholder="Search…"
        value={search}
        onInput={(e: Event) => (search.value = (e.target as HTMLInputElement).value)}
      />
    </div>
    <div class="px-3 pb-2 flex gap-1.5 flex-wrap">
      {each(TAB_LABELS, ({ tab, label }: { tab: Tab; label: string }) => (
        <button
          class={() =>
            'px-2.5 py-1.5 rounded-full text-xs font-semibold transition border ' +
            (activeTab.value === tab
              ? 'bg-brand-600 border-brand-500 text-white shadow shadow-brand-600/30'
              : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10')
          }
          onClick={() => (activeTab.value = tab)}
        >
          {label}{' '}
          <span class="opacity-60">{text({ content: () => `(${tabCount(tab)})` })}</span>
        </button>
      ))}
    </div>
    <div class="flex-1 overflow-y-auto px-3 py-2 space-y-1">
      {each(rows, (row: Row) => (
        <div>
          <div
            class={() =>
              'group flex items-center gap-2.5 px-3 py-2 rounded-lg transition cursor-pointer select-none ' +
              (row.id === selectedChar.value
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                : 'text-neutral-300 hover:bg-white/5')
            }
            onClick={() => {
              const id = row.kind === 'entry' ? row.entry.id : row.id
              void router.push(router.routes.char as SelectionRoute, {
                params: { id: encParam(id) }
              })
            }}
          >
            {Avatar({ src: row.thumb, name: row.name })}
            <span class="flex-1 min-w-0">
              <span class="block text-sm font-semibold truncate">{row.name}</span>
              <span class="block text-xs opacity-50 truncate">
                {text({
                  content: () =>
                    row.kind === 'group' && row.variants.length > 1
                      ? `${row.variants.length} variants`
                      : row.id
                })}
              </span>
            </span>
            {when({
              condition: () => row.kind === 'group' && row.variants.length > 1,
              then: () => (
                <button
                  title={() => (expandedId.value === row.id ? 'Collapse variants' : 'Expand variants')}
                  class={() =>
                    'shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition hover:bg-white/10 ' +
                    (expandedId.value === row.id
                      ? 'rotate-180 text-brand-300'
                      : row.id === selectedChar.value
                        ? 'text-white/80'
                        : 'text-neutral-400 group-hover:text-neutral-200')
                  }
                  onClick={(e: Event) => {
                    // Only the arrow toggles expansion — not the row click.
                    e.stopPropagation()
                    expandedId.value = expandedId.value === row.id ? null : row.id
                  }}
                >
                  {iconChevron()}
                </button>
              )
            })}
          </div>
          {when({
            condition: () =>
              row.kind === 'group' && expandedId.value === row.id && row.variants.length > 1,
            then: () => (
              <div class="ml-6 pl-3 border-l border-white/10 space-y-1 my-1">
                {each(
                  row.kind === 'group'
                    ? row.variants.filter((v: L2dEntry) => v.id !== row.id)
                    : [],
                  (v: L2dEntry) => (
                    <div
                      class={() =>
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg transition cursor-pointer select-none ' +
                        (v.id === selectedChar.value
                          ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                          : 'text-neutral-300 hover:bg-white/5')
                      }
                      onClick={() =>
                        void router.push(router.routes.char as SelectionRoute, {
                          params: { id: encParam(v.id) }
                        })
                      }
                    >
                      {Avatar({ src: spriteUrl(v.id), name: v.name })}
                      <span class="flex-1 min-w-0">
                        <span class="block text-sm font-semibold truncate">
                          {variantLabel(row.name, v)}
                        </span>
                        <span class="block text-xs opacity-50 truncate">{v.id}</span>
                      </span>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
    </div>
  </div>
))

const TopBar = com(() => (
  <div class="flex items-center justify-between px-3 py-2.5 md:px-6 md:py-4 border-b border-white/5">
    <div class="flex items-center gap-2.5 min-w-0">
      <button
        title="Characters"
        class="md:hidden w-9 h-9 shrink-0 rounded-lg bg-white/5 text-neutral-200 hover:bg-white/10 transition flex items-center justify-center"
        onClick={() => (mobileListOpen.value = true)}
      >
        {iconMenu()}
      </button>
      <div class="leading-tight min-w-0">
        <h1 class="text-white font-semibold text-sm md:text-lg leading-tight">Character Viewer</h1>
        <p class="text-neutral-400 text-[11px] md:text-xs leading-tight mt-0 md:mt-0.5 truncate">
          {text({ content: () => currentName.value || 'No character selected' })}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button
        title="Controls"
        class="md:hidden w-9 h-9 shrink-0 rounded-lg bg-white/5 text-neutral-200 hover:bg-white/10 transition flex items-center justify-center"
        onClick={() => (mobilePanelOpen.value = true)}
      >
        {iconSliders()}
      </button>
      <button
        class="h-9 px-2.5 md:h-auto md:px-3 md:py-2 rounded-lg text-sm bg-white/5 text-neutral-200 hover:bg-white/10 transition flex items-center gap-2"
        onClick={() => saveScreenshot()}
      >
        {iconCamera()}
        <span class="hidden md:inline">Screenshot</span>
      </button>
      <button
        class="h-9 px-2.5 md:h-auto md:px-3 md:py-2 rounded-lg text-sm bg-white/5 text-neutral-200 hover:bg-white/10 transition flex items-center gap-2"
        onClick={() => stageRef.value?.requestFullscreen()}
      >
        {iconExpand()}
        <span class="hidden md:inline">Fullscreen</span>
      </button>
    </div>
  </div>
))

const Stage = com(() => (
  <div
    ref={stageRef}
    class="relative flex-1 flex items-center justify-center overflow-hidden bg-neutral-950"
    style={() => ({ background: bg.value })}
    onPointerDown={(e: PointerEvent) => {
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (activePointers.size === 1) {
        dragging = true
        lastX = e.clientX
        lastY = e.clientY
      } else if (activePointers.size === 2) {
        // Begin pinch: remember the starting distance & zoom.
        dragging = false
        const [a, b] = [...activePointers.values()]
        pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y)
        pinchStartZoom = zoom.value
      }
    }}
    onPointerMove={(e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const cv = getCanvas()
      if (!cv) return
      const rect = cv.getBoundingClientRect()
      const scale =
        Math.min(rect.width / (stageW.value || VIEW), rect.height / (stageH.value || VIEW)) || 1
      if (activePointers.size >= 2) {
        const [a, b] = [...activePointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchStartDist > 0) {
          // Coalesce: store the target zoom; the tick applies it.
          pendingZoom = Math.min(5, Math.max(0.3, pinchStartZoom * (dist / pinchStartDist)))
        }
        return
      }
      if (!dragging) return
      // Coalesce: accumulate deltas; the tick applies them once per frame.
      pendingPan.x += (e.clientX - lastX) / scale
      pendingPan.y += (e.clientY - lastY) / scale
      lastX = e.clientX
      lastY = e.clientY
    }}
    onPointerUp={(e: PointerEvent) => {
      activePointers.delete(e.pointerId)
      if (activePointers.size === 1) {
        // Pinch ended with one finger remaining — resume panning.
        const [p] = activePointers.values()
        dragging = true
        lastX = p.x
        lastY = p.y
        pinchStartDist = 0
      } else if (activePointers.size === 0) {
        dragging = false
        pinchStartDist = 0
      }
    }}
    onPointerCancel={(e: PointerEvent) => {
      activePointers.delete(e.pointerId)
      dragging = false
      pinchStartDist = 0
    }}
    onPointerLeave={(e: PointerEvent) => {
      activePointers.delete(e.pointerId)
      if (activePointers.size === 0) dragging = false
    }}
    onWheel={(e: WheelEvent) => {
      e.preventDefault()
      // Coalesced like pointer drags: the tick applies the latest zoom once
      // per frame (wheel events also arrive faster than the display).
      pendingZoom = Math.min(5, Math.max(0.3, zoom.value * (1 - e.deltaY * 0.001)))
    }}
  >
    {when({
      condition: () => renderMode.value === 'webgpu' && !!webgpuDevice.value,
      then: () => (
        <canvas
          style={{
            width: '100%',
            height: '100%',
            'object-fit': 'contain',
            'touch-action': 'none',
            'user-select': 'none',
          }}
          width={stageW}
          height={stageH}
          contextType="webgpu"
          webgpuDevice={webgpuDevice.value ?? undefined}
          renderOptions={{ clearColor: 'rgba(0,0,0,0)', continuousRender: true } as never}
          camera={camera}
        >
          <SpineWebgl
            skeleton={skeleton}
            atlas={atlas}
            atlasImg={atlasImg}
            atlasImgs={atlasImgs}
            state={state}
            animation={currentAnim}
            showBones={showBones}
            frame={frame}
            width={stageW}
            height={stageH}
            skipTonemap={true}
          />
        </canvas>
      ),
      else: () =>
        when({
          condition: () => renderMode.value === 'webgl',
          then: () => (
        <canvas
          style={{
            width: '100%',
            height: '100%',
            'object-fit': 'contain',
            'touch-action': 'none',
            'user-select': 'none',
          }}
          width={stageW}
          height={stageH}
          contextType="webgl"
          contextOptions={{ alpha: true, preserveDrawingBuffer: true }}
          renderOptions={{ clearColor: 'rgba(0,0,0,0)', continuousRender: true }}
          camera={camera}
        >
          <SpineWebgl
            skeleton={skeleton}
            atlas={atlas}
            atlasImg={atlasImg}
            atlasImgs={atlasImgs}
            state={state}
            animation={currentAnim}
            showBones={showBones}
            frame={frame}
            width={stageW}
            height={stageH}
            skipTonemap={true}
          />
        </canvas>
          ),
          else: () => (
        <canvas
          style={{
            width: '100%',
            height: '100%',
            'object-fit': 'contain',
            'touch-action': 'none',
            'user-select': 'none',
          }}
          width={stageW}
          height={stageH}
          contextType="2d"
        >
          <SpineCanvas
            skeleton={skeleton}
            atlas={atlas}
            atlasImg={atlasImg}
            atlasImgs={atlasImgs}
            state={state}
            animation={currentAnim}
            showBones={showBones}
            frame={frame}
            width={stageW}
            height={stageH}
            x={fitX}
            y={fitY}
            scale={fitScale}
            bg={bg}
          />
        </canvas>
          )
        })
    })}
    {when({
      // `framing` keeps the overlay up until the pixel fit has stopped moving the
      // camera, so the model is never revealed mis-framed and then corrected.
      condition: () => !loaded.value || framing.value,
      then: () => (
        // The overlay has to be OPAQUE. It used to be a bare positioned div with an
        // icon and a label and no background, which made it a label ON TOP of the
        // canvas rather than a cover over it — the character stayed visible through
        // it, so hiding the fit behind it hid nothing. Verified by reading the
        // element's computed background: none.
        //
        // The background is the same colour the canvas paints its own backdrop
        // with, so revealing the canvas is seamless rather than a colour pop.
        <div
          class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-500 pointer-events-none transition"
          style={() => ({ background: bg.value })}
        >
          {iconUser()}
          <p>{text({ content: () => (framing.value ? '' : status.value || 'Select a character to begin') })}</p>
        </div>
      )
    })}
  </div>
))

type AnimItem = { name: string }
const animItems = ref<AnimItem[]>([])
function refreshAnimItems(): void {
  animItems.value = state.value ? state.value.animationNames.map((name) => ({ name })) : []
}

const POSE_BUTTONS: Array<{ pose: PoseKind; label: string; title: string }> = [
  { pose: 'fb', label: 'FB', title: 'Full-body idle pose' },
  { pose: 'cover', label: 'Cover', title: 'Crouch — cover pose' },
  { pose: 'aim', label: 'Aim', title: 'Crouch — aim pose' }
]

const ControlPanel = com(() => (
  <div>
    {/* Mobile backdrop — closes the drawer on tap. */}
    {when({
      condition: () => mobilePanelOpen.value,
      then: () => (
        <div
          class="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => (mobilePanelOpen.value = false)}
        />
      ),
      else: () => <span class="hidden" />
    })}
    <div
      class={() =>
        'fixed md:static md:h-full inset-y-0 right-0 z-40 w-72 max-w-[85vw] shrink-0 bg-neutral-900 border-l border-white/5 flex flex-col gap-6 p-5 overflow-y-auto transition-transform duration-200 ' +
        (mobilePanelOpen.value ? 'translate-x-0' : 'translate-x-full md:translate-x-0')
      }
    >
    <div class="space-y-3">
      <h2 class="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-neutral-500">Pose</h2>
      <div class="flex gap-2">
        {each(
          POSE_BUTTONS,
          ({ pose, label, title }: { pose: PoseKind; label: string; title: string }) => (
            <button
              title={title}
              class={() => {
                const available = pose === 'fb' || poseAvailability.value[pose]
                const active = currentPose.value === pose
                return (
                  'flex-1 px-3 py-1.5 rounded-full text-xs transition border ' +
                  (active
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : available
                      ? 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                      : 'bg-white/5 border-white/5 text-neutral-600 cursor-not-allowed')
                )
              }}
              onClick={() => {
                if (pose === 'fb' || poseAvailability.value[pose]) {
                  void router.push(router.routes.charPose as typeof router.routes.charPose, {
                    params: { id: encParam(selectedChar.value), pose }
                  })
                }
              }}
            >
              {label}
            </button>
          )
        )}
      </div>
      <p class="text-xs text-neutral-500">
        {text({
          content: () =>
            currentName.value
              ? `Cover available: ${poseAvailability.value.cover ? 'yes' : 'no'} · Aim available: ${poseAvailability.value.aim ? 'yes' : 'no'}`
              : 'Select a costume to load its poses'
        })}
      </p>
    </div>
    <div class="space-y-3">
      <h2 class="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-neutral-500">Animation</h2>
      <div class="flex flex-wrap gap-2">
        {each(animItems, (item: AnimItem) => (
          <button
            class={() =>
              'px-3 py-1.5 rounded-full text-xs transition border ' +
              (item.name === currentAnim.value
                ? 'bg-brand-600 border-brand-500 text-white'
                : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10')
            }
            onClick={() => {
              if (!selectedChar.value) return
              void router.push(router.routes.charPoseAnim as typeof router.routes.charPoseAnim, {
                params: {
                  id: encParam(selectedChar.value),
                  pose: currentPose.value,
                  anim: encParam(item.name)
                }
              })
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
    <div class="space-y-3">
      <h2 class="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-neutral-500">Background</h2>
      <div class="flex flex-wrap gap-2 items-center">
        {each(BG_PRESETS, (p: { name: string; color: string }) => (
          <button
            class={() =>
              'w-8 h-8 rounded-lg border-2 transition hover:scale-105 ' +
              (bg.value.toLowerCase() === p.color.toLowerCase()
                ? 'border-brand-400'
                : 'border-white/10')
            }
            style={() => ({ background: p.color })}
            title={p.name}
            onClick={() => (bg.value = p.color)}
          />
        ))}
        <input
          class="w-8 h-8 rounded-lg border-2 border-white/10 bg-transparent p-0 cursor-pointer"
          type="color"
          value={bg}
          title="Custom color"
          onInput={(e: Event) => (bg.value = (e.target as HTMLInputElement).value)}
        />
      </div>
    </div>
    <div class="space-y-3">
      <h2 class="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-neutral-500">Renderer</h2>
      <div class="flex rounded-lg overflow-hidden border border-white/10">
        <button
          class={() => 'flex-1 px-3 py-1.5 text-xs transition ' + (renderMode.value === 'webgl' ? 'bg-brand-600 text-white' : 'bg-white/5 text-neutral-400 hover:bg-white/10')}
          onClick={() => (renderMode.value = 'webgl')}
        >WebGL</button>
        <button
          class={() => 'flex-1 px-3 py-1.5 text-xs transition ' + (renderMode.value === 'webgpu' ? 'bg-brand-600 text-white' : 'bg-white/5 text-neutral-400 hover:bg-white/10')}
          onClick={async () => {
            const ok = await ensureWebgpuDevice()
            if (!ok) {
              status.value = 'WebGPU is not available in this browser'
              return
            }
            renderMode.value = 'webgpu'
          }}
        >WebGPU</button>
        <button
          class={() => 'flex-1 px-3 py-1.5 text-xs transition ' + (renderMode.value === 'canvas' ? 'bg-brand-600 text-white' : 'bg-white/5 text-neutral-400 hover:bg-white/10')}
          onClick={() => (renderMode.value = 'canvas')}
        >Canvas 2D</button>
      </div>
    </div>
    <div class="space-y-3">
      <h2 class="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-neutral-500">View</h2>
      <button
        class="w-full px-3 py-2 rounded-lg text-sm bg-white/5 text-neutral-200 hover:bg-white/10 transition"
        onClick={() => {
          panX.value = 0
          panY.value = 0
          zoom.value = 1
        }}
      >
        Reset pan &amp; zoom
      </button>
      <button
        class={() =>
          'w-full px-3 py-2 rounded-lg text-sm transition flex items-center justify-center gap-2 ' +
          (showBones.value
            ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
            : 'bg-white/5 text-neutral-200 hover:bg-white/10')
        }
        onClick={() => (showBones.value = !showBones.value)}
      >
        <span>{text({ content: () => (showBones.value ? 'Hide' : 'Show') })}</span>
        <span>bones</span>
      </button>
    </div>
    </div>
  </div>
))

const TECH_STACK: Array<{ name: string; desc: string }> = [
  { name: '@rasenjs/core', desc: 'Reactive core — components, effect scopes, pluggable reactivity runtime' },
  { name: '@rasenjs/dom', desc: 'DOM renderer with JSX runtime and reactive prop/class/text bindings' },
  { name: '@rasenjs/canvas-2d', desc: 'Canvas 2D renderer — drives the Spine skeletal animation here' },
  { name: '@rasenjs/gfx', desc: 'WebGL renderer — the alternative high-performance backend (toggle in Renderer)' },
  { name: '@rasenjs/reactive-vue', desc: 'Vue reactivity adapter: ref / watch / computed via @vue/reactivity' },
  { name: '@rasenjs/router', desc: 'Typed, reactive routing — char/pose/anim selection in this viewer is URL-driven' },
  { name: '@rasenjs/assets', desc: 'Spine .skel/.atlas binary parsing and skeleton model' },
  { name: 'UnoCSS', desc: 'Utility-first CSS engine' }
]

const TechInfoModal = com(() =>
  when({
    condition: () => showTechInfo.value,
    then: () => (
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={() => (showTechInfo.value = false)}
      >
        <div
          class="w-full max-w-[calc(100vw-2rem)] md:max-w-md max-h-[82vh] overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-4 md:p-6 shadow-2xl shadow-black/60"
          onClick={(e: Event) => e.stopPropagation()}
        >
          <div class="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 class="text-white font-semibold text-lg">Built with Rasen</h2>
              <p class="text-neutral-500 text-xs mt-0.5">One reactive core, multiple render targets.</p>
            </div>
            <button
              class="w-7 h-7 shrink-0 rounded-lg bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10 transition flex items-center justify-center text-sm"
              onClick={() => (showTechInfo.value = false)}
              title="Close"
            >
              ✕
            </button>
          </div>
          <ul class="space-y-3">
            {each(TECH_STACK, (lib: { name: string; desc: string }) => (
              <li class="rounded-lg bg-white/[0.03] border border-white/5 px-3.5 py-2.5">
                <div class="text-brand-400 font-mono text-xs font-semibold">{lib.name}</div>
                <div class="text-neutral-400 text-xs mt-0.5 leading-relaxed">{lib.desc}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    ),
    else: () => <span class="hidden" />
  })
)

const App = com(() => (
  // Height comes from .app-shell in style.css (100vh fallback + 100dvh) —
  // Tailwind's h-screen would win over h-[100dvh] in the emitted stylesheet
  // and reintroduce the mobile URL-bar scrollbar. w-full instead of w-screen
  // so a classic scrollbar never causes horizontal overflow.
  <div class="app-shell w-full flex bg-neutral-950 text-neutral-200 font-sans overflow-hidden">
    <Sidebar />
    <div class="flex-1 flex flex-col min-w-0">
      <TopBar />
      <Stage />
    </div>
    <ControlPanel />
    {TechInfoModal()}
  </div>
))

export const app = (): Mountable<HTMLElement> => App()

// ---------------------------------------------------------------------------
// Helpers: icons (inline SVG)
// ---------------------------------------------------------------------------

/** Wrap a raw SVG element as a rasen Mountable so it can be used as a child. */
function svgMount(svg: SVGElement): Mountable<HTMLElement> {
  return (host: HTMLElement) => {
    host.appendChild(svg)
    return () => svg.remove()
  }
}

function iconMenu(): Mountable<HTMLElement> {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('width', '18')
  s.setAttribute('height', '18')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('fill', 'none')
  s.setAttribute('stroke', 'currentColor')
  s.setAttribute('stroke-width', '2')
  s.innerHTML = '<path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16"/>'
  return svgMount(s)
}

function iconSliders(): Mountable<HTMLElement> {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('width', '18')
  s.setAttribute('height', '18')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('fill', 'none')
  s.setAttribute('stroke', 'currentColor')
  s.setAttribute('stroke-width', '2')
  s.innerHTML =
    '<path stroke-linecap="round" d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'
  return svgMount(s)
}

function iconChevron(): Mountable<HTMLElement> {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('width', '14')
  s.setAttribute('height', '14')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('fill', 'none')
  s.setAttribute('stroke', 'currentColor')
  s.setAttribute('stroke-width', '2')
  s.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>'
  return svgMount(s)
}
function iconCamera(): Mountable<HTMLElement> {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('width', '16')
  s.setAttribute('height', '16')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('fill', 'none')
  s.setAttribute('stroke', 'currentColor')
  s.setAttribute('stroke-width', '2')
  s.innerHTML =
    '<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>'
  return svgMount(s)
}
function iconExpand(): Mountable<HTMLElement> {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('width', '16')
  s.setAttribute('height', '16')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('fill', 'none')
  s.setAttribute('stroke', 'currentColor')
  s.setAttribute('stroke-width', '2')
  s.innerHTML = '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'
  return svgMount(s)
}
function iconUser(): Mountable<HTMLElement> {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('width', '48')
  s.setAttribute('height', '48')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('fill', 'none')
  s.setAttribute('stroke', 'currentColor')
  s.setAttribute('stroke-width', '1.5')
  s.innerHTML = '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'
  return svgMount(s)
}

function saveScreenshot(): void {
  const el = getCanvas()
  if (!el) return
  const url = el.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = `${selectedChar.value || 'spine'}.png`
  a.click()
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/** Merge display names from Nikke-db's l2d.json (CORS-friendly). */
async function loadNames(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const resp = await fetch(L2D_NAMES_URL, { signal: AbortSignal.timeout(6000) })
    if (!resp.ok) return map
    const list = (await resp.json()) as Array<{ id: string; name: string }>
    for (const item of list) if (item.id && item.name) map.set(item.id, item.name)
  } catch {
    /* names are optional — ids remain usable */
  }
  return map
}

/**
 * Resolve the model catalogue from the most reliable source available:
 *   1. GitHub API — freshest, but blocked / rate-limited on some networks
 *   2. localStorage from the last successful fetch on this device
 *   3. Built-in minimal fallback
 */
async function fetchCatalogue(): Promise<{
  dirs: string[]
  names: Map<string, string>
  offline: boolean
}> {
  const ENTRIES_CACHE_KEY = 'nikke-viewer:entries'

  const readCache = (): { dirs: string[]; names: Map<string, string> } | null => {
    try {
      const cached = JSON.parse(localStorage.getItem(ENTRIES_CACHE_KEY) ?? 'null') as {
        dirs?: string[]
        names?: Record<string, string>
      } | null
      if (cached?.dirs?.length) {
        return { dirs: cached.dirs, names: new Map(Object.entries(cached.names ?? {})) }
      }
    } catch {
      /* corrupted cache — ignore */
    }
    return null
  }

  const writeCache = (dirs: string[], names: Map<string, string>): void => {
    try {
      localStorage.setItem(
        ENTRIES_CACHE_KEY,
        JSON.stringify({ dirs, names: Object.fromEntries(names) })
      )
    } catch {
      /* cache is best-effort */
    }
  }

  // 1+2. GitHub directory listing — direct first, then the same-origin
  // pass-through proxy (/gh/l2d is a Vercel rewrite to the same GitHub URL).
  // The proxy exists for networks where api.github.com itself is unreachable;
  // nothing is stored or served by us — it is a live pass-through.
  for (const url of [GITHUB_API, '/gh/l2d']) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!resp.ok) continue
      const list = (await resp.json()) as Array<{ name: string; type: string }>
      const dirs = list.filter((e) => e.type === 'dir').map((e) => e.name)
      if (dirs.length) {
        const names = await loadNames()
        writeCache(dirs, names)
        return { dirs, names, offline: false }
      }
    } catch {
      /* try the next source */
    }
  }

  // 3. nikke-db's l2d.json (CORS-friendly, usually reachable when GitHub is
  // not) — its ids double as the catalogue; names come for free.
  try {
    const resp = await fetch(L2D_NAMES_URL, { signal: AbortSignal.timeout(6000) })
    if (resp.ok) {
      const list = (await resp.json()) as Array<{ id?: string; name?: string }>
      const ids = list.map((x) => x.id).filter((id): id is string => !!id)
      if (ids.length) {
        const names = new Map(
          list.filter((x) => x.id && x.name).map((x) => [x.id as string, x.name as string])
        )
        writeCache(ids, names)
        return { dirs: ids, names, offline: false }
      }
    }
  } catch {
    /* fall through to the device cache */
  }

  // 4. Last successful fetch on this device (fully offline case)
  const cached = readCache()
  if (cached) return { ...cached, offline: true }

  // 5. Built-in minimal fallback
  return { dirs: FALLBACK_CHARS, names: new Map(), offline: true }
}

async function boot(): Promise<void> {
  const { dirs, names, offline } = await fetchCatalogue()
  if (offline) status.value = 'Offline — showing cached model list'
  entries.value = dirs.map((id) => ({ id, name: names.get(id) ?? fallbackName(id) }))
  if (!entries.value.length) entries.value = FALLBACK_CHARS.map((id) => ({ id, name: id }))

  // Legacy deep links (?char=xxx) are redirected to the canonical route.
  const legacy = new URLSearchParams(location.search).get('char')
  if (legacy && dirs.includes(legacy)) {
    await router.replace(router.routes.char as SelectionRoute, {
      params: { id: encParam(legacy) }
    })
    return
  }

  // Restore selection from the current URL, or seed the default character.
  const current = router.current
  const fromUrl = readSelection(current)
  if (fromUrl.id && dirs.includes(fromUrl.id)) {
    await applySelection(current)
  } else {
    await router.replace(router.routes.char as SelectionRoute, {
      params: { id: encParam(findDefaultChar()) }
    })
  }
}

/** First loadable entry, preferring an actual character over scenes. */
function findDefaultChar(): string {
  const list = entries.value
  return (list.find((e) => /^c\d+$/.test(e.id)) ?? list[0])?.id ?? ''
}

// Debug/inspection hook (harmless in production): lets tooling read the
// camera-fit state to verify cross-renderer consistency.
;(window as unknown as { __nikkeFitState?: () => unknown }).__nikkeFitState = () => ({
  renderMode: renderMode.value,
  camera: camera.value,
  fitBounds: fitBounds.value,
  zoomUser: zoom.value,
  panX: panX.value,
  panY: panY.value,
  stageW: stageW.value,
  stageH: stageH.value,
  fitScale: fitScale.value,
  pendingPixelFit,
  framing: framing.value,
  pixelFitEnabled: pixelFitEnabled(),
  fitStats,
  atlasReady: !!(atlasImg.value || atlasImgs.value),
  skeletonReady: !!skeleton.value
})

void boot()

let lastTime = performance.now()
function tick(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now
  if (state.value) {
    state.value.update(dt)
    state.value.apply()
  }
  // Apply coalesced drag/pinch/wheel deltas ONCE per rendered frame (each
  // individual event write previously ran the whole reactive camera chain).
  if (pendingPan.x !== 0 || pendingPan.y !== 0) {
    panX.value += pendingPan.x
    panY.value += pendingPan.y
    pendingPan.x = 0
    pendingPan.y = 0
  }
  if (pendingZoom !== null) {
    zoom.value = pendingZoom
    pendingZoom = null
  }
  if (pendingPixelFit && pixelFitEnabled() && (atlasImg.value || atlasImgs.value) && ++framesSinceFitRequest >= 6) {
    // Wait 6 frames AFTER the atlas is ready (the first real draw needs the
    // atlas — assets stream from the network and can land many seconds after
    // the model load that armed this fit), then measure. The fit is
    // ITERATIVE: each round maps the measured pixel bbox back to world
    // through the CURRENT camera, so when the deterministic bone-union box
    // is garbage (camera-style bones far off screen, c810), one round
    // cannot converge — re-measure a few rounds until fitBounds stabilises
    // or the round budget runs out (rounds, not raw frames, so the readback
    // cost stays bounded).
    let applied = false
    try {
      applied = refineFitFromPixels()
    } catch {
      applied = false
    }
    if (applied) {
      pixelFitRounds++
      framesSinceFitRequest = -10 // next round in 16 frames
      if (pixelFitRounds >= 3) {
        pendingPixelFit = false
        // 3, not 1: the decrement at the end of THIS tick would take a 1 straight
        // to zero and reveal immediately — the exact frame the last correction
        // was applied on. (Measured: the fit lands in frame 34's tick and the
        // pixels only show it in frame 35.)
        revealAfter = 3
        framesSinceFitRequest = 0
      }
    } else if (framesSinceFitRequest >= 90) {
      // Readback never produced a box (tainted canvas, failed WebGPU readback,
      // nothing drawn). Give up on the fit and reveal — the deterministic bone
      // fit is what is on screen, and holding the overlay any longer would just
      // hide a working model.
      pendingPixelFit = false
      revealAfter = 3
      framesSinceFitRequest = 0
      pixelFitRounds = 0
    }
  }
  // Lift the overlay one frame after the last re-framing, so the frame that
  // shows the final framing is the first one the user can see. The deadline is a
  // backstop: the overlay must never be able to outlive a working model.
  if (framing.value) {
    framingFrames++
    if (framingFrames > FRAMING_MAX_FRAMES && revealAfter === 0) revealAfter = 1
  }
  if (revealAfter > 0 && --revealAfter === 0) {
    framing.value = false
    pendingPixelFit = false
  }
  frame.value = frame.value + 1
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
