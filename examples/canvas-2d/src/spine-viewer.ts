/**
 * Spine Character Viewer — live validation of @rasenjs/spine's binary (.skel) support.
 *
 * Assets are fetched in real time from the public Nikke-db GitHub repository
 * (https://github.com/Nikke-db/Nikke-db.github.io, `l2d/<character>/` folder).
 * Each character ships a Spine 4.1 binary skeleton (`<char>_00.skel`), a packed
 * atlas (`<char>_00.atlas`) and a PNG. We parse the binary skeleton with the
 * self-developed `parseSpineBinary` reader, evaluate poses with the rasen
 * runtime, and render textured meshes/regions through @rasenjs/canvas-2d.
 */

import { createNode, type CanvasNode, type Context2D } from '@rasenjs/canvas-2d'
import {
  parseSpineBinary,
  parseSpineAtlas,
  computeAttachmentWorld,
  Skeleton,
  AnimationState,
  type Bone,
  type AttachmentData,
  type SkeletonData,
  type SpineAtlas
} from '@rasenjs/spine'
import { div, h1, p, a, button, canvas, text, mount } from '@rasenjs/dom'
import { useReactiveRuntime, ref, setValue } from '@rasenjs/reactive-vue'
import { watch } from '@vue/reactivity'
import { each } from '@rasenjs/core'

useReactiveRuntime()

// ---------------------------------------------------------------------------
// Remote asset sources (Nikke-db, live from GitHub)
// ---------------------------------------------------------------------------

const GITHUB_API =
  'https://api.github.com/repos/Nikke-db/Nikke-db.github.io/contents/l2d?ref=main'
const RAW_BASE = 'https://raw.githubusercontent.com/Nikke-db/Nikke-db.github.io/main/l2d'

// Fallback list used if the GitHub API is rate-limited.
const FALLBACK_CHARS = ['777', 'absolute', 'acpufreeze', 'alonesurvivor', 'arcanearchive']

// ---------------------------------------------------------------------------
// Reactive UI state
// ---------------------------------------------------------------------------

const characters = ref<string[]>([])
const selectedChar = ref('')
const currentAnim = ref('')
const status = ref('Loading character list…')
const loaded = ref(false)

// Currently loaded character (mutated on selection).
let skeleton: Skeleton | null = null
let atlas: SpineAtlas | null = null
let atlasImg: HTMLImageElement | null = null
let state: AnimationState | null = null

// Reactive frame counter — bumped every rAF tick to drive canvas redraws.
const frame = ref(0)

// ---------------------------------------------------------------------------
// Texture mapping (affine per-triangle, same technique as the spine example)
// ---------------------------------------------------------------------------

function drawTexturedTriangles(
  ctx: Context2D,
  world: number[],
  uvs: number[],
  triangles: number[],
  img: HTMLImageElement | ImageBitmap,
  pageW: number,
  pageH: number
): void {
  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t]
    const i1 = triangles[t + 1]
    const i2 = triangles[t + 2]

    const sx0 = uvs[2 * i0] * pageW
    const sy0 = uvs[2 * i0 + 1] * pageH
    const sx1 = uvs[2 * i1] * pageW
    const sy1 = uvs[2 * i1 + 1] * pageH
    const sx2 = uvs[2 * i2] * pageW
    const sy2 = uvs[2 * i2 + 1] * pageH

    const dx0 = world[2 * i0]
    const dy0 = world[2 * i0 + 1]
    const dx1 = world[2 * i1]
    const dy1 = world[2 * i1 + 1]
    const dx2 = world[2 * i2]
    const dy2 = world[2 * i2 + 1]

    const A = sx1 - sx0
    const B = sy1 - sy0
    const C = dx1 - dx0
    const D = sx2 - sx0
    const E = sy2 - sy0
    const F = dx2 - dx0
    const det = A * E - B * D
    if (Math.abs(det) < 1e-9) continue
    const G = dy1 - dy0
    const H = dy2 - dy0

    const a = (C * E - B * F) / det
    const c = (A * F - C * D) / det
    const e = dx0 - a * sx0 - c * sy0
    const b = (G * E - B * H) / det
    const d = (A * H - G * D) / det
    const f = dy0 - b * sx0 - d * sy0

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(dx0, dy0)
    ctx.lineTo(dx1, dy1)
    ctx.lineTo(dx2, dy2)
    ctx.closePath()
    ctx.clip()
    ctx.transform(a, b, c, d, e, f)
    ctx.drawImage(img, 0, 0)
    ctx.restore()
  }
}

/** Compute world-space vertices for an attachment (region quad or weighted mesh). */
// @ts-expect-error — debug helper, intentionally unused in production
function _computeWorldVertices(att: AttachmentData, bone: Bone, sk: Skeleton): number[] {
  const v = att.vertices
  if (!v || v.length === 0) {
    const w = att.width ?? 0
    const h = att.height ?? 0
    const ax = att.x ?? 0
    const ay = att.y ?? 0
    const rot = ((att.rotation ?? 0) * Math.PI) / 180
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    const corners = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2]
    ]
    return corners.flatMap(([cx, cy]) => {
      const lx = ax + (cx * cos - cy * sin)
      const ly = ay + (cx * sin + cy * cos)
      return [bone.a * lx + bone.b * ly + bone.worldX, bone.c * lx + bone.d * ly + bone.worldY]
    })
  }

  const out: number[] = []
  let i = 0
  while (i < v.length) {
    const boneCount = v[i++]
    let wx = 0
    let wy = 0
    for (let b = 0; b < boneCount; b++) {
      const boneIndex = v[i++]
      const vx = v[i++]
      const vy = v[i++]
      const weight = v[i++]
      const b2 = sk.bones[boneIndex]
      if (b2) {
        wx += (b2.a * vx + b2.b * vy + b2.worldX) * weight
        wy += (b2.c * vx + b2.d * vy + b2.worldY) * weight
      }
    }
    out.push(wx, wy)
  }
  return out
}

function drawSkeleton(ctx: Context2D, width: number, height: number): void {
  if (!skeleton || !atlas || !atlasImg) return
  ctx.save()

  const cx = (skeleton.data.x ?? 0) + (skeleton.data.width ?? 0) / 2
  const cy = (skeleton.data.y ?? 0) + (skeleton.data.height ?? 0) / 2
  const fit =
    Math.min(width / (skeleton.data.width ?? 1), height / (skeleton.data.height ?? 1)) * 0.92
  ctx.translate(width / 2, height / 2)
  ctx.scale(fit, -fit) // Spine is Y-up; canvas is Y-down.
  ctx.translate(-cx, -cy)

  const page = atlas.pages[0]
  const pageW = page?.width ?? 1
  const pageH = page?.height ?? 1

  for (const slot of skeleton.slots) {
    const attName = slot.attachment
    if (!attName) continue
    const att = skeleton.findAttachment(slot.data.name, attName)
    if (!att) continue
    const geo = computeAttachmentWorld(att, slot, skeleton, atlas, attName)
    if (!geo) continue
    drawTexturedTriangles(ctx, geo.world, geo.uvs, geo.triangles, atlasImg, pageW, pageH)
  }

  // Faint bone overlay.
  ctx.lineWidth = 1 / fit
  ctx.strokeStyle = 'rgba(120, 170, 255, 0.35)'
  ctx.beginPath()
  for (const bone of skeleton.bones) {
    const len = bone.data.length ?? 0
    ctx.moveTo(bone.worldX, bone.worldY)
    ctx.lineTo(bone.a * len + bone.worldX, bone.c * len + bone.worldY)
  }
  ctx.stroke()

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Canvas component
// ---------------------------------------------------------------------------

const viewer = (props: { width: number; height: number }) => {
  return (parent: CanvasNode) => {
    const node = createNode(parent, {
      deps: () => [frame.value] as unknown[],
      draw: (ctx) => {
        if (state) state.apply()
        drawSkeleton(ctx, props.width, props.height)
      }
    })
    return () => node.remove()
  }
}

// ---------------------------------------------------------------------------
// Character loading
// ---------------------------------------------------------------------------

async function loadCharacter(char: string): Promise<void> {
  if (!char) return
  setValue(status, `Loading ${char}…`)
  setValue(loaded, false)
  try {
    const base = `${RAW_BASE}/${char}`
    const [skelResp, atlasResp] = await Promise.all([
      fetch(`${base}/${char}_00.skel`),
      fetch(`${base}/${char}_00.atlas`)
    ])
    if (!skelResp.ok || !atlasResp.ok) throw new Error(`HTTP ${skelResp.status}/${atlasResp.status}`)
    const skelBuf = new Uint8Array(await skelResp.arrayBuffer())
    const atlasText = await atlasResp.text()

    const parsedAtlas = parseSpineAtlas(atlasText)
    const data: SkeletonData = parseSpineBinary(skelBuf)

    // The atlas header's first line names the packed PNG.
    const pngName = atlasText.split('\n')[0].trim()
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image load failed'))
      img.src = `${base}/${pngName}`
    })

    skeleton = new Skeleton(data)
    atlas = parsedAtlas
    atlasImg = img
    state = new AnimationState(skeleton)
    const names = state.animationNames
    if (names.length) {
      state.setAnimation(names[0], true)
      setValue(currentAnim, names[0])
    } else {
      setValue(currentAnim, '')
    }
    setValue(selectedChar, char)
    setValue(status, '')
    setValue(loaded, true)
    refreshAnimItems()
  } catch (err) {
    setValue(status, `Failed to load "${char}": ${(err as Error).message}`)
    setValue(loaded, false)
  }
}

// ---------------------------------------------------------------------------
// UI construction
// ---------------------------------------------------------------------------

const backLink = a({
  href: './index.html',
  class: 'back-link',
  children: ['← Back to Examples']
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ children: ['🎭 Spine Character Viewer'] }),
    p({
      children: [
        'Live binary (.skel) parsing + pose evaluation from @rasenjs/spine, rendered with @rasenjs/canvas-2d. Assets stream from the Nikke-db GitHub repo.'
      ]
    })
  ]
})

// Character list — reactive via `each` (no manual DOM patching).
// `characters` holds plain strings; wrap each as an object so `each` can
// track by identity (it requires object items).
type CharItem = { name: string }
const charItems = ref<CharItem[]>([])
watch(
  () => characters.value,
  (list: string[]) => setValue(charItems, list.map((name) => ({ name }))),
  { immediate: true }
)
const charList = div({
  class: 'char-list',
  children: [
    each(charItems, (item: CharItem) =>
      button({
        class: () => 'char-item' + (item.name === selectedChar.value ? ' active' : ''),
        onClick: () => loadCharacter(item.name),
        children: [item.name]
      })
    )
  ]
})

const statusBar = div({
  class: 'status-bar',
  children: [text({ content: () => status.value })]
})

// Animation buttons — reactive via `each` over a derived object list.
type AnimItem = { name: string }
const animItems = ref<AnimItem[]>([])
function refreshAnimItems(): void {
  setValue(animItems, state ? state.animationNames.map((name) => ({ name })) : [])
}
const animButtons = div({
  class: 'anim-buttons',
  children: [
    each(animItems, (item: AnimItem) =>
      button({
        class: 'anim-btn',
        onClick: () => {
          state?.setAnimation(item.name, true)
          setValue(currentAnim, item.name)
        },
        children: [item.name]
      })
    )
  ]
})

const controls = div({
  class: 'viewer-controls',
  children: [
    div({ class: 'control-row', children: [div({ class: 'control-label', children: ['Animation'] }), text({ content: () => currentAnim.value || '—' })] }),
    animButtons
  ]
})

const stage = div({
  class: 'viewer-stage',
  children: [
    canvas({
      width: 720,
      height: 720,
      children: [viewer({ width: 720, height: 720 })]
    })
  ]
})

const card = div({
  class: 'viewer-card',
  children: [charList, stage, controls, statusBar]
})

const app = div({
  class: 'container viewer-container',
  children: [backLink, pageHeader, card]
})

mount(app, document.getElementById('app')!)

// ---------------------------------------------------------------------------
// Boot: fetch the character list, then load the first one.
// ---------------------------------------------------------------------------

async function boot(): Promise<void> {
  try {
    const resp = await fetch(GITHUB_API)
    if (!resp.ok) throw new Error(`GitHub API ${resp.status}`)
    const entries = (await resp.json()) as Array<{ name: string; type: string }>
    const dirs = entries.filter((e) => e.type === 'dir').map((e) => e.name)
    setValue(characters, dirs.length ? dirs : FALLBACK_CHARS)
  } catch {
    setValue(characters, FALLBACK_CHARS)
  }
  if (characters.value.length) {
    const first = characters.value[0]
    await loadCharacter(first)
  }
}

void boot()

// Drive the animation clock.
let lastTime = performance.now()
function tick(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now
  if (state) state.update(dt)
  setValue(frame, frame.value + 1)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
