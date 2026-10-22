/**
 * The item graphics the game ships, as a name → URL index.
 *
 * `global/items` holds 737 DC6 sprites that `tools/export-item-art.ts` decodes
 * once with the shared 256-entry palette and writes as PNG. The base tables name
 * the file without its extension (`invfile: invhax`), and the retail spelling in
 * the tables does not always match the file on disk (`invrShae` vs
 * `invrshae.dc6`), so the lookup is case-insensitive.
 *
 * The index is installed once at startup, the same way the HUD's icon overrides
 * are, because the tables and the art are both optional: a build with no export
 * keeps the drawn stand-ins.
 */

export interface ItemArtIndex {
  /** Lower-cased graphic name (no extension) → URL under the asset base. */
  readonly byName: ReadonlyMap<string, string>
  readonly count: number
}

interface ItemArtManifest {
  items?: Array<{ code?: string; file?: string }>
}

let installed: ItemArtIndex | null = null

/** Installs the index the HUD resolves item graphics through. */
export function setItemArtIndex(index: ItemArtIndex | null): void {
  installed = index
}

/** The installed index, or null when no item art was exported. */
export function itemArtIndex(): ItemArtIndex | null {
  return installed
}

/** Builds the index from the exported manifest. */
export function createItemArtIndex(base: string, manifest: ItemArtManifest): ItemArtIndex {
  const byName = new Map<string, string>()
  for (const entry of manifest.items ?? []) {
    if (typeof entry.file !== 'string' || entry.file.length === 0) continue
    const key = (entry.code ?? entry.file.replace(/\.[^.]+$/, '')).toLowerCase()
    byName.set(key, `${base}original/itemart/${entry.file}`)
  }
  return { byName, count: byName.size }
}

/**
 * The URL for an item's graphic, or null when the game ships none.
 *
 * The caller draws its own fallback in that case rather than showing a broken
 * image: a base with no `invfile` is a real possibility in these tables.
 */
export function itemArtUrl(graphic: string | null, index = installed): string | null {
  if (index === null || graphic === null) return null
  return index.byName.get(graphic.toLowerCase()) ?? null
}

/** Fetches and installs the index; leaves the caller's fallback in place on failure. */
export async function loadItemArtIndex(base: string): Promise<ItemArtIndex | null> {
  try {
    const response = await fetch(`${base}original/itemart/index.json`, { cache: 'no-store' })
    if (!response.ok) return null
    const manifest = (await response.json()) as ItemArtManifest
    const index = createItemArtIndex(base, manifest)
    if (index.count === 0) return null
    setItemArtIndex(index)
    return index
  } catch {
    return null
  }
}
