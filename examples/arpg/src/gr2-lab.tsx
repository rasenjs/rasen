/**
 * GR2 model lab — real Diablo II: Resurrected character models, live.
 *
 * The lab fetches `.model` containers staged under `public/original/models/`
 * (the layout `tools/copy-gr2-samples.ts` and `tools/extract-original.ts
 * models` write), decodes them at RUNTIME with `src/original/gr2.ts` — no bake
 * step — and renders the skinned meshes' bind-pose geometry with
 * `@rasenjs/gfx`, textured with each material's albedo `.texture` decoded by
 * `src/original/texture.ts`.
 *
 * What is measured versus wired:
 *
 * - **Shared loading helpers**: the material→texture link recovery, albedo
 *   decode, group expansion and the `Gr2Model` submission element now live in
 *   `src/three-d/model.ts` (copied from this file) so the 3D actor layer can
 *   reuse them; this page's behavior is unchanged.
 * - **Measured** (against the staged samples): mesh groups carry
 *   `materialIndex` into the mesh-local `materialBindings`, which is the index
 *   into `Gr2File.materials`; several groups can repeat the SAME triangle
 *   range with alternate materials (diablo's `body` vs `body_burned` skin
 *   variants), so a range is drawn once, preferring the group whose albedo
 *   resolves.
 * - **Recovered here**: `loadGr2` reports each material's `Maps` usages
 *   (`AlbedoTexture`, `ORMTexture`, …) but drops their cross-links
 *   (`material: null` — the map's link member is named `Map`, not
 *   `Material`). The linked texture path is recovered by re-walking the
 *   materialized object tree with the same exported primitives
 *   (`readContainer` + `Gr2Reader`) and reading each map target's
 *   `Texture.FromFileName`. The `_alb`/`_ALB` file-name suffix is the fallback
 *   rule when a material names its texture directly.
 * - **Fallbacks, honestly**: a material whose albedo does not resolve or whose
 *   `.texture` file is not staged renders flat gray (a 1×1 gray bitmap through
 *   the same shading path) and its name is listed on the status line. Nothing
 *   is invented.
 *
 * The `_nrm`/`_orm` channels are deliberately not wired: the renderer's
 * default program exposes no roughness/metallic inputs, and a wrong lighting
 * tweak is worse than none.
 */

import { com, type PropValue } from '@rasenjs/core'
import { mount } from '@rasenjs/dom'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { unref, type CameraConfig } from '@rasenjs/gfx'
import { loadGr2, type Gr2TriangleGroup } from '@rasenjs/assets'
import {
  Gr2Model,
  MODEL_ROOT,
  MODEL_SOURCES,
  buildPart,
  loadAlbedo,
  readMaterialTextureLinks,
  resolveAlbedo,
  type ModelSource,
  type PartSpec,
} from './three-d/model'

// ---------------------------------------------------------------------------
// Geometry: indexed GR2 groups → gfx triangle lists
// ---------------------------------------------------------------------------

function centerParts(parts: PartSpec[]): number {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (const part of parts) {
    for (let i = 0; i < part.vertices.length; i += 3) {
      minX = Math.min(minX, part.vertices[i])
      maxX = Math.max(maxX, part.vertices[i])
      minY = Math.min(minY, part.vertices[i + 1])
      maxY = Math.max(maxY, part.vertices[i + 1])
      minZ = Math.min(minZ, part.vertices[i + 2])
      maxZ = Math.max(maxZ, part.vertices[i + 2])
    }
  }
  if (!Number.isFinite(minX)) return 1
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2
  for (const part of parts) {
    for (let i = 0; i < part.vertices.length; i += 3) {
      part.vertices[i] -= cx
      part.vertices[i + 1] -= cy
      part.vertices[i + 2] -= cz
    }
  }
  return Math.max(0.5 * Math.hypot(maxX - minX, maxY - minY, maxZ - minZ), 0.001)
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

interface SceneProps {
  parts: PropValue<PartSpec[]>
  normalsMode: PropValue<boolean>
  orbit: PropValue<number>
  radius: PropValue<number>
  viewW: PropValue<number>
  viewH: PropValue<number>
}

const LabScene = com((props: SceneProps) => {
  const { parts, normalsMode, orbit, radius, viewW, viewH } = props

  // Orbit camera: eye on a circle around the origin (the model's bounds are
  // centered there), slightly above the equator. `orbit` ticks from the page's
  // rAF loop; stopping the loop freezes the camera exactly where it is.
  const camera = (): CameraConfig => {
    const angle = unref(orbit)
    const r = unref(radius)
    const distance = r * 2.8
    return {
      x: Math.sin(angle) * distance,
      y: r * 0.7,
      z: Math.cos(angle) * distance,
      target: { x: 0, y: 0, z: 0 },
      fov: Math.PI / 4,
      near: Math.max(distance / 1000, 0.01),
      far: distance * 20,
    }
  }

  return (
    <div style={{ position: 'fixed', inset: '0', background: '#101418' }}>
      <canvas
        width={viewW}
        height={viewH}
        contextType="webgl"
        contextOptions={{ preserveDrawingBuffer: true }}
        camera={camera}
        renderOptions={{ clearColor: '#101418' }}
        style={{ width: '100vw', height: '100vh', display: 'block' }}
      >
        {Gr2Model({ parts, normalsMode, orbit })}
      </canvas>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Page chrome (plain DOM) + data loading
// ---------------------------------------------------------------------------

/** The staged samples the select offers — the shared registry from three-d/model. */
const SAMPLES: ModelSource[] = MODEL_SOURCES

interface StagedSample {
  sample: ModelSource
  url: string
}

interface Gr2LabDebug {
  ready: boolean
  statusText: string
  model: string | null
  modelUrl: string | null
  meshes: number
  groups: number
  triangles: number
  texturesOk: string[]
  texturesMissing: string[]
  skippedAlternates: number
}

interface Controls {
  root: HTMLElement
  select: HTMLSelectElement
  normals: HTMLInputElement
  pause: HTMLInputElement
  status: HTMLElement
}

function buildControls(): Controls {
  const root = document.createElement('div')
  root.id = 'gr2-lab-controls'
  root.style.cssText =
    'position:fixed; top:8px; left:8px; z-index:10; display:flex; flex-wrap:wrap; gap:12px;' +
    'align-items:center; padding:8px 12px; border-radius:6px; background:rgba(12,16,24,0.85);' +
    'color:#cfd8e3; font:12px/1.5 ui-monospace, Menlo, monospace;'

  const modelLabel = document.createElement('label')
  modelLabel.textContent = 'Model '
  const select = document.createElement('select')
  select.id = 'gr2-lab-model'
  modelLabel.appendChild(select)

  const normalsLabel = document.createElement('label')
  const normals = document.createElement('input')
  normals.type = 'checkbox'
  normals.id = 'gr2-lab-normals'
  normalsLabel.appendChild(normals)
  normalsLabel.appendChild(document.createTextNode(' Show normals'))

  const pauseLabel = document.createElement('label')
  const pause = document.createElement('input')
  pause.type = 'checkbox'
  pause.id = 'gr2-lab-pause'
  pauseLabel.appendChild(pause)
  pauseLabel.appendChild(document.createTextNode(' Pause orbit'))

  const status = document.createElement('div')
  status.id = 'gr2-lab-status'
  status.style.cssText = 'flex-basis:100%; max-width:720px; color:#9fb2c8;'

  root.appendChild(modelLabel)
  root.appendChild(normalsLabel)
  root.appendChild(pauseLabel)
  root.appendChild(status)
  return { root, select, normals, pause, status }
}

function fileName(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? path : path.slice(cut + 1)
}

async function probeSamples(): Promise<StagedSample[]> {
  const staged: StagedSample[] = []
  for (const sample of SAMPLES) {
    for (const url of sample.urls) {
      try {
        const res = await fetch(MODEL_ROOT + url, { method: 'HEAD' })
        if (res.ok) {
          staged.push({ sample, url: MODEL_ROOT + url })
          break
        }
      } catch {
        // Server refused the probe — treat as absent and try the next layout.
      }
    }
  }
  return staged
}

function main(): void {
  useReactiveRuntime()

  const parts = ref<PartSpec[]>([])
  const normalsMode = ref(false)
  const paused = ref(false)
  const orbit = ref(0)
  const radius = ref(1)
  const viewW = ref(window.innerWidth)
  const viewH = ref(window.innerHeight)
  window.addEventListener('resize', () => {
    viewW.value = window.innerWidth
    viewH.value = window.innerHeight
  })

  const controls = buildControls()
  document.body.appendChild(controls.root)
  const appRoot = document.createElement('div')
  document.body.appendChild(appRoot)
  mount(LabScene({ parts, normalsMode, orbit, radius, viewW, viewH }), appRoot)

  const debug: Gr2LabDebug = {
    ready: false,
    statusText: 'Probing staged samples…',
    model: null,
    modelUrl: null,
    meshes: 0,
    groups: 0,
    triangles: 0,
    texturesOk: [],
    texturesMissing: [],
    skippedAlternates: 0,
  }
  ;(window as unknown as { __gr2Lab: Gr2LabDebug }).__gr2Lab = debug

  const setStatus = (text: string): void => {
    debug.statusText = text
    controls.status.textContent = text
  }
  setStatus(debug.statusText)

  controls.normals.addEventListener('change', () => {
    normalsMode.value = controls.normals.checked
  })
  controls.pause.addEventListener('change', () => {
    paused.value = controls.pause.checked
  })

  // Orbit loop — the only animation on the page. The element's reactive deps
  // see `orbit`, so each tick schedules a redraw with a new camera position.
  let last = performance.now()
  const tick = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    if (!paused.value) orbit.value = (orbit.value + dt * 0.35) % (Math.PI * 2)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  let loadSequence = 0
  const loadSelected = async (): Promise<void> => {
    const staged = stagedSamples[controls.select.selectedIndex]
    if (!staged) return
    const sequence = ++loadSequence
    debug.ready = false
    setStatus(`Loading ${staged.sample.label}…`)

    let bytes: Uint8Array
    try {
      const res = await fetch(staged.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      bytes = new Uint8Array(await res.arrayBuffer())
    } catch (error) {
      if (sequence !== loadSequence) return
      setStatus(`Failed to load ${fileName(staged.url)}: ${String(error)}`)
      return
    }

    const file = loadGr2(bytes)
    const links = readMaterialTextureLinks(bytes)

    const built: PartSpec[] = []
    const ok = new Set<string>()
    const missing = new Set<string>()
    let triangles = 0
    let drawnGroups = 0
    let skippedAlternates = 0

    for (const mesh of file.meshes) {
      // Groups can repeat one triangle range with alternate materials (skin
      // variants). A range is drawn once — prefer the group whose albedo
      // resolves to a real texture over a gray one.
      const byRange = new Map<string, { group: Gr2TriangleGroup; textureSource: HTMLCanvasElement | null }>()
      for (const group of mesh.groups) {
        const materialIndex = mesh.materialBindings[group.materialIndex] ?? group.materialIndex
        const material = file.materials[materialIndex]
        const albedoPath = resolveAlbedo(links[materialIndex], material)
        const textureSource = albedoPath === null ? null : await loadAlbedo(albedoPath)
        const name = albedoPath !== null ? fileName(albedoPath) : `${material?.name ?? 'unnamed'} (no albedo named)`
        if (textureSource !== null) ok.add(name)
        else missing.add(name)

        const key = `${group.triFirst}:${group.triCount}`
        const previous = byRange.get(key)
        if (!previous) {
          byRange.set(key, { group, textureSource })
        } else {
          skippedAlternates += 1
          if (previous.textureSource === null && textureSource !== null) {
            byRange.set(key, { group, textureSource })
          }
        }
      }
      for (const entry of byRange.values()) {
        built.push(buildPart(mesh, entry.group, entry.textureSource))
        triangles += entry.group.triCount
        drawnGroups += 1
      }
    }

    if (sequence !== loadSequence) return

    const modelRadius = centerParts(built)
    parts.value = built
    radius.value = modelRadius

    debug.ready = true
    debug.model = staged.sample.label
    debug.modelUrl = staged.url
    debug.meshes = file.meshes.length
    debug.groups = drawnGroups
    debug.triangles = triangles
    debug.texturesOk = [...ok].sort()
    debug.texturesMissing = [...missing].sort()
    debug.skippedAlternates = skippedAlternates

    const missingText = debug.texturesMissing.length > 0 ? debug.texturesMissing.join(', ') : 'none'
    setStatus(
      `${staged.sample.label} — ${file.meshes.length} meshes · ${drawnGroups} groups · ` +
        `${triangles.toLocaleString('en-US')} triangles. ` +
        `Textures resolved: ${debug.texturesOk.join(', ') || 'none'}. ` +
        `Gray fallback: ${missingText}` +
        (skippedAlternates > 0 ? ` (${skippedAlternates} alternate-material groups skipped)` : ''),
    )
  }

  let stagedSamples: StagedSample[] = []
  void probeSamples().then((staged) => {
    stagedSamples = staged
    if (staged.length === 0) {
      setStatus('No staged samples found — run tools/copy-gr2-samples.ts (or tools/extract-original.ts models).')
      return
    }
    for (const entry of staged) {
      const option = document.createElement('option')
      option.textContent = entry.sample.label
      controls.select.appendChild(option)
    }
    controls.select.addEventListener('change', () => void loadSelected())
    void loadSelected()
  })
}

main()
