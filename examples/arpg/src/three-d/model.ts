/**
 * GR2 model loading and submission for the 3D actor layer.
 *
 * Everything below the "extracted" divider is copied from
 * `../gr2-lab.tsx`, which developed and verified it against the staged D2R
 * samples (material→texture link recovery, albedo resolution/decoding,
 * triangle-group expansion and the `Gr2Model` submission element). The lab
 * imports these helpers from here now; behavior is unchanged. New code in
 * this file only sits on top of them: the model-source registry and a cached
 * loader (`loadModelParts`) so actors can share one decode per model across
 * renders and re-mounts.
 *
 * The originals' honest fallbacks are kept: a material whose albedo does not
 * resolve (or whose `.texture` is not staged) renders flat gray through the
 * same shading path. The `_nrm`/`_orm` channels stay unwired — the renderer's
 * default program exposes no roughness/metallic inputs.
 */

import {
  Gr2Reader,
  asArray,
  asObject,
  asString,
  isGr2,
  loadGr2,
  readContainer,
  type Gr2BoneBinding,
  type Gr2Material,
  type Gr2Mesh,
  type Gr2TriangleGroup,
} from '@rasenjs/assets'
import { decodeTexture } from '@rasenjs/assets'
import type { PropValue } from '@rasenjs/core'
import { element, unref, type GfxNode, type RawPixelSource } from '@rasenjs/gfx'
import { drawCharacter } from './character-material'
import { convexHull } from '@rasenjs/math'
import type { GroundOutline } from './ground-outline'
import { LIGHT_DIRECTION } from './lighting'

// ---------------------------------------------------------------------------
// Model sources (what `modelKey` names)
// ---------------------------------------------------------------------------

/** One staged model: an id, a label and candidate in-package URLs. */
export interface ModelSource {
  id: string
  label: string
  /** Candidate URLs under `MODEL_ROOT`, most likely in-package layout first. */
  urls: string[]
  /**
   * Candidate URLs of the unit definition's own `.skeleton` (its
   * `SkeletonDefinitionComponent` file), when one is staged. The verifier loads
   * these to check the bones; the renderer keeps bind pose and needs none.
   */
  skeletonUrls?: string[]
}

/**
 * The staged samples `loadModelKeys` can load, in the order the gr2 lab lists
 * them (moved here from `../gr2-lab.tsx` so both pages share one registry).
 */

/**
 * The monster unit definitions the game spawns, by its own `MonsterKind`
 * (`game.ts`): the retail id (`data/hd/character/enemy/<id>.json`) and the
 * body parts that definition's entities name. Body parts come in `lit`/`med`/
 * `hvy` armour variants; `lit` is the choice the hero's parts make. Weapon
 * and shield parts (skeleton1's `rhand`/`shield`) ship no model file in the
 * package at any LOD and are absent here by the same rule as rogue1's bow.
 */
export const MONSTER_PART_MODELS: Record<string, { id: string; parts: string[] }> = {
  skeleton: { id: 'skeleton1', parts: ['head', 'torso', 'legs', 'rarm', 'larm'] },
  zombie: { id: 'zombie1', parts: ['head', 'torso', 'legs', 'rarm', 'larm'] },
  // The boss: one `torso` part carries the whole body (like diablo's).
  brute: { id: 'brute2', parts: ['torso'] },
}

/** One {@link ModelSource} per monster part, from {@link MONSTER_PART_MODELS}. */
function enemyPartSources(): ModelSource[] {
  return Object.values(MONSTER_PART_MODELS).flatMap(({ id, parts }) =>
    parts.map((part) => ({
      id: `${id}-${part}`,
      label: `${id} ${part}`,
      urls: [
        `data/hd/character/enemy/${id}/${part}_lit_lod3.model`,
        `data/hd/character/enemy/${id}/${part}_lod3.model`,
        `data/hd/character/enemy/${id}/models/${part}_lit_lod3.model`,
      ],
      skeletonUrls: [`data/hd/character/enemy/${id}/skeleton/${id}.skeleton`],
    })),
  )
}

/**
 * The environment props the game's `PROP_KINDS` stand for that ship an HD 3D
 * model of their own (rock, brazier, bones, pillar). `pine`/`deadTree` are
 * terrain-tile geometry in the package, not placeable props, so they keep
 * their drawn sprites — the rule, not a fallback.
 *
 * `hd/env/model/...` is the in-package home; `hd/env/texture/.../models/...`
 * is where `tools/copy-gr2-samples.ts` stages a research dump (it derives the
 * model directory from the texture paths the model itself records).
 */
export const PROP_PART_MODELS: Record<string, string> = {
  rock: 'prop-rock',
  brazier: 'prop-brazier',
  bones: 'prop-bones',
  pillar: 'prop-pillar',
}

const PROP_MODEL_URLS: Record<string, readonly [string, string]> = {
  rock: [
    'data/hd/env/texture/act1/caves/models/rocks01_lod3.model',
    'hd/env/model/global/prop/act1/caves/act1_caves_rocks/rocks01_lod3.model',
  ],
  brazier: [
    'data/hd/env/texture/act1/monastry/act1_monastry_architecture/models/wall_brazier01_lod3.model',
    'hd/env/model/global/prop/act1/monastry/act1_monastry_wall_props/wall_brazier01_lod3.model',
  ],
  bones: [
    'data/hd/env/texture/act1/outdoors/act1_outdoors_markers/models/skull01_lod3.model',
    'hd/env/model/global/prop/act1/outdoors/act1_outdoors_bones/skull01_lod3.model',
  ],
  pillar: [
    'data/hd/env/texture/act1/cathedrl/act1_cathedral_walls/models/pillar_capitol01_lod3.model',
    'hd/env/model/global/prop/act1/cathedrl/act1_cathedrl_debris/pillar_capitol01_lod3.model',
  ],
}

/** One {@link ModelSource} per HD prop, from {@link PROP_MODEL_URLS}. */
function propSources(): ModelSource[] {
  return Object.entries(PROP_PART_MODELS).map(([kind, id]) => ({
    id,
    label: `prop ${kind}`,
    urls: [...PROP_MODEL_URLS[kind]],
  }))
}

export const MODEL_SOURCES: ModelSource[] = [
  {
    id: 'diablo-torso',
    label: 'Diablo torso',
    urls: [
      'data/hd/character/enemy/diablo/torso.model',
      'data/hd/character/enemy/diablo/torso_lod3.model',
      'data/hd/character/enemy/diablo/models/torso.model',
    ],
  },
  {
    id: 'amazon-head',
    label: 'Amazon head',
    urls: [
      'data/hd/character/player/amazon/models/head_lod3.model',
      'data/hd/character/player/amazon/head_lod3.model',
    ],
  },
  {
    id: 'amazon-torso',
    label: 'Amazon torso',
    urls: [
      'data/hd/character/player/amazon/models/torso_lit_lod3.model',
      'data/hd/character/player/amazon/torso_lit_lod3.model',
    ],
  },
  {
    id: 'amazon-legs',
    label: 'Amazon legs',
    urls: [
      'data/hd/character/player/amazon/models/legs_lit_lod3.model',
      'data/hd/character/player/amazon/legs_lit_lod3.model',
    ],
  },
  {
    id: 'amazon-left-arm',
    label: 'Amazon left arm',
    urls: [
      'data/hd/character/player/amazon/models/larm_lit_lod3.model',
      'data/hd/character/player/amazon/larm_lit_lod3.model',
    ],
  },
  {
    id: 'amazon-right-arm',
    label: 'Amazon right arm',
    urls: [
      'data/hd/character/player/amazon/models/rarm_lit_lod3.model',
      'data/hd/character/player/amazon/rarm_lit_lod3.model',
    ],
  },
  // Town NPCs, one entry per PART of the retail unit definition's own part
  // scheme (`data/hd/character/npc/<id>.json`'s `UnitPartComponent.part`), the
  // way the amazon entries above follow `data/hd/character/player/amazon`'s.
  // Where a part offers variants the definition switches between by equipment
  // (rogue1's `special1` is `lit` or `med` shoulder armour), the `lit` variant
  // is registered — the same choice the hero's parts make.
  //
  // Every path here is the `_lod3` file the package actually ships for that
  // dependency name (the unit definitions list the unsuffixed `torso.model`).
  // rogue1's `lhand` (bow) and `special2` parts have NO file in the package at
  // any LOD, so they get no entry and the report of `tools/verify-npc-models.ts`
  // names them instead of standing in another character's model.
  {
    id: 'gheed-torso',
    label: 'Gheed torso',
    urls: [
      'data/hd/character/npc/gheed/torso_lod3.model',
      'data/hd/character/npc/gheed/models/torso_lod3.model',
    ],
    skeletonUrls: ['data/hd/character/npc/gheed/skeleton/gheed.skeleton'],
  },
  {
    id: 'akara-torso',
    label: 'Akara torso',
    urls: [
      'data/hd/character/npc/akara/torso_lod3.model',
      'data/hd/character/npc/akara/models/torso_lod3.model',
    ],
    skeletonUrls: ['data/hd/character/npc/akara/skeleton/akara.skeleton'],
  },
  {
    id: 'kashya-torso',
    label: 'Kashya torso',
    urls: [
      'data/hd/character/npc/kashya/torso_lod3.model',
      'data/hd/character/npc/kashya/models/torso_lod3.model',
    ],
    skeletonUrls: ['data/hd/character/npc/kashya/skeleton/kashya.skeleton'],
  },
  {
    id: 'charsi-torso',
    label: 'Charsi torso',
    urls: [
      'data/hd/character/npc/charsi/torso_lod3.model',
      'data/hd/character/npc/charsi/models/torso_lod3.model',
    ],
    skeletonUrls: ['data/hd/character/npc/charsi/skeleton/charsi.skeleton'],
  },
  {
    id: 'warriv1-torso',
    label: 'Warriv torso',
    urls: [
      'data/hd/character/npc/warriv1/torso_lod3.model',
      'data/hd/character/npc/warriv1/models/torso_lod3.model',
    ],
    skeletonUrls: ['data/hd/character/npc/warriv1/skeleton/warriv1.skeleton'],
  },
  {
    id: 'rogue1-torso',
    label: 'Rogue guard torso',
    urls: [
      'data/hd/character/npc/rogue1/torso_lod3.model',
      'data/hd/character/npc/rogue1/models/torso_lod3.model',
    ],
    // The rogue's own unit definition wires its skeleton to the shared rogue
    // skeleton (`navi`), so that is the file to check — not a substitution.
    skeletonUrls: [
      'data/hd/character/npc/navi/skeleton/navi.skeleton',
      'data/hd/character/npc/rogue1/skeleton/navi.skeleton',
    ],
  },
  {
    id: 'rogue1-special1',
    label: 'Rogue guard shoulders',
    urls: [
      'data/hd/character/npc/rogue1/special1_lit_lod3.model',
      'data/hd/character/npc/rogue1/models/special1_lit_lod3.model',
    ],
  },
  // Monsters (skeleton1/zombie1/brute2), one entry per part.
  ...enemyPartSources(),
  // HD environment props (rock/brazier/bones/pillar).
  ...propSources(),
]

/**
 * `monstats` id → the model keys that assemble that town NPC standing on one
 * tile, mirroring `HERO_PARTS` in `./game-actors.ts`: the parts the NPC's own
 * unit definition entities name (`UnitPartComponent.part`), one key per part,
 * body parts in their `lit` variant.
 *
 * An NPC absent from this map keeps its 2D sprite — the rule, not a fallback
 * to another character's model. The keys are `monstats.txt` ids (`warriv1`,
 * not the display name "Warriv"), which is what `game.npcs[].id` carries.
 */
export const NPC_PART_MODELS: Record<string, string[]> = {
  // `data/hd/character/npc/gheed.json`: one `torso` part carries the whole
  // character (8 meshes: body, outfit, beard, fur, brows, eyes).
  gheed: ['gheed-torso'],
  // `data/hd/character/npc/akara.json`: one `torso` part (7 meshes).
  akara: ['akara-torso'],
  // `data/hd/character/npc/kashya.json`: one `torso` part (5 meshes).
  kashya: ['kashya-torso'],
  // `data/hd/character/npc/charsi.json`: one `torso` part (18 meshes).
  charsi: ['charsi-torso'],
  // `data/hd/character/npc/warriv1.json`: one `torso` part (5 meshes).
  warriv1: ['warriv1-torso'],
  // `data/hd/character/npc/rogue1.json`: `torso` (body, outfit, hair, quiver)
  // plus `special1` (the shoulders the torso mesh is built "minus"). The
  // definition's `lhand` bow and `special2` parts ship no model file at any
  // LOD in this package, so they are absent here and named in the verifier's
  // report.
  rogue1: ['rogue1-torso', 'rogue1-special1'],
}

/** Model-space bounds of one loaded model (vertices, not the clamped bbMax). */
export interface ModelBounds {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

/** A decoded model: bind-pose parts plus their model-space bounds. */
export interface LoadedModel {
  parts: PartSpec[]
  bounds: ModelBounds
  /** URL that actually resolved for this model. */
  url: string
}

const modelCache = new Map<string, Promise<LoadedModel | null>>()

/**
 * Load (and cache) one model by {@link ModelSource} id.
 *
 * The cache is module-level on purpose: the actor layer re-renders and
 * re-mounts around it (slider changes, canvas resizes), and decoding a `.model`
 * plus its albedo textures again per render would be the dominant cost of the
 * page. A failed load caches as null so a missing sample is not re-probed on
 * every frame.
 */
export function loadModelParts(modelKey: string): Promise<LoadedModel | null> {
  let cached = modelCache.get(modelKey)
  if (!cached) {
    cached = loadModelPartsUncached(modelKey)
    modelCache.set(modelKey, cached)
  }
  return cached
}

async function loadModelPartsUncached(modelKey: string): Promise<LoadedModel | null> {
  const source = MODEL_SOURCES.find((entry) => entry.id === modelKey)
  if (!source) return null

  let bytes: Uint8Array | null = null
  let url = ''
  for (const candidate of source.urls) {
    try {
      const res = await fetch(MODEL_ROOT + candidate)
      if (!res.ok) continue
      const fetched = new Uint8Array(await res.arrayBuffer())
      // A dev server's SPA fallback answers a missing asset with 200 and the
      // page markup — a 200 is not a game file until the magic says so.
      if (!isGr2(fetched)) continue
      bytes = fetched
      url = MODEL_ROOT + candidate
      break
    } catch {
      // Server refused the fetch — treat as absent and try the next layout.
    }
  }
  if (bytes === null) return null

  const file = loadGr2(bytes)
  const links = readMaterialTextureLinks(bytes)

  // Mirror of gr2-lab's composition loop: groups can repeat one triangle range
  // with alternate materials (skin variants); a range is drawn once, preferring
  // the group whose albedo resolves to a real texture over a gray one.
  const built: PartSpec[] = []
  for (const mesh of file.meshes) {
    const byRange = new Map<
      string,
      {
        group: Gr2TriangleGroup
        textureSource: HTMLCanvasElement | null
        normalSource: HTMLCanvasElement | null
        ormSource: HTMLCanvasElement | null
      }
    >()
    for (const group of mesh.groups) {
      const materialIndex = mesh.materialBindings[group.materialIndex] ?? group.materialIndex
      const material = file.materials[materialIndex]
      const albedoPath = resolveAlbedo(links[materialIndex], material)
      const textureSource = albedoPath === null ? null : await loadAlbedo(albedoPath)
      // The sibling channels of the same family, for the PBR character
      // material: `_nrm` (tangent normal) and `_orm` (AO/roughness). Absent
      // channels fall back to flat texels in the material, not here.
      const nrmPath = albedoPath === null ? null : resolveChannel(albedoPath, 'nrm')
      const ormPath = albedoPath === null ? null : resolveChannel(albedoPath, 'orm')
      const normalSource = nrmPath === null ? null : await loadAlbedo(nrmPath)
      const ormSource = ormPath === null ? null : await loadAlbedo(ormPath)
      // A silent gray fallback is undebuggable — say what was asked and what
      // arrived, once per part, whenever the albedo does not resolve.
      if (textureSource === null) {
        console.warn(
          `gr2: "${mesh.name}" part has no albedo — material "${material?.name ?? '?'}" ` +
            `names ${material?.textureFile ?? 'no texture'}, resolved ${albedoPath ?? 'nothing'}`,
        )
      } else {
        console.log(`gr2: "${mesh.name}" albedo ${albedoPath}`)
      }
      const key = `${group.triFirst}:${group.triCount}`
      const previous = byRange.get(key)
      const candidate = { group, textureSource, normalSource, ormSource }
      if (!previous) {
        byRange.set(key, candidate)
      } else if (previous.textureSource === null && textureSource !== null) {
        byRange.set(key, candidate)
      }
    }
    for (const entry of byRange.values()) {
      built.push(
        buildPart(mesh, entry.group, entry.textureSource, {
          normalSource: entry.normalSource,
          ormSource: entry.ormSource,
        }),
      )
    }
  }

  const bounds = partsBounds(built)
  if (bounds === null) return null
  // The outline the contact shadow takes its shape from. Every part of this
  // model shares it, so the shadow's per-actor merge does not rebuild it
  // every frame.
  const outline = groundOutlineOf(built, bounds)
  for (const part of built) part.groundOutline = outline
  return { parts: built, bounds, url }
}

/**
 * The model's ground outline: the plan-view silhouette of the WHOLE body, plus
 * its height.
 *
 * This used to be only the vertices within a thin band above the floor — the
 * feet — which made a standing character cast a narrow strip and gave a walking
 * one almost nothing to work with. A cast shadow is the whole body's silhouette
 * swept along the light, so the outline is the hull of every vertex projected
 * onto the ground plane.
 *
 * The floor is the model's own ORIGIN (y = 0), not the model's lowest vertex:
 * the body parts of a character share one character space whose origin is the
 * character's feet (measured — the amazon's legs run from y = 0 to y = 4.34
 * while its head runs from 4.81 to 7.17), so a head must not claim a "floor" of
 * its own.
 *
 * A part with no geometry still publishes its height, so the character's shadow
 * is as long as its tallest part is high.
 */
function groundOutlineOf(parts: PartSpec[], bounds: ModelBounds): GroundOutline {
  const height = bounds.maxY
  if (!(height > 0)) return { points: new Float32Array(0), top: 0 }

  let count = 0
  for (const part of parts) count += part.vertices.length / 3
  if (count === 0) return { points: new Float32Array(0), top: height }

  // Project every vertex. Consecutive vertices are usually close, so the hull
  // sees a lot of interior points; the builder is O(n log n) on the sort and
  // this runs once per model load, not per frame.
  const points = new Float32Array(count * 2)
  let at = 0
  for (const part of parts) {
    const vertices = part.vertices
    for (let i = 0; i < vertices.length; i += 3) {
      points[at] = vertices[i]
      points[at + 1] = vertices[i + 2]
      at += 2
    }
  }
  const pointCount = at / 2
  if (pointCount === 0) return { points: new Float32Array(0), top: height }

  const hullPoints = new Float32Array(at)
  const hull = convexHull(points, pointCount, hullPoints)
  if (hull < 3) return { points: new Float32Array(0), top: height }
  return { points: hullPoints.slice(0, hull * 2), top: height }
}

/** Model-space vertex bounds of already-built parts, or null when empty. */
export function partsBounds(parts: PartSpec[]): ModelBounds | null {
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
  if (!Number.isFinite(minX)) return null
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

// ===========================================================================
// Extracted from examples/arpg/src/gr2-lab.tsx (origin: the GR2 model lab).
// Keep the behavior of everything below identical to that page's.
// ===========================================================================

// ---------------------------------------------------------------------------
// Material → texture links
// ---------------------------------------------------------------------------

/**
 * Recover each material's map cross-links as `usage → in-package texture
 * path`, in the same order as `Gr2File.materials`.
 *
 * `loadGr2` materializes a map's cross-reference to the target object but
 * keeps only numeric links in its output (`material: null`), so the link is
 * re-derived here from the raw tree. The map member is named `Map` (not
 * `Material`) and its target either IS a texture record (`FromFileName`) or
 * wraps one in its `Texture` member.
 */
export function readMaterialTextureLinks(bytes: Uint8Array): Map<string, string>[] {
  const container = readContainer(bytes)
  const reader = new Gr2Reader(container.merged)
  const rootAt = container.sectionStart[container.header.rootObject.section] + container.header.rootObject.offset
  const typeAt = container.sectionStart[container.header.rootType.section] + container.header.rootType.offset
  const root = reader.object(rootAt, reader.typeChain(typeAt))

  const out: Map<string, string>[] = []
  for (const entry of asArray(root['Materials']).items) {
    const material = asObject(entry)
    const byUsage = new Map<string, string>()
    for (const mapEntry of asArray(material['Maps']).items) {
      const map = asObject(mapEntry)
      const path = texturePathOf(map['Map'] ?? map['Material'])
      if (path !== null) byUsage.set(asString(map['Usage']), path)
    }
    out.push(byUsage)
  }
  return out
}

function texturePathOf(value: unknown, depth = 0): string | null {
  if (!value || typeof value !== 'object' || depth > 4) return null
  const record = value as Record<string, unknown>
  const direct = asString(record['FromFileName'])
  if (direct !== '') return direct
  for (const key of ['Texture', 'object', 'Material', 'Map']) {
    const nested = record[key]
    if (nested && typeof nested === 'object') {
      const path = texturePathOf(nested, depth + 1)
      if (path !== null) return path
    }
  }
  const items = Array.isArray(record['items']) ? (record['items'] as unknown[]) : []
  for (const item of items) {
    const path = texturePathOf(item, depth + 1)
    if (path !== null) return path
  }
  return null
}

/**
 * The albedo `.texture` path a material samples, or null when it names none.
 *
 * A material's `Texture` member does not name the albedo reliably: on the
 * diablo set it points at the `_ktint` tint mask (`material[0] = file42 →
 * diablo_body_ktint.texture`), and the `Maps` array holds only Maya colour
 * management entries. The file-name family is what separates the channels
 * (`_alb`/`_ALB`, `_nrm`, `_orm`, `_ktint`), so the albedo is the same
 * family's `_alb` texture.
 *
 * Only the TRAILING channel tag is stripped: `diablo_body_burned_orm.texture`
 * must resolve to `diablo_body_burned_ALB.texture`, never to the unburned
 * `diablo_body_alb.texture` — matching anything longer ("_burned_orm") tore
 * the family name off and rendered every part with a sibling's texture.
 * Case is not a convention in this package (the burned set ships uppercase
 * `ALB`, the base set lowercase), so the caller retries the case variant.
 */
export function resolveAlbedo(links: Map<string, string> | undefined, material: Gr2Material | undefined): string | null {
  const fromMap = links?.get('AlbedoTexture')
  if (fromMap) return fromMap
  const direct = material?.textureFile ?? null
  if (direct === null) return null
  if (/_alb\.texture$/i.test(direct)) return direct
  const family = direct.replace(/_(alb|nrm|orm|ktint)\.texture$/i, '')
  if (family !== direct) return `${family}_alb.texture`
  return null
}

/**
 * The `_nrm`/`_orm` sibling of an albedo path, by family: `x_alb.texture` →
 * `x_nrm.texture` / `x_orm.texture` (the loader retries the case variant).
 */
export function resolveChannel(albedoPath: string, channel: 'nrm' | 'orm'): string | null {
  const family = albedoPath.replace(/_alb\.texture$/i, '')
  return family === albedoPath ? null : `${family}_${channel}.texture`
}

// ---------------------------------------------------------------------------
// Texture decoding (browser side)
// ---------------------------------------------------------------------------

/** The in-package root the staged `.model`/`.texture` files are served from. */
export const MODEL_ROOT = '/original/models/'

const textureCache = new Map<string, Promise<HTMLCanvasElement | null>>()

/** Fetch + decode one `.texture` (any channel) into a canvas, cached per path. */
export function loadAlbedo(path: string): Promise<HTMLCanvasElement | null> {
  let cached = textureCache.get(path)
  if (!cached) {
    // Case is not a convention in this package (the burned set ships
    // `_ALB.texture`, the base set `_alb.texture`; the same split exists for
    // the other channels) and a miss decodes to null, so the case variant of
    // the trailing channel tag is retried before giving up.
    const caseVariant = /_(alb|nrm|orm|ktint)\.texture$/i.test(path)
      ? path.replace(/_(alb|nrm|orm|ktint)\.texture$/i, (tag) =>
          tag === tag.toUpperCase() ? tag.toLowerCase() : tag.toUpperCase(),
        )
      : null
    cached = fetch(MODEL_ROOT + path)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buffer) => (buffer === null ? null : canvasFromTexture(new Uint8Array(buffer))))
      .then((decoded) => {
        if (decoded !== null || caseVariant === null || caseVariant === path) return decoded
        return fetch(MODEL_ROOT + caseVariant)
          .then((res) => (res.ok ? res.arrayBuffer() : null))
          .then((buffer) => (buffer === null ? null : canvasFromTexture(new Uint8Array(buffer))))
          .catch(() => null)
      })
      .catch(() => null)
    textureCache.set(path, cached)
  }
  return cached
}

/**
 * A decoded texture: the canvas the display paths draw, PLUS the straight RGBA
 * bytes the GPU must upload. The canvas round-trip premultiplies colour and
 * destroys data channels (a normal map's RGB quantizes to per-texel noise
 * where alpha is small — alpha survives, which pins the mechanism), so
 * `textureFor` uploads `pixels` and only falls back to the canvas.
 */
export interface TexturedCanvas extends HTMLCanvasElement {
  pixels?: RawPixelSource
}

export function canvasFromTexture(bytes: Uint8Array): HTMLCanvasElement | null {
  try {
    const { rgba, width, height } = decodeTexture(bytes)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ;(canvas as TexturedCanvas).pixels = { width, height, bytes: rgba }
    // The _alb alpha is a CUTOUT mask (hair strands are 0, everything else is
    // opaque) — the game alpha-tests it. The batch blends instead of testing,
    // which for a binary mask is visually the same; the alpha is preserved as
    // decoded so the cutout is not painted over with garbage-coloured texels.
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
    return canvas
  } catch {
    return null
  }
}

/** The honest fallback: one flat gray texel, shaded like any albedo. */
export function grayCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, 1, 1)
  return canvas
}

let cachedGrayTexture: HTMLCanvasElement | null = null

/**
 * The gray fallback texel, built on first use. Lazy on purpose: importing this
 * module (e.g. from node-side skinning tests) must not require a DOM.
 */
export function grayTexture(): HTMLCanvasElement {
  cachedGrayTexture ??= grayCanvas()
  return cachedGrayTexture
}

// ---------------------------------------------------------------------------
// Geometry: indexed GR2 groups → gfx triangle lists
// ---------------------------------------------------------------------------

export interface PartSpec {
  /**
   * Triangle-list vertices, 3 per vertex, in MODEL space. (The gr2 lab later
   * shifts them to the bounds center for orbiting; the actor layer keeps the
   * model's own origin — the character's feet — for placement.)
   */
  vertices: Float32Array
  /** Texture coordinates, 2 per vertex (zeros when the mesh has none). */
  uv: Float32Array
  /** Unit normals, 3 per vertex ((0, 0, 1) when the mesh has none). */
  normals: Float32Array
  /**
   * The mesh's own tangent frame, 4 per vertex: xyz plus the handedness sign
   * in w (the bitangent is `w · cross(N, T)`).
   *
   * The retail GR2 meshes ship tangents (`src/original/gr2.ts` reads the
   * `Tangent` member), and the PBR character material needs them: the
   * normal map is a tangent-space map, and the handedness is -1 on ~90 % of
   * the amazon's vertices, so a frame built as `cross(N, T)` alone inverts
   * the map's Y channel.
   */
  tangents?: Float32Array
  /**
   * The model's ground outline — the shape where it stands on the floor.
   *
   * Published to the contact shadow (`./actor-shadow.ts`) through
   * `./ground-outline.ts`. Every part of one model carries the SAME outline
   * object, so the shadow's per-actor merge does not rebuild per frame.
   */
  groundOutline?: GroundOutline
  /**
   * Normals packed as RGB in [0, 1] — the "show normals" pass.
   *
   * Optional: only the debug view reads it, so the skinning pass leaves it
   * out rather than computing a third of the per-vertex work for nothing.
   */
  normalColors?: Float32Array
  /** Decoded albedo bitmap, or null → flat gray fallback. */
  textureSource: HTMLCanvasElement | null
  /**
   * The family's decoded `_nrm` tangent-normal map (X in alpha, Y in green),
   * or null/absent → the flat normal texel. Consumed by the PBR character
   * material (`./character-material.ts`); the batch path ignores it.
   */
  normalSource?: HTMLCanvasElement | null
  /** The family's `_orm` map (R = AO, G = roughness); same fallback rule. */
  ormSource?: HTMLCanvasElement | null
  /**
   * Skin weights, 4 per vertex, aligned with `vertices` (present when the
   * source mesh is skinned). The renderer ignores these; `./skinning.ts` uses
   * them to CPU-skin a copy of this part.
   */
  boneWeights?: Float32Array
  /** Skin bone indices, 4 per vertex — into `boneBindings` (see skinning.ts). */
  boneIndices?: Uint8Array
  /** The source mesh's bone bindings, shared by every part of that mesh. */
  boneBindings?: readonly Gr2BoneBinding[]
}

/** Expand one triangle group into the non-indexed arrays `gfx` batches. */
export function buildPart(
  mesh: Gr2Mesh,
  group: Gr2TriangleGroup,
  textureSource: HTMLCanvasElement | null,
  channels: { normalSource?: HTMLCanvasElement | null; ormSource?: HTMLCanvasElement | null } = {},
): PartSpec {
  const first = group.triFirst * 3
  const count = Math.min(group.triCount * 3, Math.max(0, mesh.indices.length - first))
  const vertices = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  const normals = new Float32Array(count * 3)
  const normalColors = new Float32Array(count * 3)
  // The model's own tangent frame (xyz + the handedness sign in w).
  const tangents = mesh.tangents ? new Float32Array(count * 4) : undefined
  // Skin inputs ride along with the part (de-indexed exactly like positions)
  // so `./skinning.ts` can deform a copy of it; the renderer never reads them.
  const skinned = mesh.boneWeights !== null && mesh.boneIndices !== null
  const boneWeights = skinned ? new Float32Array(count * 4) : undefined
  const boneIndices = skinned ? new Uint8Array(count * 4) : undefined
  for (let k = 0; k < count; k += 1) {
    const vi = mesh.indices[first + k]
    vertices[k * 3] = mesh.positions[vi * 3]
    vertices[k * 3 + 1] = mesh.positions[vi * 3 + 1]
    vertices[k * 3 + 2] = mesh.positions[vi * 3 + 2]
    if (mesh.uvs) {
      uv[k * 2] = mesh.uvs[vi * 2]
      uv[k * 2 + 1] = mesh.uvs[vi * 2 + 1]
    }
    let nx = 0
    let ny = 0
    let nz = 1
    if (mesh.normals) {
      nx = mesh.normals[vi * 3]
      ny = mesh.normals[vi * 3 + 1]
      nz = mesh.normals[vi * 3 + 2]
    }
    normals[k * 3] = nx
    normals[k * 3 + 1] = ny
    normals[k * 3 + 2] = nz
    normalColors[k * 3] = nx * 0.5 + 0.5
    normalColors[k * 3 + 1] = ny * 0.5 + 0.5
    normalColors[k * 3 + 2] = nz * 0.5 + 0.5
    if (tangents && mesh.tangents) {
      tangents[k * 4] = mesh.tangents[vi * 4]
      tangents[k * 4 + 1] = mesh.tangents[vi * 4 + 1]
      tangents[k * 4 + 2] = mesh.tangents[vi * 4 + 2]
      tangents[k * 4 + 3] = mesh.tangents[vi * 4 + 3]
    }
    if (boneWeights && boneIndices && mesh.boneWeights && mesh.boneIndices) {
      for (let i = 0; i < 4; i += 1) {
        boneWeights[k * 4 + i] = mesh.boneWeights[vi * 4 + i]
        boneIndices[k * 4 + i] = mesh.boneIndices[vi * 4 + i]
      }
    }
  }
  return {
    vertices,
    uv,
    normals,
    normalColors,
    tangents,
    textureSource,
    normalSource: channels.normalSource ?? null,
    ormSource: channels.ormSource ?? null,
    boneWeights,
    boneIndices,
    boneBindings: mesh.boneBindings,
  }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

const SHADOW_COLOUR = { r: 0, g: 0, b: 0, a: 0.42 }

const WHITE = { r: 1, g: 1, b: 1, a: 1 }
/**
 * Sampling for model textures: REPEAT (the game's UVs tile), LINEAR
 * magnification, and a full mip chain with trilinear minification. The batch
 * defaults to NEAREST/NEAREST — fine at lab zoom, but the game draws a
 * character at ~80px and a 256px feature atlas (eyes, buckles, leaves) then
 * aliases into bar-shaped moire. Mips are what a 3D renderer needs here.
 */
const TEXTURE_REPEAT = {
  wrapS: 0x2901,
  wrapT: 0x2901,
  minFilter: 0x2601, // gl.LINEAR (no mips: the mip chain sampled at the wrong LOD turned the atlas to average-colour mush)
  magFilter: 0x2601, // gl.LINEAR
}

export interface Gr2ModelProps {
  parts: PropValue<PartSpec[]>
  normalsMode: PropValue<boolean>
  /**
   * Draw through the PBR character material (`./character-material.ts`):
   * normal-mapped GGX with the ORM's AO/roughness and the albedo cutout. A
   * backend without material support falls back to the batch path per part.
   */
  pbr?: PropValue<boolean>
  /**
   * Painter order for the material draws (isometric depth: bigger = closer,
   * drawn later). The batch path sorts itself and ignores this.
   */
  order?: PropValue<number>
  /**
   * A redraw-only dependency (the gr2 lab drives its orbit timer through it).
   * The draw path never reads it; carrying a changing value here marks the
   * node dirty and repaints the scene.
   */
  orbit: PropValue<number>
}

/**
 * One element submitting every loaded group. Textured pass: albedo bitmap +
 * mesh normals (the renderer lights from world-space normals). Normals pass:
 * vertex colors carrying the normal direction, unlit.
 */
/**
 * GL texture handles, cached per (renderer node, source canvas).
 *
 * `createTexture` UPLOADS — and the game redraws every frame with CPU-skinned
 * parts, so creating a texture per draw burned thousands of uploads per
 * second until the GL texture pool churned and every sample landed on
 * whatever texture a neighbour had uploaded. One handle per canvas per
 * renderer, for the lifetime of the page.
 */
const textureHandles = new WeakMap<object, WeakMap<object, ReturnType<GfxNode['createTexture']>>>()
export function textureFor(node: GfxNode, source: HTMLCanvasElement | null): ReturnType<GfxNode['createTexture']> {
  const canvas = source ?? grayTexture()
  // Straight RGBA bytes when the decoder provided them (see TexturedCanvas).
  const upload = (canvas as TexturedCanvas).pixels ?? canvas
  let perNode = textureHandles.get(node)
  if (perNode === undefined) {
    perNode = new WeakMap()
    textureHandles.set(node, perNode)
  }
  let handle = perNode.get(upload)
  if (handle === undefined) {
    handle = node.createTexture(upload, TEXTURE_REPEAT)
    perNode.set(upload, handle)
  }
  return handle
}

/**
 * The model's own shadow: the part's vertices pushed along the light until they
 * meet the ground.
 *
 * This is what the retail build does with its dedicated shadow shaders
 * (`ps_models_shadows_p` and friends): the mesh is drawn a second time through a
 * shadow pass, so the shadow IS the silhouette — legs separate, arms and cloak
 * show, and it stretches along the light the way a real one does. A convex hull
 * of the same vertices cannot do that: the hull of a human's plan view is an
 * ellipse, which is exactly the "a blob or a stick" the hull produced.
 *
 * The shear is applied in MODEL space, which is equivalent to projecting in
 * world space because the placement is a rotation about Y plus a uniform scale
 * with no vertical offset (the model's feet are on the ground, y = 0), so the
 * ground plane is the same plane in both spaces.
 *
 * Returns null for a part with no vertices.
 */
const shadowScratch = new WeakMap<Float32Array, Float32Array>()

function projectShadow(vertices: Float32Array, rotationY: number): Float32Array | null {
  const count = vertices.length / 3
  if (count === 0) return null
  let out = shadowScratch.get(vertices)
  if (out === undefined || out.length !== vertices.length) {
    out = new Float32Array(vertices.length)
    shadowScratch.set(vertices, out)
  }
  // The light in MODEL space: undo the placement's rotation about Y.
  const cos = Math.cos(-rotationY)
  const sin = Math.sin(-rotationY)
  const lx = LIGHT_DIRECTION[0] * cos + LIGHT_DIRECTION[2] * sin
  const lz = -LIGHT_DIRECTION[0] * sin + LIGHT_DIRECTION[2] * cos
  const ly = LIGHT_DIRECTION[1]
  // The light points DOWN (its y is negative); without that there is no shadow.
  if (!(ly < -1e-4)) return null
  const sx = lx / ly
  const sz = lz / ly
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i]
    const y = vertices[i + 1]
    const z = vertices[i + 2]
    // Move along the light's ray until y reaches the ground.
    out[i] = x - y * sx
    out[i + 1] = 0
    out[i + 2] = z - y * sz
  }
  return out
}

export const Gr2Model = (props: Gr2ModelProps) =>
  element({
    getBounds: () => null, // 3D — full redraw

    draw: (node: GfxNode) => {
      const parts = unref(props.parts)
      const normalsMode = unref(props.normalsMode) ?? false
      const pbr = unref(props.pbr) ?? false
      const order = unref(props.order) ?? 0
      if (parts.length === 0) return

      const transform = node.getCurrentTransform()
      const finalTransform = {
        tx: transform.tx,
        ty: transform.ty,
        tz: transform.tz,
        rotationX: transform.rotationX,
        rotationY: transform.rotationY,
        rotationZ: transform.rotationZ,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
        scaleZ: transform.scaleZ,
      }

      // The cast shadow: the same mesh sheared onto the ground along the light.
      // Drawn before the body so the body always covers its own contact edge.
      if (pbr && !normalsMode) {
        for (const part of parts) {
          const shadow = projectShadow(part.vertices, finalTransform.rotationY)
          if (shadow === null) continue
          node.addShape(
            'actor-shadow-mesh',
            shadow,
            SHADOW_COLOUR,
            finalTransform,
            undefined,
            null,
            undefined,
            true, // depthWrite
            undefined,
            undefined,
            true, // skipTonemap
            false,
            'normal',
          )
        }
      }

      for (const part of parts) {
        if (part.vertices.length === 0) continue
        if (normalsMode) {
          node.addShape(
            'gr2-normals',
            part.vertices,
            WHITE,
            finalTransform,
            undefined,
            null,
            part.normalColors,
            undefined,
            undefined,
          )
        } else if (pbr && drawCharacter(node, part, finalTransform, order)) {
          // Drawn through the character material (normal-mapped GGX). A
          // backend without material support falls through to the batch.
        } else {
          // Every submission carries a texture: the batch samples one texture
          // slot for the whole group, so a texture-less item inside a textured
          // group would read another item's bitmap at uv (0, 0).
          // REPEAT, not clamp: the game's UVs really tile (diablo's body runs
          // to u=2.0), and clamping smears u>1 into one edge column — the
          // model then renders as a flat colour.
          const texture = textureFor(node, part.textureSource)
          node.addShape(
            'gr2-albedo',
            part.vertices,
            WHITE,
            finalTransform,
            part.uv,
            texture,
            undefined,
            undefined,
            part.normals,
          )
        }
      }
    },

    deps: () => [unref(props.parts), unref(props.normalsMode), unref(props.pbr), unref(props.order), unref(props.orbit)],
  })
