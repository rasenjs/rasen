/**
 * Entry — builds the game, wires the input, and runs the loop.
 *
 * The wiring is deliberately thin: the machines decide intent, the game decides
 * what intent means, the audio bus decides what it sounds like. Nothing here
 * knows how a monster moves or how a sprite is drawn.
 */

import { mount, setupKeyboard } from '@rasenjs/dom'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { createAudio } from './audio'
import { Game, type EconomyContent, type LootIcon, type WorldContent } from './game'
import { loadGameData, hasGameData, gameDataSummary } from './gamedata'
import { createBrowserLevelSource, loadLevelWithFetch } from './d2/level-source'
import { areasOf, type AreaRef } from './d2/travel'
import { createTravelRuntime, type TravelRuntime } from './d2/travel-runtime'
import { syncActor3DPool } from './three-d/game-actors'
import type { Level } from './d2/levels'
import { createItemDataSource } from './d2/item-source'
import { createEconomySource } from './d2/economy-source'
import { parseStringTable, type StringRow, type StringTable } from './d2/stats'
import { loadItemArtIndex } from './d2/itemart'
import { createWorldDataSource, type WorldDataSource } from './d2/object-source'
import {
  monPresetAct,
  resolvePlacements,
  summarisePlacements,
  type PlaceableRecord,
} from './d2/places'

/** The `.ds1` records a level carries, as the placement resolver wants them. */
type PlacementRecord = PlaceableRecord
import { parseSuperUniques, type SuperUniqueTable } from './d2/superuniques'
import { createAtlasLoader } from './d2/ui/atlas'
import { loadUiStrings } from './d2/ui/strings'
import { loadFrontend, type FrontendCharacter, type FrontendScreens } from './frontend'
import { loadUiLayers, type UiLayerSet } from './d2/ui/screen'
import { mergeBasedOn, type WaypointAct } from './hud'
import { EXTRA_UI_LAYOUTS } from './hud-panels'
import { loadHeroArt, loadMonsterArtMap, type ActorArt } from './d2/anim-art'
import { loadAnimIndex } from './d2/anim'
import { createMonsterNames, type MonsterNames } from './d2/monster-names'
import { createMonsterDataSource } from './d2/monster-source'
import { createSkillDataSource } from './d2/skill-source'
import type { SkillRuntime } from './d2/skills'
import { parseCharStats, parseStatTable, type CharStatsTable, type StatRow, type StatTable } from './d2/stats'
import type { MonsterTables } from './d2/monsters'
import type { DropResolver } from './d2/treasure'
import { parseDt1, type Dt1File } from './d2/dt1'
import { assembleTile, blockLayer, isWallBlock, bitmapToCanvas, parsePalette, type Palette } from './d2/tileart'
import type { TileArt } from './world'
import type { RealLevelGrid, TerrainArt } from './world'
import { iconOverrides, loadOriginalArt } from './original-assets'
import { setIconOverrides } from './hud-icons'
import { createApp } from './render'
import { liveViewport } from './viewport'
import { bindInput, createGestureRecognizer, createVirtualStick } from './input'
import { SkillButtonControl } from './input/aim-button'

useReactiveRuntime()

// canvas-2d components bind as lowercase JSX tags through the vite config's
// auto-import (types in `jsx.d.ts`).

/**
 * The panels whose layout is `basedOn` another one, derived → base.
 *
 * The derived file lists only what it changes and leaves the geometry in the base,
 * so both have to be loaded for the panel to have an anchor at all. The pairing
 * cannot be read off the parsed tree — `parseLayout` keeps `type`, `name`, `fields`
 * and `children`, and drops `basedOn` — so it is written out here; these are all
 * three the export has. See `mergeBasedOn` in `hud.tsx` for why the merge is needed.
 */
const BASED_ON_PANELS: ReadonlyArray<readonly [derived: string, base: string]> = [
  ['playerinventoryexpansionlayouthd', 'playerinventoryoriginallayouthd'],
  ['bankexpansionlayouthd', 'bankoriginallayouthd'],
  ['waypointspanelexpansionhd', 'waypointspaneloriginalhd'],
]

/** Every layout the in-game HUD draws, base files included. */
const UI_PANEL_LAYOUTS: readonly string[] = [
  'hudpanelhd',
  'playerinventoryexpansionlayouthd',
  'characterstatspanelhd',
  'skillstreepanelhd',
  'questlogpaneloriginalhd',
  'bankexpansionlayouthd',
  'waypointspanelexpansionhd',
  'vendorpanellayouthd',
  'hirelinginventorypanelhd',
  ...BASED_ON_PANELS.map(([, base]) => base),
  ...EXTRA_UI_LAYOUTS,
]

/**
 * The waypoints of each act, from `levels.txt`.
 *
 * The table carries a `Waypoint` column — an area's waypoint index within its act,
 * 255 for "this area has none" — and the game's waypoint list is exactly the rows
 * that are not 255, in that order. The column is *not* part of `GameData`:
 * `gamedata.ts` exports a level's `id`, `act`, `name` and `devName` and drops the
 * rest, so the exported table is read here as well and joined on the level id, which
 * is how the string table's area name ("Cold Plains") meets the waypoint index. The
 * table's last row is the expansion marker with every column null, and it is the
 * null guard that leaves it out.
 */
async function loadWaypoints(base: string): Promise<WaypointAct[]> {
  // A trailing comma, because `<T>` at the head of an arrow is a JSX element in a
  // `.tsx` file and `<T,>` is how the type parameter is spelled.
  const read = async <T,>(file: string): Promise<T[]> => {
    try {
      const response = await fetch(`${base}original/${file}`, { cache: 'no-store' })
      if (!response.ok) return []
      return (await response.json()) as T[]
    } catch {
      return []
    }
  }
  const [table, levels] = await Promise.all([
    read<Record<string, unknown>>('table_levels.json'),
    read<{ id: number; act: number; name: string }>('gamedata_levels.json'),
  ])
  if (table.length === 0 || levels.length === 0) return []

  const byId = new Map<number, { act: number; name: string }>()
  for (const level of levels) {
    if (level.name !== '' && level.name !== 'Null') byId.set(level.id, level)
  }

  /** The export keeps `levels.txt`'s columns as text, so both spellings are read. */
  const numberOf = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value)
    }
    return null
  }

  const acts = new Map<number, Array<{ index: number; name: string }>>()
  for (const row of table) {
    const index = numberOf(row.Waypoint)
    const id = numberOf(row.Id)
    if (index === null || id === null || index < 0 || index > 254) continue
    const level = byId.get(id)
    if (level === undefined) continue
    const list = acts.get(level.act) ?? []
    list.push({ index, name: level.name })
    acts.set(level.act, list)
  }
  return [...acts]
    .sort((a, b) => a[0] - b[0])
    .map(([act, list]) => ({ act, areas: [...list].sort((a, b) => a.index - b.index) }))
}

/** Surface a failure on the page: a thrown rAF callback is otherwise silent. */
function installErrorBanner(): void {
  const show = (message: string): void => {
    let banner = document.getElementById('error-banner')
    if (!banner) {
      banner = document.createElement('div')
      banner.id = 'error-banner'
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7d0f0f;color:#fff;' +
        'font:12px ui-monospace,monospace;padding:6px 10px;white-space:pre-wrap;'
      document.body.appendChild(banner)
    }
    banner.textContent = `ERROR: ${message}`
  }
  window.addEventListener('error', (event) => show(event.message))
  window.addEventListener('unhandledrejection', (event) => show(String(event.reason)))
}

async function main(): Promise<void> {
  installErrorBanner()
  const container = document.getElementById('app')
  if (!container) throw new Error('#app is missing from index.html')

  // Resolved from the document, not a bundler global: the same code then works
  // whether the app is served from the dev server root or a sub-path.
  const base = new URL('.', document.baseURI).pathname

  // Extracted original artwork is optional: without it the HUD keeps its drawn
  // icons. Fragments rather than exact paths, because the exact paths are tied
  // to one game build.
  const originalArt = await loadOriginalArt(base)
  // Fragments rather than exact paths: the exact paths are tied to one game
  // build, so a version difference would silently break the interface.
  setIconOverrides(
    iconOverrides(originalArt, {
      fireball: 'soskillicon',
      nova: 'neskillicon',
    }),
  )

  // Original item art for the canvas drops, when it has been extracted. Each
  // load is independent: a missing file leaves that icon drawn rather than
  // failing the whole set.
  const loadImage = (file: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => resolve(null)
      image.src = `${base}original/${file}`
    })
  const [sword, armor, rune, ring] = await Promise.all([
    loadImage('bastard_sword.png'),
    loadImage('crown_shield.png'),
    loadImage('amn_rune.png'),
    loadImage('flawless_ruby.png'),
  ])
  const loot: Partial<Record<LootIcon, CanvasImageSource>> = {}
  if (sword) loot.sword = sword
  if (armor) loot.armor = armor
  if (rune) loot.rune = rune
  if (ring) loot.ring = ring


  // Real terrain art for the ground: each tile kind maps to one of the game's
  // own textures. Missing files leave that kind flat-coloured.
  const TERRAIN: Record<string, string[]> = {
    grass: ['terrain_grass_0.png', 'terrain_grass_1.png', 'terrain_grass_2.png', 'terrain_grass_3.png'],
    dirt: ['terrain_dirt_0.png', 'terrain_dirt_1.png', 'terrain_dirt_2.png'],
    stone: ['terrain_stone_0.png', 'terrain_stone_1.png', 'terrain_stone_2.png', 'terrain_stone_3.png'],
    path: ['terrain_path_0.png', 'terrain_path_1.png'],
    water: ['terrain_water_0.png', 'terrain_water_1.png'],
  }
  /**
   * Read a `.ds1`/`.dt1` for the level source.
   *
   * `level-source.ts` prefetches through this, and the assembly step below calls
   * it again for the tilesets it needs pictures from — the cache inside the
   * source makes the second read free.
   */
  const loadTileFile = async (
    source: ReturnType<typeof createBrowserLevelSource> extends Promise<infer T> ? T : never,
    relativePath: string,
  ): Promise<Uint8Array | null> => {
    const reader = (
      source as unknown as { readTilesAsync?: (p: string) => Promise<Uint8Array | null> }
    ).readTilesAsync
    if (!reader) return null
    // A tileset name from `lvltypes` has no extension; the tree stores `.dt1`.
    const withExtension = relativePath.toLowerCase().endsWith('.dt1')
      ? relativePath
      : `${relativePath}.dt1`
    return reader(withExtension)
  }

  /** The game's 256-colour palette, without which tile art has no colours. */
  const loadPalette = async (): Promise<Palette | null> => {
    try {
      const response = await fetch(`${base}original/palette/pal.dat`, { cache: 'no-store' })
      if (!response.ok) return null
      return parsePalette(new Uint8Array(await response.arrayBuffer()))
    } catch {
      return null
    }
  }

  const [loaded, audio, data] = await Promise.all([
    Promise.all(
      Object.entries(TERRAIN).map(async ([kind, files]) => {
        const images = (await Promise.all(files.map(loadImage))).filter(
          (image): image is HTMLImageElement => image !== null,
        )
        return [kind, images] as const
      }),
    ),
    createAudio(base),
    loadGameData(base),
  ])
  const terrain: TerrainArt = {}
  for (const [kind, images] of loaded) {
    if (images.length > 0) terrain[kind as keyof TerrainArt] = images
  }

  // A real area, when the level tables and tile files are present. The town is
  // the character's actual starting place, so it is what the map becomes.
  let levelGrid: RealLevelGrid | null = null
  // Kept alongside the grid because the placements need the `.ds1`'s own object
  // records and its act, neither of which the grid carries.
  let levelObjects: { records: readonly PlacementRecord[]; act: number } | null = null
  // Kept for travel as well: the source is what fetches an area, the palette is what
  // gives its tiles colour, and the level is the area the game starts in — the travel
  // runtime adopts it rather than assembling the town a second time.
  let levelSource: Awaited<ReturnType<typeof createBrowserLevelSource>> = null
  let palette: Palette | null = null
  let startLevel: Level | null = null
  let startArea: AreaRef | null = null
  try {
    levelSource = await createBrowserLevelSource(base)
    if (levelSource) {
      const tables = levelSource.tables()
      const town = tables.presets.find((preset) => preset.name.toLowerCase().includes('town'))
      if (town) {
        const loaded = await loadLevelWithFetch(levelSource, town.id, 20261013)
        if (loaded) {
          // The level's own DT1 art. Each tileset's blocks are assembled once
          // and cached: the town references the same few dozen tiles thousands
          // of times, and composing a picture per cell would be wasteful.
          const artCache = new Map<string, { art: TileArt; roofY: number } | null>()
          const tilesets = new Map<string, { bytes: Uint8Array; file: Dt1File }>()
          for (const name of loaded.tilesets) {
            const bytes = await loadTileFile(levelSource, name)
            if (bytes) tilesets.set(name, { bytes, file: parseDt1(bytes) })
          }
          palette = await loadPalette()
          console.log(`rasen: ${tilesets.size} tilesets, palette ${palette ? 'loaded' : 'missing'}`)

          // One block's picture on one pass, cached per block; the roof_y the
          // game subtracts from the tile's screen Y rides along.
          const blockArt = (
            tileset: string,
            blockIndex: number,
            layer: 'ground' | 'walls' | 'roof',
          ): { art: TileArt; roofY: number } | null => {
            const key = `${tileset}#${blockIndex}#${layer}`
            const cached = artCache.get(key)
            if (cached !== undefined) return cached
            const set = tilesets.get(tileset)
            let built: { art: TileArt; roofY: number } | null = null
            const block = set?.file.blocks[blockIndex]
            // Walls are their own pass: drawn over the actors, so they are kept
            // out of the floor picture and vice versa.
            // `ground` keeps the walls: it is the base picture, and anything it
            // omits must be supplied by a pass that is known to draw. The wall
            // pass then re-draws the walls that belong ABOVE the actors, which
            // costs a duplicate draw and guarantees nothing can ever vanish.
            const wanted = block === undefined ? false
              : layer === 'walls' ? isWallBlock(block)
              : layer === 'ground' ? blockLayer(block) !== 'roof'
              : blockLayer(block) === 'roof'
            if (set && palette && block && wanted) {
              const bitmap = assembleTile(block, palette, set.bytes, layer === 'roof' ? 'roof' : 'ground')
              if (bitmap) {
                built = {
                  art: {
                    canvas: bitmapToCanvas(bitmap),
                    frameX: bitmap.frameX,
                    frameY: bitmap.frameY,
                    // The wall pass records which face the block covered: the 3D
                    // layer places the wall on that side of the tile, which is
                    // what decides whether it hides a character in the same cell.
                    ...(layer === 'walls' ? { orientation: block.orientation } : {}),
                  },
                  roofY: block.roofY,
                }
              }
            }
            artCache.set(key, built)
            return built
          }

          // A cell's picture is the composition of every DS1 layer that
          // resolved — floors under walls, roofs on their own pass. Keeping
          // only the primary layer (what this used to do) is why a house had
          // a floor and no walls.
          const cellArtCache = new Map<string, TileArt | null>()
          const composeCell = (
            x: number,
            y: number,
            layer: 'ground' | 'walls' | 'roof',
          ): TileArt | null => {
            const key = `${x},${y},${layer}`
            const cached = cellArtCache.get(key)
            if (cached !== undefined) return cached
            const tile = loaded.tileAt(x, y)
            let built: TileArt | null = null
            const parts: { art: TileArt; roofY: number }[] = []
            let orientation: number | undefined
            for (const ref of tile?.refs ?? []) {
              const part = blockArt(ref.tileset, ref.blockIndex, layer)
              if (!part) continue
              // The cell's own wall face: the first wall block that named one.
              if (layer === 'walls' && orientation === undefined && part.art.orientation !== undefined) {
                orientation = part.art.orientation
              }
              parts.push(part)
            }
            if (parts.length > 0) {
              // The roof pass: the game subtracts roof_y from the tile's
              // screen Y, which is the same as moving the art up in-frame.
              const placed = parts.map((part) => ({
                art: {
                  canvas: part.art.canvas,
                  frameX: part.art.frameX,
                  frameY: part.art.frameY - (layer === 'roof' ? part.roofY : 0),
                },
              }))
              let minX = Infinity
              let minY = Infinity
              let maxX = -Infinity
              let maxY = -Infinity
              for (const { art } of placed) {
                minX = Math.min(minX, art.frameX)
                minY = Math.min(minY, art.frameY)
                maxX = Math.max(maxX, art.frameX + art.canvas.width)
                maxY = Math.max(maxY, art.frameY + art.canvas.height)
              }
              const canvas = document.createElement('canvas')
              canvas.width = Math.max(1, maxX - minX)
              canvas.height = Math.max(1, maxY - minY)
              const ctx = canvas.getContext('2d')
              if (ctx) {
                for (const { art } of placed) {
                  ctx.drawImage(art.canvas, art.frameX - minX, art.frameY - minY)
                }
                built = {
                  canvas,
                  frameX: minX,
                  frameY: minY,
                  ...(orientation !== undefined ? { orientation } : {}),
                }
              }
            }
            cellArtCache.set(key, built)
            return built
          }
          const artAt = (x: number, y: number): TileArt | null => composeCell(x, y, 'ground')
          const wallArtAt = (x: number, y: number): TileArt | null => composeCell(x, y, 'walls')
          const roofArtAt = (x: number, y: number): TileArt | null => composeCell(x, y, 'roof')

          levelGrid = {
            width: loaded.width,
            height: loaded.height,
            // The DS1 grid says which cells exist and where they block; the
            // ground kind is derived from that, because the tile *art* is a
            // separate step from the tile *layout*.
            kindAt: (x, y) => {
              const tile = loaded.tileAt(x, y)
              if (!tile || !tile.resolved) return null
              return loaded.walkable(x, y) ? 'path' : 'stone'
            },
            walkable: (x, y) => loaded.walkable(x, y),
            // The 5x5 sub-cell flags, so movement stops at the strip a wall
            // block actually denies instead of at the cell's centre bit.
            flagsAt: (x, y) => loaded.flagsAt(x, y),
            artAt,
            wallArtAt,
            roofArtAt,
          }
          // Report how much real art the bake will actually draw: a level that
          // resolves but has no pictures is the difference between the real
          // town and a flat floor.
          let withArt = 0
          let cells = 0
          for (let y = 0; y < loaded.height; y++) {
            for (let x = 0; x < loaded.width; x++) {
              if (!loaded.tileAt(x, y)) continue
              cells++
              if (artAt(x, y)) withArt++
            }
          }
          console.log(`rasen: tile art ${withArt}/${cells} cells (${artCache.size} pictures built)`)
          console.log(`rasen: real area "${loaded.presetName}" ${loaded.width}x${loaded.height} loaded`)
          levelObjects = { records: loaded.objects, act: monPresetAct(loaded.ds1.act) }
          startLevel = loaded
          // The area is joined to the level through the level's own id rather than
          // assumed to be 1: the preset the town was found by says which level it
          // belongs to, and that is the row the travel rules name.
          startArea = areasOf(tables).find((area) => area.id === loaded.levelId) ?? null
        }
      }
    }
  } catch (error) {
    console.warn('rasen: real level unavailable, using the generated map', String(error))
  }

  // Real item generation, when the item tables are exported. Without it the
  // game keeps its built-in loot, so a partial export still drops something.
  let drops: DropResolver | null = null
  try {
    const itemSource = await createItemDataSource(base)
    if (itemSource) {
      drops = itemSource.resolver
      console.log(
        `rasen: item tables loaded (${itemSource.missing.length ? `missing ${itemSource.missing.join(', ')}` : 'complete'})`,
      )
    }
  } catch (error) {
    console.warn('rasen: item tables unavailable', String(error))
  }

  // Real item graphics: 737 DC6 sprites from `global/items`, decoded once at
  // export time. Optional, like the rest of the art — a partial export keeps the
  // drawn icons.
  try {
    const itemArt = await loadItemArtIndex(base)
    console.log(
      itemArt
        ? `rasen: item art loaded — ${itemArt.count} sprites`
        : 'rasen: item art not exported, using drawn icons',
    )
  } catch (error) {
    console.warn('rasen: item art unavailable', String(error))
  }

  // Real monster tables: the level scaling, AI parameters and per-monster skills
  // all come from these rather than from invented curves.
  let monsters: MonsterTables | null = null
  try {
    const monsterSource = await createMonsterDataSource(base)
    if (monsterSource) {
      monsters = monsterSource.tables
      console.log(
        `rasen: monster tables loaded — ${monsters.byId.size} monsters, ${monsters.monLvl.size} levels` +
          (monsterSource.missing.length ? ` (missing ${monsterSource.missing.join(', ')})` : ''),
      )
    }
  } catch (error) {
    console.warn('rasen: monster tables unavailable', String(error))
  }

  // The calc-driven skill runtime: damage and mana become the numbers the game's
  // own formulas produce.
  let skills: SkillRuntime | null = null
  try {
    const skillSource = await createSkillDataSource(base)
    if (skillSource) {
      skills = skillSource.runtime
      console.log(
        `rasen: skill tables loaded — ${skillSource.tables.byName.size} skills` +
          (skillSource.missing.length ? ` (missing ${skillSource.missing.join(', ')})` : ''),
      )
    }
  } catch (error) {
    console.warn('rasen: skill tables unavailable', String(error))
  }

  // The area's own NPCs and objects: `.ds1` placements resolved through
  // `monpreset.txt`, `monstats.txt`, `superuniques.txt` and `objects.txt`, plus
  // the dialogue table the NPCs speak from.
  let world: WorldContent | null = null
  let monsterNames: MonsterNames | null = null
  // Also wanted by the travel runtime below: a load resolves an area's own placements
  // through the same tables, and needs the superunique rows the world block parsed.
  let worldSource: WorldDataSource | null = null
  let superUniques: SuperUniqueTable | null = null
  try {
    // The display names come from the two string tables the monster and NPC rows
    // key into; `monstats.NameStr` is a key, not a name, and is `Dummy` for a
    // good many rows including the town's guards.
    const [monsterStrings, npcStrings] = await Promise.all([
      fetch(`${base}original/strings_monsters.json`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : []))
        .catch(() => []),
      fetch(`${base}original/strings_npcs.json`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : []))
        .catch(() => []),
    ])
    const rows = await fetch(`${base}original/table_monstats.json`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : []))
      .catch(() => [])
    monsterNames = createMonsterNames(rows as never[], [npcStrings as never[], monsterStrings as never[]])
    console.log(`rasen: monster names — ${monsterNames.known} rows named by the string tables`)
  } catch (error) {
    console.warn('rasen: monster names unavailable', String(error))
  }

  try {
    worldSource = await createWorldDataSource(base, monsters)
    if (worldSource) {
      console.log(
        `rasen: world tables loaded — ${worldSource.objects.objects.length} objects, ` +
          `${worldSource.places.all.length} monpreset rows` +
          (worldSource.dialogue
            ? `, ${worldSource.dialogue.entries.length} dialogue lines (${worldSource.dialogue.speakers.length} speakers)`
            : ', no dialogue') +
          (worldSource.missing.length ? ` (missing ${worldSource.missing.join(', ')})` : ''),
      )
      if (levelObjects) {
        try {
          const response = await fetch(`${base}original/table_superuniques.json`, { cache: 'no-store' })
          if (response.ok) superUniques = parseSuperUniques((await response.json()) as never[])
        } catch {
          // A missing superunique table costs the named monsters, nothing else.
        }
        const placements = resolvePlacements(
          levelObjects.records,
          levelObjects.act,
          worldSource.places,
          worldSource.objects,
          monsters,
          superUniques,
        )
        const summary = summarisePlacements(placements)
        console.log(
          `rasen: area placements — ${summary.monsters} monsters (${summary.npcs} NPCs, ` +
            `${summary.superUniques} superuniques), ${summary.objects} objects, ` +
            `${summary.unresolved} unresolved`,
        )
        // The quest log's own step text. Without it the quests still have their
        // names and their dialogue and only the steps are missing, so a failed
        // or absent export costs nothing but the steps.
        let questStrings: StatRow[] | null = null
        try {
          const response = await fetch(`${base}original/strings_quests.json`, { cache: 'no-store' })
          if (response.ok) {
            questStrings = (await response.json()) as StatRow[]
            console.log(`rasen: quest strings — ${questStrings.length} rows`)
          }
        } catch {
          // Optional source; the quest index treats a null as "no steps".
        }
        world = {
          placements,
          dialogue: worldSource.dialogue,
          questStrings,
          nameOf: (id) => monsterNames?.of(id) ?? monsters?.byId.get(id)?.name ?? null,
        }
      }
    }
  } catch (error) {
    console.warn('rasen: world tables unavailable', String(error))
  }

  // Travel: the runtime that knows which areas exist, how they connect and how to
  // assemble one. It is the only place that loads a second area, and it is built from
  // the pieces above rather than from a loader of its own, so a build that got this far
  // has exactly the data the game itself uses.
  //
  // `hasWarpTiles` is *not* set here: the runtime measures it from each area's own
  // `.ds1`, which is the only thing that can answer it — the Rogue Encampment's three
  // orientation-10 tiles are why the town has a way out at all.
  let travel: TravelRuntime | null = null
  try {
    if (levelSource !== null && worldSource !== null) {
      travel = createTravelRuntime({
        source: levelSource,
        tables: levelSource.tables(),
        warpRows: (await fetch(`${base}original/table_lvlwarp.json`, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : []))
          .catch(() => [])) as Record<string, unknown>[],
        actRows: (await fetch(`${base}original/table_actinfo.json`, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : []))
          .catch(() => [])) as Record<string, unknown>[],
        seed: 20261013,
        places: worldSource.places,
        objects: worldSource.objects,
        monsters,
        superUniques,
        palette,
        terrain,
      })
      console.log(
        `rasen: travel ready — ${travel.areas.length} areas, ` +
          `${travel.current === null ? 'no area adopted yet' : travel.current.displayName}`,
      )
    }
  } catch (error) {
    console.warn('rasen: travel unavailable, the player will stay in one area', String(error))
  }

  // The class attribute table, for the character sheet.
  let charStats: CharStatsTable | null = null
  let statTable: StatTable | null = null
  try {
    const response = await fetch(`${base}original/table_charstats.json`, { cache: 'no-store' })
    if (response.ok) {
      charStats = parseCharStats((await response.json()) as StatRow[])
      console.log('rasen: charstats loaded')
    }
    const statResponse = await fetch(`${base}original/table_itemstatcost.json`, { cache: 'no-store' })
    if (statResponse.ok) {
      statTable = parseStatTable((await statResponse.json()) as StatRow[])
    }
  } catch (error) {
    console.warn('rasen: charstats unavailable', String(error))
  }

  // The game's own interface: its layout files, its sprite atlases and its string
  // tables, all from the package. Loading the menu means parsing the layouts
  // first, because the atlases to fetch are the ones the layouts name.
  const uiLoader = createAtlasLoader(`${base}original/ui/`)
  const uiStrings = await loadUiStrings(base)
  let screens: FrontendScreens | null = null
  try {
    screens = await loadFrontend(base, uiLoader, uiStrings, {
      width: liveViewport.width,
      height: liveViewport.height,
    })
    console.log(
      screens
        ? `rasen: front end loaded from the game's layouts (${uiStrings.keys} UI strings)`
        : 'rasen: front end layouts not exported, using the drawn start screen',
    )
  } catch (error) {
    console.warn('rasen: front end unavailable', String(error))
  }

  // The in-game HUD, from the game's own layout: the mini-menu buttons (Inventory,
  // Character, SkillTree, QuestLog, AutoMap, PauseMenu), the experience bar, the
  // stamina bar and the belt arrow, each with the art the layout names.
  // The waypoints, from `levels.txt`'s own `Waypoint` column. Independent of the UI
  // export: a build with the tables but no layouts still knows its waypoints.
  let waypoints: WaypointAct[] = []
  try {
    waypoints = await loadWaypoints(base)
    console.log(
      `rasen: waypoints from levels.txt — ${waypoints
        .map((entry) => `act ${entry.act} ${entry.areas.length}`)
        .join(', ')}`,
    )
  } catch (error) {
    console.warn('rasen: waypoints unavailable', String(error))
  }

  let hudLayers: UiLayerSet | null = null
  try {
    hudLayers = await loadUiLayers(base, uiLoader, uiStrings, {
      width: liveViewport.width,
      height: liveViewport.height,
    },
    // The HUD bar plus the panels that open over it. Loaded together because they
    // share most of their atlases and a widget in any of them has to measure and crop
    // identically. The `basedOn` bases come along because the derived files keep their
    // geometry; see `BASED_ON_PANELS`.
    UI_PANEL_LAYOUTS)
    if (hudLayers !== null) {
      const merged = new Map(hudLayers.roots)
      for (const [derived, base] of BASED_ON_PANELS) {
        const derivedRoot = hudLayers.roots.get(derived)
        const baseRoot = hudLayers.roots.get(base)
        if (derivedRoot === undefined || baseRoot === undefined) continue
        merged.set(derived, mergeBasedOn(baseRoot, derivedRoot))
      }
      hudLayers = { source: hudLayers.source, viewport: hudLayers.viewport, roots: merged }
    }
    console.log(
      hudLayers === null
        ? 'rasen: HUD layout not exported, the drawn bar stands in'
        : `rasen: UI layouts loaded — ${hudLayers.roots.size} of ${UI_PANEL_LAYOUTS.length} (${[...hudLayers.roots.keys()].join(', ')})`,
    )
  } catch (error) {
    console.warn('rasen: HUD layout unavailable', String(error))
  }

  // The three economies: the stash, a vendor's stock and the hireling roster.
  //
  // Last, and for two reasons. The stash's page sizes exist **only** in
  // `bankexpansionlayouthd` — no table states them — so the layout has to be parsed
  // first; and a store page names item *types*, so the item index has to exist before
  // its codes can be turned into base items. Both are optional: whatever is absent
  // ends up null and the panel that shows it says so.
  let economy: EconomyContent | null = null
  try {
    const stringTable = async (file: string): Promise<StringTable | null> => {
      const response = await fetch(`${base}original/${file}`, { cache: 'no-store' }).catch(() => null)
      if (response === null || !response.ok) return null
      return parseStringTable((await response.json()) as StringRow[])
    }
    const [mercenaryNames, uiRows, skillRows] = await Promise.all([
      stringTable('strings_mercenaries.json'),
      stringTable('strings_ui.json'),
      stringTable('strings_skills.json'),
    ])
    // `HireDesc`'s keys live across the two interface tables, so both are read
    // through one lookup rather than choosing between them.
    const descriptions = {
      get: (key: string): string | undefined => uiRows?.get(key) ?? skillRows?.get(key),
    }
    economy = await createEconomySource(base, drops?.index ?? null, {
      layoutFor: (name) => hudLayers?.roots.get(name) ?? null,
      sharedPages: 3,
      hirelingStrings: {
        ...(mercenaryNames === null ? {} : { names: mercenaryNames }),
        descriptions,
      },
    })
    console.log(
      `rasen: economy — stash ${economy.stash === null ? 'not modelled' : `${economy.stash.pages().length} pages`}, ` +
        `store pages ${economy.storePages === null ? 'none' : `${economy.storePages.pages.length} rows`}, ` +
        `hirelings ${economy.hirelings === null ? 'none' : `${economy.hirelings.rows.length} rows`}` +
        (economy.missing.length ? ` (missing ${economy.missing.join(', ')})` : ''),
    )
  } catch (error) {
    console.warn('rasen: economy unavailable', String(error))
  }

  // The hero's own animation art. The class comes from the skill tables, which are
  // loaded above; the art is keyed by the game's two-letter class code, which does
  // not follow from the name (`Assassin` is `ai`), so `anim-art.ts` holds the table.
  let heroArt: ActorArt | null = null
  try {
    // Any skill names the class it belongs to; the hero's own action bar is chosen
    // from the same column further down, so this agrees with what the game plays.
    const className =
      skills === null
        ? ''
        : ([...skills.tables.byName.values()].find((entry) => entry.charClass)?.charClass ?? '')
    const loaded = className === '' ? null : await loadHeroArt(base, className)
    if (loaded !== null) {
      heroArt = loaded.art
      console.log(
        `rasen: hero animations loaded — class ${className} as "${loaded.code}", ` +
          `${heroArt.byMode.size} modes` +
          (heroArt.missing.length ? `, missing ${heroArt.missing.length}` : ''),
      )
    } else {
      console.log('rasen: hero animations not exported, the drawn actor stands in')
    }
  } catch (error) {
    console.warn('rasen: hero animations unavailable', String(error))
  }

  // Every monster token's art, composed once. The key is `monstats.Code`
  // lower-cased and the weapon class is `monstats2.BaseW` — what the creature is
  // holding, which decides which arm art set it uses.
  let monsterArt: ReadonlyMap<string, ActorArt> | null = null
  try {
    const index = await loadAnimIndex(base)
    if (index !== null && monsters !== null) {
      // `BaseW` is `monstats2`'s own column and lives under the geometry's `size`;
      // it is what the creature is holding, which picks the arm art set. The 128
      // monsters with no `monstats2` row fall back to the unarmed set.
      const tokens = [...monsters.byId.values()].map((def) => {
        const weapon = monsters.geometry.get(def.id)?.size.baseWeapon ?? ''
        return { code: def.code, weapon: weapon === '' ? 'hth' : weapon }
      })
      monsterArt = await loadMonsterArtMap(base, index, tokens)
      console.log(
        `rasen: monster animations loaded — ${monsterArt.size} of ${new Set(tokens.map((t) => t.code.toLowerCase())).size} tokens` +
          (monsterArt.size < 1 ? ' (none)' : ''),
      )
    }
  } catch (error) {
    console.warn('rasen: monster animations unavailable', String(error))
  }

  const game = new Game(
    20261013,
    { loot, terrain },
    data,
    levelGrid,
    drops,
    monsters,
    skills,
    charStats,
    statTable,
    world,
    heroArt,
    monsterArt,
    economy,
  )

  // Hand the travel runtime in, together with the area the map was baked from: the
  // runtime adopts it rather than assembling the town again, which is what keeps the
  // start-up cost where it was and gives the town's own door tiles to the per-frame
  // door check. See `Game.setTravelRuntime`.
  game.setTravelRuntime(
    travel,
    travel !== null && startArea !== null && startLevel !== null
      ? { area: startArea, level: startLevel }
      : null,
  )
  console.log(
    travel === null
      ? 'rasen: travel is off — the level tables were not exported'
      : `rasen: travel start — ${startArea?.displayName ?? 'unknown area'}, ` +
          `${game.travelOptions().length} ways out ` +
          `(${game.travelOptions().filter((option) => option.loadable).length} enterable)`,
  )


  // The character list the menu shows. The layout gives the row template but a
  // layout cannot say how many characters exist, so the rows are the game's own
  // hero with the class its tables assign.
  const characters: FrontendCharacter[] = [
    {
      name: 'Sanctum',
      className: game.characterClassLabel(),
      level: game.heroLevel,
      hardcore: false,
      expansion: true,
    },
  ]

  // -- input ---------------------------------------------------------------

  const stick = createVirtualStick({ radius: 62, deadZone: 0.15 })
  const recognizer = createGestureRecognizer({
    dragThreshold: 11,
    longPressDelay: 480,
    doubleTapDelay: 260,
  })

  bindInput(container, {
    stick: { stick },
    gestures: { recognizer },
  })

  recognizer.on((event) => {
    if (event.type !== 'tap') return
    if (!started.value) return
    // Tap-to-move: the tap point becomes a world tile, and the game decides
    // whether that means "walk there" or "attack what you tapped".
    const world = game.screenToWorld(event.x, event.y)
    audio.play('ui', 0.5)
    game.moveTo(world.x, world.y)
  })

  const fireball = new SkillButtonControl({
    onAim: (active, angle) => game.setAim(active, angle),
    onCast: (angle) => {
      // A drag aims; a tap fires at whatever the game auto-targets.
      if (angle !== null) game.setAim(true, angle)
      game.useSkill('fireball')
      game.setAim(false, angle ?? 0)
    },
    // Holding repeats the cast until the finger lifts.
    onHold: (active) => game.setHoldCast(active ? 'fireball' : null),
  })

  // -- keyboard (desktop) --------------------------------------------------

  const keys = setupKeyboard(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
  let muted = false
  const started = ref(false)
  // The pause layout is raised on Escape and lowered by its own Resume widget.
  const paused = ref(false)
  /** The skill panel's state, toggled from the HUD button or the K key. */
  const skillsOpen = ref(false)
  const toggleSkills = (): void => {
    skillsOpen.value = !skillsOpen.value
  }
  /** The inventory panel's state, toggled from the HUD button or the I key. */
  const bagOpen = ref(false)
  const toggleBag = (): void => {
    bagOpen.value = !bagOpen.value
  }
  /** The character sheet's state. */
  const charOpen = ref(false)
  const toggleChar = (): void => {
    charOpen.value = !charOpen.value
  }
  /** The quest log: which act it shows, and whether it is open. */
  const questOpen = ref(false)
  const act = ref(1)
  const toggleQuest = (): void => {
    questOpen.value = !questOpen.value
  }
  /** The stash, the waypoint list, a vendor's shop and a mercenary's equipment. */
  const stashOpen = ref(false)
  const toggleStash = (): void => {
    stashOpen.value = !stashOpen.value
  }
  const waypointOpen = ref(false)
  const toggleWaypoint = (): void => {
    waypointOpen.value = !waypointOpen.value
  }
  const vendorOpen = ref(false)
  const toggleVendor = (): void => {
    vendorOpen.value = !vendorOpen.value
  }
  const hirelingOpen = ref(false)
  const toggleHireling = (): void => {
    hirelingOpen.value = !hirelingOpen.value
  }

  window.addEventListener('keydown', (event) => {
    if (!started.value) return
    if (event.repeat) return
    if (event.code === 'Digit2') game.useSkill('fireball')
    else if (event.code === 'Digit3') game.useSkill('nova')
    else if (event.code === 'Space') game.useSkill('potion')
    else if (event.code === 'KeyM') toggleMute()
    else if (event.code === 'KeyK') toggleSkills()
    else if (event.code === 'KeyI') toggleBag()
    else if (event.code === 'KeyC') toggleChar()
    else if (event.code === 'KeyQ') toggleQuest()
    // The four panels the export has and the mini-menu does not bind: the town stash,
    // the waypoint list, a vendor's shop and the mercenary's sheet. `KeyW` is free
    // because movement is read from the arrow keys and the WASD set `setupKeyboard`
    // is given, which does not include it.
    else if (event.code === 'KeyB') toggleStash()
    else if (event.code === 'KeyW') toggleWaypoint()
    // Walk out the first way the tables give. The ways-out list is the pointer's route
    // and this is the keyboard's: from the Rogue Encampment the first one this build
    // can enter is the Outer Cloister, and with nothing to enter it reports the
    // refusal of the first door — which is how the town gate explains itself.
    else if (event.code === 'KeyG') void game.travelToNextOption()
    else if (event.code === 'KeyV') toggleVendor()
    else if (event.code === 'KeyH') toggleHireling()
    else if (event.code === 'KeyT' || event.code === 'Enter') {
      // Same gesture as the prompt button: open the box if it is shut, step
      // through it if it is open.
      if (game.hud.dialogue.value === null) game.talk()
      else game.advanceDialogue()
    } else if (event.code === 'Escape') {
      // The pause layout is what Escape raises in the game, and the dialogue box is
      // what it dismisses when one is open.
      if (game.hud.dialogue.value !== null) game.closeDialogue()
      else {
        paused.value = !paused.value
        game.setPaused(paused.value)
      }
    }
  })

  const toggleMute = (): void => {
    muted = !muted
    audio.setMuted(muted)
    mutedSignal.value = muted
  }
  const mutedSignal = ref(false)

  // -- sound ---------------------------------------------------------------

  game.onSound((cue) => audio.play(cue))

  // -- frame loop ----------------------------------------------------------

  const applyInput = (): void => {
    if (stick.active) {
      game.setStickFromScreen(stick.value.x, stick.value.y, stick.origin.x, stick.origin.y)
      return
    }
    let x = 0
    let y = 0
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
    if (x !== 0 || y !== 0) {
      // Screen input → world direction, the same conversion the stick gets.
      const world = game.screenDeltaToWorld(x, y)
      game.setWorldDirection(world.x, world.y)
    } else {
      game.clearStick()
    }
  }

  let last = performance.now()
  const loop = (now: number): void => {
    const dt = Math.min(now - last, 100)
    last = now
    applyInput()
    game.update(dt)
    syncActor3DPool(game)
    requestAnimationFrame(loop)
  }

  // -- mount ---------------------------------------------------------------

  // Report which real content loaded, so a missing export is visible rather
  // than silently falling back.
  console.log(
    hasGameData(data)
      ? `rasen: retail data loaded — ${gameDataSummary(data)}`
      : 'rasen: no retail data tables found (built-in content in use)',
  )

  game.setPaused(true)
  // Development hook: the running game, so a driver (or a human with the
  // console) can read the state and drive the input the way a player does.
  // Development only — the production bundle has no `import.meta.env.DEV`.
  if (import.meta.env.DEV) {
    ;(globalThis as { game?: Game }).game = game
    ;(globalThis as { probe?: unknown }).probe = async () => {
      const core = await import('@rasenjs/core')
      const signals = await import('@rasenjs/reactive-signals')
      const runtime = core.getReactiveRuntime()
      const flag = signals.ref(false)
      const seen: boolean[] = []
      runtime.subscribe(() => flag.value, (v) => seen.push(v))
      flag.value = true
      await Promise.resolve()
      await Promise.resolve()
      // The expression form: a component called inside JSX.
      const { when } = await import('@rasenjs/core')
      const { mount } = await import('@rasenjs/dom')
      const Panel = (props: { flag: { value: boolean } }): unknown =>
        when({
          condition: () => props.flag.value,
          then: () => <span>PANEL</span>,
        })
      const host = document.createElement('div')
      document.body.appendChild(host)
      mount(<div>{Panel({ flag })}</div>, host)
      flag.value = true
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 50))
      return JSON.stringify({
        coreRefKind: typeof runtime.ref(0),
        seen,
        expressionForm: host.innerHTML,
      })
    }
  }

  mount(
    createApp({
      game,
      base,
      fireball,
      onNova: () => game.useSkill('nova'),
      onPotion: () => game.useSkill('potion'),
      started,
      paused,
      onTogglePause: () => {
        paused.value = !paused.value
        game.setPaused(paused.value)
      },
      onStart: () => {
        if (started.value) return
        started.value = true
        game.setPaused(false)
        audio.startMusic()
        audio.play('ui', 0.8)
      },
      skillsOpen,
      onToggleSkills: toggleSkills,
      bagOpen,
      onToggleBag: toggleBag,
      charOpen,
      onToggleChar: toggleChar,
      questOpen,
      onToggleQuest: toggleQuest,
      stashOpen,
      waypointOpen,
      vendorOpen,
      hirelingOpen,
      waypoints,
      onTravel: (areaId: number) => {
        void game.travelTo(areaId)
      },
      onTalk: () => {
        // Talking and stepping through a line are the same gesture in this
        // genre, so one control does both: open if shut, advance if open.
        if (game.hud.dialogue.value === null) game.talk()
        else game.advanceDialogue()
      },
      onAdvanceDialogue: () => game.advanceDialogue(),
      onCloseDialogue: () => game.closeDialogue(),
      screens,
      characters,
      hudLayers,
      act,
    })(),
    container,
  )

  requestAnimationFrame(loop)

  // Console handle for inspection while building the game.
  ;(window as unknown as { __arpg?: unknown }).__arpg = { game, audio, stick, originalArt, travel }
}

void main()
