/**
 * Spine Character Viewer — live validation of @rasenjs/assets's binary (.skel)
 * support.
 *
 * Assets are fetched in real time from the public Nikke-db GitHub repository
 * (https://github.com/Nikke-db/Nikke-db.github.io, `l2d/<character>/` folder).
 * Each character ships a Spine 4.1 binary skeleton (`<char>_00.skel`), a packed
 * atlas (`<char>_00.atlas`) and a PNG. We parse the binary skeleton with the
 * self-developed `parseSpineBinary` reader, evaluate poses with the rasen
 * runtime, and render through the @rasenjs/canvas-2d `spine` component (the
 * renderer itself lives in the host package — no per-demo copy).
 */

import { spine as Spine } from '@rasenjs/canvas-2d'
import {
  parseSpineBinary,
  parseSpineAtlas,
  Skeleton,
  AnimationState,
  type SkeletonData,
  type SpineAtlas
} from '@rasenjs/assets'
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
        'Live binary (.skel) parsing + pose evaluation from @rasenjs/assets, rendered with @rasenjs/canvas-2d. Assets stream from the Nikke-db GitHub repo.'
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

// Fit the skeleton's bounding box into the 720px stage: uniform scale +
// position so the bbox center lands at the stage center. Spine is Y-up; the
// Y flip to the canvas' Y-down space happens inside the spine component.
const STAGE = 720
function fitView(): { scale: number; x: number; y: number } {
  const w = (skeleton?.data.width ?? 1) || 1
  const h = (skeleton?.data.height ?? 1) || 1
  const cx = (skeleton?.data.x ?? 0) + w / 2
  const cy = (skeleton?.data.y ?? 0) + h / 2
  const scale = Math.min(STAGE / w, STAGE / h) * 0.92
  return { scale, x: STAGE / 2 - scale * cx, y: STAGE / 2 + scale * cy }
}

const stage = div({
  class: 'viewer-stage',
  children: [
    canvas({
      width: STAGE,
      height: STAGE,
      children: [
        Spine({
          get skeleton() { return skeleton },
          get atlas() { return atlas },
          get atlasImg() { return atlasImg },
          get state() { return state },
          // Getters keep the fit reactive to the currently loaded character.
          get scale() { return fitView().scale },
          get x() { return fitView().x },
          get y() { return fitView().y },
          frame,
          width: STAGE,
          height: STAGE,
          showBones: true
        })
      ]
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
