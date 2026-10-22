import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnimEntry, AnimIndex } from '../anim'
import {
  EFFECT_ART_FILE,
  FlatArtCache,
  flatArtCandidates,
  flatArtKey,
  flatArtName,
  loadFlatArt,
  resolveFlatArtKey,
} from '../anim-art'

/**
 * The flat-key vocabulary, and the loader that plays it.
 *
 * Characters and monsters are keyed by kind, code, mode and weapon class
 * (`chars/ba/nu/hth`); missiles and overlays are keyed by their own path
 * (`missiles/safearrow`, `overlays/expansion/poisonhit`) because the export files
 * them flat, with no mode and no weapon class to choose. The two spellings the game
 * uses for those files — `missiles.txt`'s `CelFile` (`SafeArrow`) and `overlays.txt`'s
 * `Filename` (`Expansion\PsyHammerHit`) — have to be reconciled with the manifest's
 * (`missiles/safearrow`, `overlays/expansion/psyhammerhit`), and a size or path that
 * is one character off means the art silently never loads: the effect stays drawn and
 * nothing anywhere throws.
 *
 * So every fixture here is synthetic — a manifest of one-frame animations around a
 * 4x6 cell, and a canvas that records instead of rasterising — because what is under
 * test is the naming, the search order and the caching, not the export's contents.
 */

/** Counts the sheets the loader asked for, so caching can be seen from outside. */
let loads = 0

/** An `Image` that loads whatever it is pointed at, unless the URL says otherwise. */
class FixtureImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  width = 4
  height = 6
  srcUrl = ''

  set src(value: string) {
    this.srcUrl = value
    loads += 1
    queueMicrotask(() => {
      if (value.includes('missing')) this.onerror?.()
      else this.onload?.()
    })
  }

  get src(): string {
    return this.srcUrl
  }
}

/** The couple of calls `composeAnimation` makes on a 2D context. */
function fixtureContext(): Record<string, unknown> {
  return { imageSmoothingEnabled: false, drawImage: vi.fn() }
}

/**
 * A one-direction, one-frame, one-layer animation: a 4x6 layer whose bottom row sits
 * on the anchor and whose left edge is two pixels left of it, so a correct
 * composition is one `drawImage` into a 6x9 cell.
 */
function fixtureEntry(name: string): AnimEntry {
  return {
    kind: 'missile',
    frames: 1,
    storedDirections: 1,
    layers: [{ slot: 'hd', name: `${name}-hd`, file: `${name}.dcc`, kind: 'dcc' }],
    layerOrders: [[0]],
    directions: [
      {
        source: 0,
        sheet: `${name}/00.png`,
        width: 4,
        height: 6,
        frames: 1,
        columnsPerBand: 1,
        bands: 1,
        columns: [{ x: 0, width: 4 }],
        rows: [{ y: 0, height: 6 }],
        drawOrder: [0],
        cells: [[[4, 6, -2, 0]]],
      },
    ],
  }
}

/** A manifest holding exactly the given keys. */
function fixtureIndex(keys: readonly string[]): AnimIndex {
  const animations: Record<string, AnimEntry> = {}
  for (const key of keys) animations[key] = fixtureEntry(key.replace(/\//g, '-'))
  return {
    palette: 'global/palette/act1/pal.dat',
    playedDirections: 8,
    directionRule: 'fixture',
    animations,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  loads = 0
})

/** Installs the two globals `composeAnimation` reaches for. */
function installFixtures(): void {
  vi.stubGlobal('Image', FixtureImage)
  vi.stubGlobal('document', {
    createElement: (): unknown => ({
      width: 0,
      height: 0,
      getContext: (kind: string) => (kind === '2d' ? fixtureContext() : null),
    }),
  })
}

describe('flatArtName', () => {
  it('lower-cases a file name, which is how the manifest spells it', () => {
    // `missiles.txt` writes `CelFile` in mixed case (`SafeArrow`) while the export
    // keys sheets lower-cased (`missiles/safearrow`).
    expect(flatArtName('SafeArrow')).toBe('safearrow')
    expect(flatArtName('FireArrowExplode2')).toBe('firearrowexplode2')
  })

  it('turns the tables’ DOS separators into path separators', () => {
    // `overlays.txt` and `missiles.txt` both write sub-directories with backslashes:
    // `Expansion\PsyHammerHit`, `expansion\FireTraumaMissile`.
    expect(flatArtName('Expansion\\PsyHammerHit')).toBe('expansion/psyhammerhit')
    expect(flatArtName('expansion\\poisonhit')).toBe('expansion/poisonhit')
  })

  it('trims whitespace and drops an extension', () => {
    // The tables pad some columns, and an extension would become part of the key.
    expect(flatArtName(' OverlayH ')).toBe('overlayh')
    expect(flatArtName('arrow.dcc')).toBe('arrow')
    expect(flatArtName('Assassin Dragon Flight')).toBe('assassin dragon flight')
  })

  it('is empty for an empty column, which is what a row with no art looks like', () => {
    expect(flatArtName('')).toBe('')
    expect(flatArtName('   ')).toBe('')
  })
})

describe('flatArtKey', () => {
  it('builds the key a missile is filed under', () => {
    // The whole key, for the Amazon's two arrow skills: Magic Arrow's `CelFile` is
    // `SafeArrow`, Fire Arrow's is `FireArrow`.
    expect(flatArtKey('missiles', 'SafeArrow')).toBe('missiles/safearrow')
    expect(flatArtKey('missiles', 'FireArrow')).toBe('missiles/firearrow')
  })

  it('keeps a sub-directory that the table wrote', () => {
    // Seven hundred of the 742 missile rows name a bare file; the rest carry the
    // `expansion\` prefix, and that prefix is part of the key.
    expect(flatArtKey('missiles', 'expansion\\FireTraumaMissile')).toBe(
      'missiles/expansion/firetraumamissile',
    )
    expect(flatArtKey('overlays', 'Expansion\\PoisonHit')).toBe('overlays/expansion/poisonhit')
  })

  it('is empty when the table named nothing, rather than a key with no name', () => {
    // Two `missiles.txt` rows and ten `overlays.txt` rows have a blank column; a key
    // of `missiles/` would be a lookup that could match nothing anyway.
    expect(flatArtKey('missiles', '')).toBe('')
  })
})

describe('flatArtCandidates', () => {
  it('tries the table’s own tree first, then the other one', () => {
    // Two real cross-references make this necessary: `missiles.txt`'s `FireExplode`
    // row points at a cel the export filed under the overlay tree, and the Teeth
    // Explode missile's cel is in both trees.
    expect(flatArtCandidates('missiles', 'arrow')).toEqual([
      'missiles/arrow',
      'missiles/extra/arrow',
      'missiles/expansion/arrow',
      'overlays/arrow',
      'overlays/extra/arrow',
      'overlays/expansion/arrow',
    ])
    expect(flatArtCandidates('overlays', 'ShockHitSm')[0]).toBe('overlays/shockhitsm')
    expect(flatArtCandidates('overlays', 'ShockHitSm')).toContain('missiles/shockhitsm')
  })

  it('does not append a segment to a name that already has one', () => {
    // `missiles/extra/expansion/x` is not a path the export can have written.
    expect(flatArtCandidates('missiles', 'expansion\\FireTraumaMissile')).toEqual([
      'missiles/expansion/firetraumamissile',
      'overlays/expansion/firetraumamissile',
    ])
  })

  it('offers nothing for an empty name', () => {
    expect(flatArtCandidates('overlays', '')).toEqual([])
  })
})

describe('resolveFlatArtKey', () => {
  const index = fixtureIndex([
    'missiles/safearrow',
    'missiles/expansion/firetraumamissile',
    'missiles/extra/teethexplode',
    'overlays/extra/fireexplode',
    'overlays/overlayh',
  ])

  it('resolves a bare name in its own tree', () => {
    expect(resolveFlatArtKey(index, 'missiles', 'SafeArrow')).toBe('missiles/safearrow')
    expect(resolveFlatArtKey(index, 'overlays', 'OverlayH')).toBe('overlays/overlayh')
  })

  it('resolves a name the export filed under `extra` or `expansion`', () => {
    expect(resolveFlatArtKey(index, 'missiles', 'expansion\\FireTraumaMissile')).toBe(
      'missiles/expansion/firetraumamissile',
    )
    expect(resolveFlatArtKey(index, 'missiles', 'teethexplode')).toBe('missiles/extra/teethexplode')
  })

  it('resolves a name from the other tree, which is how an explosion finds its art', () => {
    // `FireExplode` is a `missiles.txt` cel name; the export filed the animation
    // under `overlays/`, and the search reaches it.
    expect(resolveFlatArtKey(index, 'missiles', 'FireExplode')).toBe('overlays/extra/fireexplode')
  })

  it('is null for a name the manifest does not have', () => {
    // `ChainLightning` is a real `missiles.txt` `CelFile` with no exported art.
    expect(resolveFlatArtKey(index, 'missiles', 'ChainLightning')).toBeNull()
    expect(resolveFlatArtKey(index, 'missiles', '')).toBeNull()
  })
})

describe('loadFlatArt', () => {
  it('composes the animation the key names', async () => {
    installFixtures()
    const index = fixtureIndex(['missiles/safearrow'])
    const art = await loadFlatArt('', index, 'missiles/safearrow')
    expect(art).not.toBeNull()
    // The key comes back beside the sheet: that is the whole difference from the
    // character and monster path, which knows what it asked for already.
    expect(art?.key).toBe('missiles/safearrow')
    expect(art?.directions).toBe(1)
    expect(art?.frames).toBe(1)
    expect(art?.columns).toBe(1)
    // The cell is the layer's 4x6 box — two pixels left of the anchor and six above
    // its bottom row — plus a pixel of margin on each side, and the anchor is where
    // the unit's origin falls inside it.
    expect(art?.sheet.frameWidth).toBe(6)
    expect(art?.sheet.frameHeight).toBe(9)
    expect(art?.anchorX).toBe(3)
    expect(art?.anchorY).toBe(7)
  })

  it('is null for a key the manifest does not have', async () => {
    installFixtures()
    expect(await loadFlatArt('', fixtureIndex([]), 'missiles/arrow')).toBeNull()
  })

  it('is null for an animation with nothing to compose', async () => {
    installFixtures()
    const empty: AnimEntry = { ...fixtureEntry('empty'), frames: 0, directions: [] }
    const index: AnimIndex = { ...fixtureIndex([]), animations: { 'missiles/empty': empty } }
    expect(await loadFlatArt('', index, 'missiles/empty')).toBeNull()
  })
})

describe('FlatArtCache', () => {
  it('composes a key once, however many times it is asked for', async () => {
    installFixtures()
    const cache = new FlatArtCache('', fixtureIndex(['missiles/safearrow']))
    const first = await cache.get('missiles/safearrow')
    const loadsAfterFirst = loads
    const second = await cache.get('missiles/safearrow')
    expect(second).toBe(first)
    // The same sheet: an arrow fired a thousand times must not re-read its PNGs.
    expect(loads).toBe(loadsAfterFirst)
    expect(cache.loaded).toBe(1)
  })

  it('resolves a table’s file name, which is what the simulation has in hand', async () => {
    installFixtures()
    const cache = new FlatArtCache('', fixtureIndex(['missiles/extra/teethexplode']))
    expect(cache.keyForFile('missiles', 'teethexplode')).toBe('missiles/extra/teethexplode')
    const art = await cache.getForFile('missiles', 'teethexplode')
    expect(art?.key).toBe('missiles/extra/teethexplode')
  })

  it('peeks without composing, so a cast that cannot wait never blocks', async () => {
    installFixtures()
    const cache = new FlatArtCache('', fixtureIndex(['missiles/safearrow']))
    expect(cache.peekForFile('missiles', 'SafeArrow')).toBeNull()
    const art = await cache.getForFile('missiles', 'SafeArrow')
    expect(cache.peekForFile('missiles', 'SafeArrow')).toBe(art)
  })

  it('remembers what it could not answer, so a miss is reported once', async () => {
    installFixtures()
    const cache = new FlatArtCache('', fixtureIndex(['missiles/safearrow']))
    expect(await cache.get('missiles/nothing')).toBeNull()
    expect(await cache.getForFile('missiles', 'ChainLightning')).toBeNull()
    expect(cache.missing).toEqual(['missiles/nothing', 'missiles/chainlightning'])
    expect(cache.loaded).toBe(0)
  })

  it('composes a whole warm-up pass in one call', async () => {
    installFixtures()
    const cache = new FlatArtCache(
      '',
      fixtureIndex(['missiles/safearrow', 'missiles/teethexplode', 'overlays/overlayh']),
    )
    await cache.loadForFiles([
      { tree: 'missiles', fileName: 'SafeArrow' },
      { tree: 'missiles', fileName: 'teethexplode' },
      { tree: 'overlays', fileName: 'OverlayH' },
    ])
    expect(cache.loaded).toBe(3)
    expect(cache.missing).toEqual([])
  })
})

describe('EFFECT_ART_FILE', () => {
  it('names the game’s own overlay for the effect kinds that have one', () => {
    // `overlays.txt`'s `healing` row (`Filename` `OverlayH`) is the `castoverlay` of
    // the five healing skills, so it is the honest stand-in for the potion burst.
    expect(EFFECT_ART_FILE.heal).toEqual({ tree: 'overlays', fileName: 'OverlayH' })
  })

  it('leaves the kinds with no art out, rather than naming something plausible', () => {
    // A physical hit, a monster's death and a level-up are drawn by the actor's own
    // animations, and the tables name no overlay for the app's second skill — those
    // effects keep the ring they have always had.
    expect(EFFECT_ART_FILE.meleeHit).toBeUndefined()
    expect(EFFECT_ART_FILE.heroHurt).toBeUndefined()
    expect(EFFECT_ART_FILE.monsterDeath).toBeUndefined()
    expect(EFFECT_ART_FILE.missileImpact).toBeUndefined()
    expect(EFFECT_ART_FILE.missileBlocked).toBeUndefined()
    expect(EFFECT_ART_FILE.nova).toBeUndefined()
    expect(EFFECT_ART_FILE.levelUp).toBeUndefined()
  })
})
