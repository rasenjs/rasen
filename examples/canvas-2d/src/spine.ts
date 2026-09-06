/**
 * Spine Runtime example — static spineboy-pro asset rendered through the
 * @rasenjs/canvas-2d `spine` component (the renderer lives in the host
 * package; this demo only loads assets and drives the animation clock).
 */
import {
  parseSpineJson,
  parseSpineAtlas,
  Skeleton,
  AnimationState,
  type SpineAtlas
} from '@rasenjs/assets'
import { spine as Spine } from '@rasenjs/canvas-2d'
import { div, h1, p, a, button, canvas, text, mount } from '@rasenjs/dom'
import { useReactiveRuntime, ref, setValue } from '@rasenjs/reactive-vue'
import spineboy from './spineboy-pro.json'
// Vite raw import for the atlas text, and the URL of the packed PNG.
import spineboyAtlasText from '../images/spineboy.atlas?raw'
import spineboyPngUrl from '../images/spineboy.png'

useReactiveRuntime()

const atlas: SpineAtlas = parseSpineAtlas(spineboyAtlasText)
const page = atlas.pages[0]
const pageH = page?.height ?? 1

const atlasImg = new Image()
atlasImg.src = spineboyPngUrl

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

const card = div({
  class: 'example-card',
  children: [
    h1({ children: [`spineboy-pro (Spine ${data.version})`] }),
    canvas({
      width: 700,
      height: 700,
      // Camera is canvas-level (matches the WebGL examples).
      camera: { x: 0, y: pageH / 2 - 160, zoom: 1 },
      children: [
        Spine({
          skeleton, atlas, atlasImg,
          state, frame,
          width: 700, height: 700,
          showBones: true
        })
      ]
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
