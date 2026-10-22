import { describe, expect, it } from 'vitest'
import {
  ACTOR_MODES,
  ANIM_CLASS_CODES,
  animKeyFor,
  classAnimCode,
  CLASS_ANIM_CODE,
} from '../anim-art'

/**
 * The class and key vocabulary the animation files use.
 *
 * Three vocabularies for the same eight classes, and the tests below exist because
 * only one of them is derivable from the others — a class's animation code cannot
 * be computed from its name (`Assassin` is `ai`, `Druid` is `dz`, `Warlock` is
 * `wk`), and `skills.txt` uses a third spelling (`ama`, `bar`) that the rest of the
 * app reads. A wrong answer here means the hero silently falls back to drawn art,
 * which is exactly the failure this pins down.
 */

describe('classAnimCode', () => {
  it('maps the full names `charstats.txt` uses', () => {
    expect(classAnimCode('Amazon')).toBe('am')
    expect(classAnimCode('Barbarian')).toBe('ba')
    expect(classAnimCode('Paladin')).toBe('pa')
    expect(classAnimCode('Necromancer')).toBe('ne')
  })

  it('maps the classes whose code is not a prefix of their name', () => {
    // These three are the reason the table exists rather than a prefix rule.
    expect(classAnimCode('Assassin')).toBe('ai')
    expect(classAnimCode('Druid')).toBe('dz')
    expect(classAnimCode('Warlock')).toBe('wk')
  })

  it('maps the three-letter codes `skills.txt` uses', () => {
    // `Game.heroClass` reads this column, so it is the spelling that reaches here
    // in practice — the first version of this function only knew the full names and
    // the hero fell back to drawn art without an error.
    expect(classAnimCode('ama')).toBe('am')
    expect(classAnimCode('bar')).toBe('ba')
    expect(classAnimCode('sor')).toBe('so')
    expect(classAnimCode('nec')).toBe('ne')
  })

  it('passes through a code that is already the animation code', () => {
    for (const code of ANIM_CLASS_CODES) expect(classAnimCode(code)).toBe(code)
    expect(classAnimCode('AM')).toBe('am')
  })

  it('is case and whitespace insensitive', () => {
    expect(classAnimCode('  amazon ')).toBe('am')
    expect(classAnimCode('BARBARIAN')).toBe('ba')
  })

  it('returns null for a class it does not know', () => {
    expect(classAnimCode('')).toBeNull()
    expect(classAnimCode('cow')).toBeNull()
    expect(classAnimCode('rogue')).toBeNull()
  })

  it('covers all eight classes in every vocabulary it claims', () => {
    const codes = new Set(Object.values(CLASS_ANIM_CODE))
    expect(codes).toEqual(new Set(ANIM_CLASS_CODES))
    expect(ANIM_CLASS_CODES).toHaveLength(8)
  })
})

describe('animKeyFor', () => {
  it('builds a character key with the weapon class', () => {
    // The character's arm art differs with what is held, so the weapon class is
    // part of the key; `hth` is the unarmed set.
    expect(animKeyFor('char', 'ba', 'nu')).toBe('chars/ba/nu/hth')
    expect(animKeyFor('char', 'am', 'sc', 'bow')).toBe('chars/am/sc/bow')
  })

  it('builds a monster key', () => {
    // Monsters are keyed by `monstats.Code` lower-cased: the act 5 barbarians are
    // `Code` `0A` and their art lives under `monsters/0a/`.
    expect(animKeyFor('monster', '0a', 'a1', '1hs')).toBe('monsters/0a/a1/1hs')
    expect(animKeyFor('monster', 'sk', 'nu')).toBe('monsters/sk/nu/hth')
  })
})

describe('ACTOR_MODES', () => {
  it('lists the modes the export ships for every class', () => {
    // Seven modes, matching what `global/chars/<class>/` holds for all eight
    // classes; the export's manifest is checked against this list by its own tool.
    expect([...ACTOR_MODES]).toEqual(['nu', 'wl', 'rn', 'a1', 'sc', 'gh', 'dd'])
  })
})
