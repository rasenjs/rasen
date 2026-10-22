/**
 * Optional original artwork, if the player has extracted it.
 *
 * The extractor (`tools/extract-original.ts`) writes PNGs plus an `index.json`
 * describing where each one came from. This module reads that index and nothing
 * else: the files are ordinary PNGs on disk, so the DOM can point an `<img>` at
 * them directly and no decoding happens at run time.
 *
 * The index is **not** expected to exist. Everything in the app has a
 * procedurally-drawn fallback (see `sprites.ts` / `hud-icons.ts`), so a missing
 * index means "use our own art" rather than a failure — which is what keeps the
 * app working for anyone who has not extracted a package.
 */

export interface OriginalSprite {
  /** Logical path inside the game package, e.g. `hd/global/ui/panel/.../x.sprite`. */
  path: string
  /** File name inside the assets directory. */
  file: string
  width: number
  height: number
}

export interface OriginalArt {
  sprites: OriginalSprite[]
  /** Directory the files were served from, for building URLs. */
  base: string
}

interface IndexFile {
  sprites?: OriginalSprite[]
}

/**
 * Load the extracted-art index.
 *
 * @param base URL prefix the app is served from (so a sub-path deployment works)
 * @returns the index, or `null` when the player has not extracted anything
 */
export async function loadOriginalArt(base: string): Promise<OriginalArt | null> {
  const directory = `${base}original/`
  try {
    const response = await fetch(`${directory}index.json`, { cache: 'no-store' })
    if (!response.ok) return null
    const index = (await response.json()) as IndexFile
    const sprites = (index.sprites ?? []).filter(
      (sprite) => typeof sprite?.file === 'string' && typeof sprite?.path === 'string',
    )
    if (sprites.length === 0) return null
    return { sprites, base: directory }
  } catch {
    // A missing or unreadable index is the normal case, not an error.
    return null
  }
}

/** URL for one extracted sprite. */
export function spriteUrl(art: OriginalArt, sprite: OriginalSprite): string {
  return `${art.base}${sprite.file}`
}

/**
 * Find a sprite by a fragment of its logical path.
 *
 * Matching on a fragment rather than an exact path is deliberate: the exact
 * paths are game-version specific (that is what the manifest MD5 check is for),
 * so binding to them would turn a version difference into a broken interface.
 * Each caller passes a distinctive fragment and gets `undefined` when the
 * package does not have it.
 */
export function findSprite(art: OriginalArt | null, fragment: string): OriginalSprite | null {
  if (!art) return null
  const needle = fragment.toLowerCase()
  return art.sprites.find((sprite) => sprite.path.toLowerCase().includes(needle)) ?? null
}

/**
 * Build `hud-icons` overrides from the index.
 *
 * Only the icons the package actually contains are overridden; the rest keep the
 * drawn fallback, so a partially-extracted package still renders a complete HUD.
 */
export function iconOverrides(
  art: OriginalArt | null,
  mapping: Record<string, string>,
): Record<string, string> {
  const overrides: Record<string, string> = {}
  for (const [icon, fragment] of Object.entries(mapping)) {
    const sprite = findSprite(art, fragment)
    if (sprite) overrides[icon] = spriteUrl(art!, sprite)
  }
  return overrides
}
