/**
 * A browser `LevelSource`: the real level tables and tile files over HTTP.
 *
 * The tables come from the exported JSON (`table_lvlprest.json` etc.), and the
 * `.ds1`/`.dt1` files from the copied tile tree under `original/tiles/`. Five
 * tables are read: the three `levels.ts` assembles presets from, plus the
 * generator's own `table_lvlmaze.json` and `table_lvlsub.json`, which `d2/drlg.ts`
 * needs to plan a `DrlgType 1`/`3` area.
 *
 * The lookup lowercases the relative path because the extracted tree is
 * lowercase while the tables spell paths as `Act1/Town/TownN1.ds1`. Case
 * sensitivity here would be a silent "level not found" rather than an error, so
 * it is normalised in one place.
 */

import {
  configureLevels,
  levelTablesFromJson,
  loadLevel,
  type Level,
  type LevelSource,
  type LevelTables,
} from './levels'

const TILES_ROOT = 'original/tiles/'

async function fetchJson<T>(base: string, name: string): Promise<T[]> {
  const response = await fetch(`${base}original/${name}`, { cache: 'no-store' })
  if (!response.ok) return []
  return (await response.json()) as T[]
}

/**
 * Build a level source from the served data, or `null` when the tables are not
 * present. A null result means the caller should keep its own generated map.
 */
export async function createBrowserLevelSource(base: string): Promise<LevelSource | null> {
  const [lvlprest, lvltypes, levels, lvlmaze, lvlsub] = await Promise.all([
    fetchJson<Record<string, unknown>>(base, 'table_lvlprest.json'),
    fetchJson<Record<string, unknown>>(base, 'table_lvltypes.json'),
    fetchJson<Record<string, unknown>>(base, 'table_levels.json'),
    // The generator's two tables. A source that omits them still builds presets;
    // it just cannot plan a `DrlgType 1`/`3` area, which is what `d2/drlg.ts`
    // reports when they are absent.
    fetchJson<Record<string, unknown>>(base, 'table_lvlmaze.json'),
    fetchJson<Record<string, unknown>>(base, 'table_lvlsub.json'),
  ])
  if (lvlprest.length === 0 || lvltypes.length === 0) return null

  const tables: LevelTables = levelTablesFromJson({ lvlprest, lvltypes, levels, lvlmaze, lvlsub })

  const fileCache = new Map<string, Uint8Array | null>()

  const readTiles = async (relativePath: string): Promise<Uint8Array | null> => {
    const key = relativePath.toLowerCase()
    const cached = fileCache.get(key)
    if (cached !== undefined) return cached
    try {
      const response = await fetch(`${base}${TILES_ROOT}${key}`, { cache: 'no-store' })
      if (!response.ok) {
        fileCache.set(key, null)
        return null
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      fileCache.set(key, bytes)
      return bytes
    } catch {
      fileCache.set(key, null)
      return null
    }
  }

  // `LevelSource.readTiles` is synchronous, so the files a level needs are
  // prefetched before assembly rather than fetched lazily inside it.
  const source: LevelSource = {
    tables: () => tables,
    readTiles: (relativePath) => {
      const cached = fileCache.get(relativePath.toLowerCase())
      if (!cached) throw new Error(`level file not prefetched: ${relativePath}`)
      return cached
    },
  }

  return {
    ...source,
    // Exposed so the caller can warm the cache for one level before loading it.
    readTilesAsync: readTiles,
  } as LevelSource & { readTilesAsync: (p: string) => Promise<Uint8Array | null> }
}

/**
 * Load a level, fetching everything it needs first.
 *
 * The two phases exist because the assembler is synchronous: prefetch the
 * preset's own `.ds1` files and every `.dt1` of its tilesets, then assemble.
 */
export async function loadLevelWithFetch(
  source: LevelSource,
  presetId: number,
  seed: number,
): Promise<Level | null> {
  const prefetch = (source as LevelSource & { readTilesAsync?: (p: string) => Promise<Uint8Array | null> })
    .readTilesAsync
  if (!prefetch) {
    try {
      return loadLevel(presetId, seed, source)
    } catch {
      return null
    }
  }

  const tables = source.tables()
  const preset = tables.presets.find((p) => p.id === presetId)
  if (!preset) return null

  // The preset's own files…
  const wanted = new Set(preset.files.map((file) => file.toLowerCase()))
  // …plus every tile file of every tileset the level type lists, since a tile
  // reference resolves against those.
  const levelId = preset.levelId
  const level = tables.levels.find((l) => l.id === levelId)
  const levelType = tables.levelTypes.find((t) => t.id === level?.levelType)
  for (const file of levelType?.files ?? []) {
    if (file) wanted.add(file.toLowerCase())
  }

  await Promise.all([...wanted].map((file) => prefetch(file)))

  try {
    const loaded = loadLevel(presetId, seed, source)
    configureLevels(source)
    return loaded
  } catch (error) {
    // A level that cannot be assembled is reported and skipped: the game keeps
    // its generated map rather than failing to start.
    console.warn('level assembly failed:', String(error))
    return null
  }
}
