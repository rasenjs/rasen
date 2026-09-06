import { createNode, type CanvasNode, type Context2D } from '@rasenjs/canvas-2d'
import {
  parseSpineJson,
  parseSpineAtlas,
  computeAttachmentWorld,
  Skeleton,
  AnimationState,
  type Bone,
  type AttachmentData
} from '@rasenjs/spine'
import { div, h1, p, a, button, canvas, text, mount } from '@rasenjs/dom'
import { useReactiveRuntime, ref, setValue } from '@rasenjs/reactive-vue'
import spineboy from './spineboy-pro.json'
// Vite raw import for the atlas text, and the URL of the packed PNG.
import spineboyAtlasText from '../images/spineboy.atlas?raw'
import spineboyPngUrl from '../images/spineboy.png'

useReactiveRuntime()

const atlas = parseSpineAtlas(spineboyAtlasText)
const page = atlas.pages[0]
const pageW = page?.width ?? 1
const pageH = page?.height ?? 1

// The texture loads asynchronously. We keep a reactive flag so the canvas
// re-renders (textured instead of wireframe) the moment the PNG is ready.
const atlasReady = ref(false)
const atlasImg = new Image()
atlasImg.onload = () => setValue(atlasReady, true)
atlasImg.src = spineboyPngUrl

/**
 * Draw a textured polygon (region quad or mesh) by mapping each source
 * triangle in the atlas onto its world-space triangle.
 *
 * A general 4-corner (or N-corner) texture mapping needs a projective
 * transform, which Canvas2D cannot do directly. We instead split the polygon
 * into triangles and draw each with an affine transform (3 points define a
 * unique affine) while clipping to the destination triangle. Because the
 * affine is bijective, only the source triangle's pixels land inside the
 * clip — rotation in the atlas is handled for free.
 */
function drawTexturedTriangles(
  ctx: Context2D,
  world: number[],
  uvs: number[],
  triangles: number[],
  img: HTMLImageElement | ImageBitmap
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
    // Compose on top of the current (fit) transform: atlas pixel -> world.
    ctx.transform(a, b, c, d, e, f)
    ctx.drawImage(img, 0, 0)
    ctx.restore()
  }
}

/**
 * Compute world-space vertices for an attachment.
 *
 * - region / linkedmesh without a `vertices` array: build the 4 corners from
 *   x/y/rotation/width/height in the slot bone's local space, then apply the
 *   bone world matrix.
 * - mesh / boundingbox / path: the `vertices` array is a flat, per-vertex
 *   weighted list `[boneCount, boneIndex, x, y, weight, ...]`; we accumulate
 *   each bone's world transform weighted by its influence.
 */
function computeWorldVertices(
  att: AttachmentData,
  bone: Bone,
  skeleton: Skeleton
): number[] {
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
      const b2 = skeleton.bones[boneIndex]
      if (b2) {
        wx += (b2.a * vx + b2.b * vy + b2.worldX) * weight
        wy += (b2.c * vx + b2.d * vy + b2.worldY) * weight
      }
    }
    out.push(wx, wy)
  }
  return out
}

function drawSkeleton(ctx: Context2D, skeleton: Skeleton, width: number, height: number): void {
  ctx.save()

  // Fit the skeleton bounds into the canvas.
  const cx = (skeleton.data.x ?? 0) + (skeleton.data.width ?? 0) / 2
  const cy = (skeleton.data.y ?? 0) + (skeleton.data.height ?? 0) / 2
  const fit = Math.min(width / (skeleton.data.width ?? 1), height / (skeleton.data.height ?? 1)) * 0.92
  ctx.translate(width / 2, height / 2)
  // Spine skeletons are authored Y-up (head at +Y); the canvas is Y-down,
  // so flip Y to keep the character upright.
  ctx.scale(fit, -fit)
  ctx.translate(-cx, -cy)

  // Textured attachments (regions + meshes) from the real atlas.
  if (atlasReady.value) {
    for (const slot of skeleton.slots) {
      const attName = slot.attachment
      if (!attName) continue
      const att = skeleton.findAttachment(slot.data.name, attName)
      if (!att) continue
      const geo = computeAttachmentWorld(att, slot, skeleton, atlas, attName)
      if (!geo) continue
      drawTexturedTriangles(ctx, geo.world, geo.uvs, geo.triangles, atlasImg)
    }
  } else {
    // Fallback wireframe when the texture failed to load.
    drawWireframe(ctx, skeleton, fit)
  }

  // Faint bone overlay so joint positions stay visible on top of the texture.
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

/** Yellow polygon wireframe used as a fallback when no texture is available. */
function drawWireframe(ctx: Context2D, skeleton: Skeleton, fit: number): void {
  for (const slot of skeleton.slots) {
    const attName = slot.attachment
    if (!attName) continue
    const att = skeleton.findAttachment(slot.data.name, attName)
    if (!att) continue
    if (att.type === 'linkedmesh') continue
    const verts = computeWorldVertices(att, slot.bone, skeleton)
    if (verts.length < 4) continue
    ctx.beginPath()
    ctx.moveTo(verts[0], verts[1])
    for (let k = 2; k < verts.length; k += 2) ctx.lineTo(verts[k], verts[k + 1])
    ctx.closePath()
    if (att.type === 'boundingbox') {
      ctx.strokeStyle = 'rgba(255, 120, 120, 0.6)'
      ctx.lineWidth = 1.5 / fit
      ctx.stroke()
    } else {
      ctx.fillStyle = 'rgba(255, 209, 102, 0.22)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)'
      ctx.lineWidth = 1 / fit
      ctx.stroke()
    }
  }
}

/** Rasen canvas-2d component that renders an animated Spine skeleton. */
const spine = (props: { skeleton: Skeleton; width: number; height: number }) => {
  return (parent: CanvasNode) => {
    const node = createNode(parent, {
      // Subscribe to the frame counter so the canvas redraws every tick.
      deps: () => frame.value,
      draw: (ctx) => {
        state.apply()
        drawSkeleton(ctx, props.skeleton, props.width, props.height)
      }
    })
    return () => node.remove()
  }
}

const backLink = a({
  href: './index.html',
  class: 'back-link',
  children: ['← Back to Examples']
})

const pageHeader = div({
  class: 'page-header',
  children: [
    h1({ children: ['🦴 Spine Runtime'] }),
    p({
      children: [
        'Self-developed Spine parser + pose evaluation, rendered with the real spineboy-pro atlas via @rasenjs/canvas-2d'
      ]
    })
  ]
})

const data = parseSpineJson(spineboy as Parameters<typeof parseSpineJson>[0])
const skeleton = new Skeleton(data)

// Animation playback state.
const state = new AnimationState(skeleton)
state.setAnimation('idle', true)

// Reactive frame counter — bumped every rAF tick to drive canvas redraws.
const frame = ref(0)
const currentAnim = ref('idle')

// Animation control buttons — one per available animation.
const animButtons = state.animationNames.map((name) =>
  button({
    class: 'anim-btn',
    onClick: () => {
      state.setAnimation(name, true)
      setValue(currentAnim, name)
    },
    children: [name]
  })
)

const controls = div({
  class: 'anim-controls',
  children: [
    div({ class: 'anim-label', children: [text({ content: () => `当前动画: ${currentAnim.value}` })] }),
    div({ class: 'anim-buttons', children: animButtons })
  ]
})

const card = div({
  class: 'example-card',
  children: [
    h1({ children: [`spineboy-pro (Spine ${data.version})`] }),
    canvas({
      width: 700,
      height: 700,
      children: [spine({ skeleton, width: 700, height: 700 })]
    }),
    controls,
    p({
      class: 'example-description',
      children: [
        'Textured regions + meshes from the official spineboy-pro atlas, rendered via @rasenjs/canvas-2d. Bones are drawn faintly on top. Click an animation button to pose the skeleton through its real Spine timelines (bone transforms, slot attachments, IK constraints).'
      ]
    })
  ]
})

const app = div({
  class: 'container',
  children: [backLink, pageHeader, div({ class: 'examples-grid', children: [card] })]
})

mount(app, document.getElementById('app')!)

// Drive the animation clock with requestAnimationFrame. Each tick advances the
// active animation and bumps the reactive frame counter, which re-renders the
// canvas via the reactive dependency established inside the draw callback.
let lastTime = performance.now()
function tick(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now
  state.update(dt)
  setValue(frame, frame.value + 1)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
