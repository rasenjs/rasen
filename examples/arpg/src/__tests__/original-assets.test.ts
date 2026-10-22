import { describe, expect, it } from 'vitest'
import { findSprite, iconOverrides, spriteUrl, type OriginalArt } from '../original-assets'

/**
 * The matching logic decides which HUD icons come from extracted original art.
 * It runs against an index that may be absent, partial, or from a different game
 * build, so the interesting cases are the ones that must *not* throw and must
 * *not* invent an override.
 */

const art: OriginalArt = {
  base: '/original/',
  sprites: [
    { path: 'hd/global/ui/hud/actionbar/fire.sprite', file: 'fire.png', width: 64, height: 64 },
    {
      path: 'hd/global/ui/panel/hud_02/front_panel.sprite',
      file: 'front_panel.png',
      width: 512,
      height: 256,
    },
  ],
}

describe('original art index', () => {
  it('builds a URL from the serving prefix', () => {
    expect(spriteUrl(art, art.sprites[0])).toBe('/original/fire.png')
  })

  it('finds a sprite by a distinctive fragment, case-insensitively', () => {
    expect(findSprite(art, '/ACTIONBAR/FIRE')?.file).toBe('fire.png')
    expect(findSprite(art, 'front_panel')?.file).toBe('front_panel.png')
  })

  it('returns nothing for a package that lacks the fragment', () => {
    expect(findSprite(art, 'nostromo')).toBeNull()
  })

  it('tolerates no package at all', () => {
    expect(findSprite(null, 'anything')).toBeNull()
    expect(iconOverrides(null, { fireball: 'fire' })).toEqual({})
  })

  it('overrides only the icons the package actually has', () => {
    const overrides = iconOverrides(art, {
      fireball: '/actionbar/fire',
      nova: '/actionbar/frost', // not in this package
      potion: '/actionbar/health', // not in this package
    })
    expect(overrides).toEqual({ fireball: '/original/fire.png' })
  })

  it('does not depend on the exact game-version path', () => {
    // The same fragment has to match a package whose paths differ in case and
    // directory naming, because paths are build-specific.
    const other: OriginalArt = {
      base: '/original/',
      sprites: [
        { path: 'HD/Global/UI/HUD/ActionBar/Fire.sprite', file: 'f.png', width: 1, height: 1 },
      ],
    }
    expect(iconOverrides(other, { fireball: '/actionbar/fire' })).toEqual({
      fireball: '/original/f.png',
    })
  })
})
