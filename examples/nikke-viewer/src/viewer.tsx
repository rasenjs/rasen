/**
 * NIKKE Character Viewer — standalone example built with @rasenjs/dom + unocss,
 * rendered through the @rasenjs/canvas-2d Spine component.
 *
 * References the interaction/functionality of nikkeviewer.com: a left character
 * browser, a central model stage with pan/zoom, and a right control panel for
 * pose (animation) switching and background color. Assets stream live from the
 * public Nikke-db GitHub repository.
 *
 * Written in JSX (jsxImportSource: @rasenjs/dom). Reactive state uses Vue refs
 * directly (ref.value = ...), per Rasen's "bring your own reactivity" model.
 */

import { com, each, type Mountable } from '@rasenjs/core'
import { when } from '@rasenjs/dom'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-vue'
import { watch } from '@vue/reactivity'
import {
  parseSpineBinary,
  parseSpineAtlas,
  Skeleton,
  AnimationState,
  type SkeletonData,
  type SpineAtlas
} from '@rasenjs/spine'
import { spine as SpineWebgl } from '@rasenjs/webgl'
import { spine as SpineCanvas } from '@rasenjs/canvas-2d'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIEW = 1024 // logical canvas size
const GITHUB_API =
  'https://api.github.com/repos/Nikke-db/Nikke-db.github.io/contents/l2d?ref=main'
const RAW_BASE = 'https://raw.githubusercontent.com/Nikke-db/Nikke-db.github.io/main/l2d'
const FALLBACK_CHARS = ['777', 'absolute', 'acpufreeze', 'alonesurvivor', 'arcanearchive']

const BG_PRESETS: Array<{ name: string; color: string }> = [
  { name: 'Dark', color: '#0b1020' },
  { name: 'Black', color: '#000000' },
  { name: 'White', color: '#f5f5f5' },
  { name: 'Navy', color: '#0f1e3d' },
  { name: 'Green', color: '#0c2a1e' }
]

// ---------------------------------------------------------------------------
// Reactive state (Vue refs — set via .value, per Rasen conventions)
// ---------------------------------------------------------------------------

// The reactive runtime must be set before any ref() is created. viewer.tsx is
// imported (and its module-level refs instantiated) before main.tsx's body
// runs, so we bootstrap it here rather than in the entry.
useReactiveRuntime()

const characters = ref<string[]>([])
const search = ref('')
const filteredChars = ref<Array<{ name: string }>>([])
const selectedChar = ref('')
const currentAnim = ref('')
const status = ref('Loading character list…')
const loaded = ref(false)

const bg = ref('#0b1020')
const panX = ref(0)
const panY = ref(0)
const zoom = ref(1)
const showBones = ref(false)
const renderMode = ref<'webgl' | 'canvas'>('canvas')

const frame = ref(0)

// Currently loaded character runtime state.
const skeleton = ref<Skeleton | null>(null)
const atlas = ref<SpineAtlas | null>(null)
const atlasImg = ref<HTMLImageElement | null>(null)
const atlasImgs = ref<Map<string, HTMLImageElement> | null>(null)
const state = ref<AnimationState | null>(null)

/**
 * Canvas-level camera config. The spine component knows nothing about the
 * camera — it submits raw world-space vertices, and this config (consumed by
 * the WebGL projection matrix / Canvas2D ctx transform) does ALL the mapping:
 *
 *   screenX = zoom*(worldX - cam.x) + W/2
 *   screenY = H/2 - zoom*(worldY - cam.y)
 *
 * Solving against the spine fit convention
 *   screenX = (worldX - cx)*fit*zoomUser + W/2 + panUser
 * gives: zoom = fit*zoomUser, x = cx - panUser/zoom, y = cy + panUser/zoom.
 */
function updateCamera(): void {
  const sk = skeleton.value
  if (!sk || !sk.data.width) {
    camera.value = { x: 0, y: 0, zoom: 1 }
    return
  }
  const cx = (sk.data.x ?? 0) + (sk.data.width ?? 0) / 2
  const cy = (sk.data.y ?? 0) + (sk.data.height ?? 0) / 2
  const base = Math.min(VIEW / (sk.data.width ?? 1), VIEW / (sk.data.height ?? 1))
  const Z = base * 0.92 * zoom.value
  camera.value = {
    zoom: Z,
    x: cx - panX.value / Z,
    y: cy + panY.value / Z,
  }
}
const camera = ref({ x: 0, y: 0, zoom: 1 })
watch([skeleton, panX, panY, zoom], updateCamera)
updateCamera()

// Element ref for the stage (screenshot / fullscreen / pan-zoom host).
const stageRef = ref<HTMLElement | null>(null)

/** Resolve the <canvas> element rendered inside the stage. */
function getCanvas(): HTMLCanvasElement | null {
  return (stageRef.value?.querySelector('canvas') as HTMLCanvasElement | null) ?? null
}

// ---------------------------------------------------------------------------
// Character loading
// ---------------------------------------------------------------------------

async function loadCharacter(char: string): Promise<void> {
  if (!char) return
  status.value = `Loading ${char}…`
  loaded.value = false
  try {
    const base = `${RAW_BASE}/${char}`
    // Nikke-db uses inconsistent naming; try the common skeleton/atlas variants.
    const suffixes = ['_00', '_01', '', '_02', '_03']
    // Some characters use EventScene_ prefix (e.g. bsideidol → EventScene_bsideidol_01)
    const prefixes = ['', 'EventScene_']
    let skelBuf: Uint8Array | null = null
    let atlasText: string | null = null
    let usedSuffix = ''
    outer: for (const pfx of prefixes) {
      for (const sfx of suffixes) {
        const [skelResp, atlasResp] = await Promise.all([
          fetch(`${base}/${pfx}${char}${sfx}.skel`),
          fetch(`${base}/${pfx}${char}${sfx}.atlas`)
        ])
        if (skelResp.ok && atlasResp.ok) {
          skelBuf = new Uint8Array(await skelResp.arrayBuffer())
          atlasText = await atlasResp.text()
          usedSuffix = sfx
          break outer
        }
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
    for (const pngName of pageNames.length ? pageNames : [`${char}${usedSuffix}.png`]) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error(`image load failed: ${pngName}`))
        img.src = `${base}/${pngName}`
      })
      pageImgs.set(pngName, img)
    }
    const img = pageImgs.values().next().value as HTMLImageElement

    skeleton.value = new Skeleton(data)
    atlas.value = parsedAtlas
    atlasImg.value = img
    atlasImgs.value = pageImgs
    state.value = new AnimationState(skeleton.value)
    const names = state.value.animationNames
    if (names.length) {
      state.value.setAnimation(names[0], true)
      currentAnim.value = names[0]
    } else {
      currentAnim.value = ''
    }
    selectedChar.value = char
    status.value = ''
    loaded.value = true
    refreshAnimItems()
  } catch (err) {
    status.value = `Failed to load "${char}": ${(err as Error).message}`
    loaded.value = false
  }
}

// ---------------------------------------------------------------------------
// Components — each stateful piece is wrapped in com() so its reactive
// bindings live in their own effect scope (Rasen idiom; not React-style
// module-level JSX constants concatenated together).
// ---------------------------------------------------------------------------

let dragging = false
let lastX = 0
let lastY = 0

const Sidebar = com(() => (
  <div class="w-72 shrink-0 bg-neutral-900/80 border-r border-white/5 flex flex-col h-full">
    <div class="flex items-center gap-3 px-5 py-5 border-b border-white/5">
      <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-400 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-brand-500/30">
        R
      </div>
      <div class="leading-tight">
        <div class="text-white font-semibold text-[15px]">Rasen</div>
        <div class="text-neutral-400 text-xs">NIKKE Viewer</div>
      </div>
    </div>
    <div class="px-3 py-3">
      <input
        class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-brand-500 focus:bg-white/10 transition"
        placeholder="Search characters…"
        value={search}
        onInput={(e: Event) => (search.value = (e.target as HTMLInputElement).value)}
      />
    </div>
    <div class="flex-1 overflow-y-auto px-3 py-2 space-y-1">
      {each(filteredChars, (item: { name: string }) => (
        <button
          class={() =>
            'w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center gap-2 ' +
            (item.name === selectedChar.value
              ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
              : 'text-neutral-300 hover:bg-white/5')
          }
          onClick={() => loadCharacter(item.name)}
        >
          <span class="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
          <span>{item.name}</span>
        </button>
      ))}
    </div>
  </div>
))

const TopBar = com(() => (
  <div class="flex items-center justify-between px-6 py-4 border-b border-white/5">
    <div class="leading-tight">
      <h1 class="text-white font-semibold text-lg">Character Viewer</h1>
      <p class="text-neutral-400 text-xs mt-0.5">
        {() => (selectedChar.value ? selectedChar.value : 'No character selected')}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="px-3 py-2 rounded-lg text-sm bg-white/5 text-neutral-200 hover:bg-white/10 transition flex items-center gap-2"
        onClick={() => saveScreenshot()}
      >
        {iconCamera()}
        <span>Screenshot</span>
      </button>
      <button
        class="px-3 py-2 rounded-lg text-sm bg-white/5 text-neutral-200 hover:bg-white/10 transition flex items-center gap-2"
        onClick={() => stageRef.value?.requestFullscreen()}
      >
        {iconExpand()}
        <span>Fullscreen</span>
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
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    }}
    onPointerMove={(e: PointerEvent) => {
      const cv = getCanvas()
      if (!dragging || !cv) return
      const rect = cv.getBoundingClientRect()
      const scale = Math.min(rect.width, rect.height) / VIEW || 1
      panX.value = panX.value + (e.clientX - lastX) / scale
      panY.value = panY.value + (e.clientY - lastY) / scale
      lastX = e.clientX
      lastY = e.clientY
    }}
    onPointerUp={() => {
      dragging = false
    }}
    onPointerLeave={() => {
      dragging = false
    }}
    onWheel={(e: WheelEvent) => {
      e.preventDefault()
      const next = Math.min(5, Math.max(0.3, zoom.value * (1 - e.deltaY * 0.001)))
      zoom.value = next
    }}
  >
    {when({
      condition: () => renderMode.value === 'webgl',
      then: () => (
        <canvas
          className="max-w-full max-h-full select-none touch-none"
          width={VIEW}
          height={VIEW}
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
            width={VIEW}
            height={VIEW}
            skipTonemap={true}
          />
        </canvas>
      ),
      else: () => (
        <canvas
          className="max-w-full max-h-full select-none touch-none"
          width={VIEW}
          height={VIEW}
          contextType="2d"
        >
          <SpineCanvas
            skeleton={skeleton}
            atlas={atlas}
            atlasImg={atlasImg}
            state={state}
            animation={currentAnim}
            showBones={showBones}
            frame={frame}
            width={VIEW}
            height={VIEW}
            camera={camera}
            bg={bg}
          />
        </canvas>
      )
    })}
    {when({
      condition: () => !loaded.value,
      then: () => (
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-500 pointer-events-none transition">
          {iconUser()}
          <p>{() => status.value || 'Select a character to begin'}</p>
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

const ControlPanel = com(() => (
  <div class="w-72 shrink-0 bg-neutral-900/80 border-l border-white/5 flex flex-col gap-6 p-5 overflow-y-auto">
    <div class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Pose</h2>
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
              state.value?.setAnimation(item.name, true)
              currentAnim.value = item.name
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
    <div class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Background</h2>
      <div class="flex flex-wrap gap-2 items-center">
        {each(BG_PRESETS, (p: { name: string; color: string }) => (
          <button
            class={
              'w-8 h-8 rounded-lg border-2 transition hover:scale-105 ' +
              (bg.value.toLowerCase() === p.color.toLowerCase() ? 'border-brand-400' : 'border-white/10')
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
      <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Renderer</h2>
      <div class="flex rounded-lg overflow-hidden border border-white/10">
        <button
          class={() => 'flex-1 px-3 py-1.5 text-xs transition ' + (renderMode.value === 'webgl' ? 'bg-brand-600 text-white' : 'bg-white/5 text-neutral-400 hover:bg-white/10')}
          onClick={() => (renderMode.value = 'webgl')}
        >WebGL</button>
        <button
          class={() => 'flex-1 px-3 py-1.5 text-xs transition ' + (renderMode.value === 'canvas' ? 'bg-brand-600 text-white' : 'bg-white/5 text-neutral-400 hover:bg-white/10')}
          onClick={() => (renderMode.value = 'canvas')}
        >Canvas 2D</button>
      </div>
    </div>
    <div class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">View</h2>
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
        class="w-full px-3 py-2 rounded-lg text-sm bg-white/5 text-neutral-200 hover:bg-white/10 transition flex items-center gap-2"
        onClick={() => (showBones.value = !showBones.value)}
      >
        <span>{() => (showBones.value ? 'Hide' : 'Show')}</span>
        <span>bones</span>
      </button>
    </div>
  </div>
))

const App = com(() => (
  <div class="h-screen w-screen flex bg-neutral-950 text-neutral-200 font-sans overflow-hidden">
    <Sidebar />
    <div class="flex-1 flex flex-col min-w-0">
      <TopBar />
      <Stage />
    </div>
    <ControlPanel />
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

watch(
  () => [characters.value, search.value] as unknown,
  () => {
    const q = search.value.trim().toLowerCase()
    filteredChars.value = (q ? characters.value.filter((c) => c.toLowerCase().includes(q)) : characters.value).map(
      (name) => ({ name })
    )
  },
  { immediate: true }
)

async function boot(): Promise<void> {
  try {
    const resp = await fetch(GITHUB_API)
    if (!resp.ok) throw new Error(`GitHub API ${resp.status}`)
    const entries = (await resp.json()) as Array<{ name: string; type: string }>
    const dirs = entries.filter((e) => e.type === 'dir').map((e) => e.name)
    characters.value = dirs.length ? dirs : FALLBACK_CHARS
  } catch {
    characters.value = FALLBACK_CHARS
  }
  if (characters.value.length) {
    // Support ?char=xxx URL parameter to load a specific character
    const params = new URLSearchParams(location.search)
    const charParam = params.get('char')
    const targetChar = charParam && characters.value.includes(charParam) ? charParam : characters.value[0]
    await loadCharacter(targetChar)
  }
}

void boot()

let lastTime = performance.now()
function tick(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now
  if (state.value) {
    state.value.update(dt)
    state.value.apply()
  }
  frame.value = frame.value + 1
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
