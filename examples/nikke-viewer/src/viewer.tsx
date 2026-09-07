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
import {
  parseSpineBinary,
  parseSpineAtlas,
  Skeleton,
  AnimationState,
  type SkeletonData,
  type SpineAtlas
} from '@rasenjs/assets'
import { spine as SpineWebgl } from '@rasenjs/webgl'
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

async function loadCharacter(char: string, pose: PoseKind = 'fb'): Promise<void> {
  if (!char) return
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
    currentPose.value = pose
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
  } catch (err) {
    status.value = `Failed to load "${char}" (${pose}): ${(err as Error).message}`
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
              if (row.kind === 'entry') {
                loadCharacter(row.entry.id)
                return
              }
              // Level-1 character row: selecting it loads the base skin.
              // Expansion is handled exclusively by the chevron button.
              loadCharacter(row.id)
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
                  row.variants.filter((v) => v.id !== row.id),
                  (v: L2dEntry) => (
                    <div
                      class={() =>
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg transition cursor-pointer select-none ' +
                        (v.id === selectedChar.value
                          ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                          : 'text-neutral-300 hover:bg-white/5')
                      }
                      onClick={() => loadCharacter(v.id)}
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
))

const TopBar = com(() => (
  <div class="flex items-center justify-between px-6 py-4 border-b border-white/5">
    <div class="leading-tight">
      <h1 class="text-white font-semibold text-lg">Character Viewer</h1>
      <p class="text-neutral-400 text-xs mt-0.5">
        {text({ content: () => currentName.value || 'No character selected' })}
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
          camera={camera}
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
            width={VIEW}
            height={VIEW}
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
          <p>{text({ content: () => status.value || 'Select a character to begin' })}</p>
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
  <div class="w-72 shrink-0 bg-neutral-900/80 border-l border-white/5 flex flex-col gap-6 p-5 overflow-y-auto">
    <div class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Pose</h2>
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
                  loadCharacter(selectedChar.value, pose)
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
      <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Animation</h2>
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
        <span>{text({ content: () => (showBones.value ? 'Hide' : 'Show') })}</span>
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
    const resp = await fetch(L2D_NAMES_URL)
    if (!resp.ok) return map
    const list = (await resp.json()) as Array<{ id: string; name: string }>
    for (const item of list) if (item.id && item.name) map.set(item.id, item.name)
  } catch {
    /* names are optional — ids remain usable */
  }
  return map
}

async function boot(): Promise<void> {
  let dirs: string[] = []
  try {
    const resp = await fetch(GITHUB_API)
    if (!resp.ok) throw new Error(`GitHub API ${resp.status}`)
    const list = (await resp.json()) as Array<{ name: string; type: string }>
    dirs = list.filter((e) => e.type === 'dir').map((e) => e.name)
  } catch {
    dirs = FALLBACK_CHARS
  }
  const names = await loadNames()
  entries.value = dirs.map((id) => ({ id, name: names.get(id) ?? fallbackName(id) }))
  if (!entries.value.length) entries.value = FALLBACK_CHARS.map((id) => ({ id, name: id }))

  // Support ?char=xxx URL parameter to load a specific character.
  const params = new URLSearchParams(location.search)
  const charParam = params.get('char')
  const targetChar = charParam && dirs.includes(charParam) ? charParam : findDefaultChar()
  await loadCharacter(targetChar)
}

/** First loadable entry, preferring an actual character over scenes. */
function findDefaultChar(): string {
  const list = entries.value
  return (list.find((e) => /^c\d+$/.test(e.id)) ?? list[0])?.id ?? ''
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
