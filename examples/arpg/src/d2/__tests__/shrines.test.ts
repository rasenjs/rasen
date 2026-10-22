import { describe, expect, it } from 'vitest'
import { applyShrine, effectClassOf, parseShrines, pickShrine } from '../shrines'
import type { TableRow } from '../monsters'

/**
 * Shrines, and the honest line between what the table lets this code do and what it
 * only describes.
 *
 * The retail table states effects in prose plus an `effectclass`. Three of them name
 * a pool that is refilled, which needs no magnitude and is applied exactly; the
 * boosters name a direction ("Increases Defense") without an amount, so they are
 * reported as unmodelled rather than given an invented number. Against the real
 * export that is 4 applicable and 19 unmodelled, which
 * `tools/verify-shrines.ts` prints by name.
 */

const ROWS: TableRow[] = [
  { Name: 'None', '*Shrine Type': 'None', '*Effect': 'None', Code: '0', rarity: '1', LevelMin: '0' },
  {
    Name: 'Health Shrine',
    '*Shrine Type': 'Recharge',
    '*Effect': 'Gain full Life',
    Code: '2',
    rarity: '2',
    LevelMin: '1',
    effectclass: '2',
    StringName: 'ShrId2',
    StringPhrase: 'ShrMsg2',
    'reset time in minutes': '5',
  },
  {
    Name: 'Mana Shrine',
    '*Shrine Type': 'Recharge',
    '*Effect': 'Gain full Mana',
    Code: '3',
    rarity: '2',
    LevelMin: '1',
    effectclass: '3',
  },
  {
    Name: 'Refilling Shrine',
    '*Shrine Type': 'Recharge',
    '*Effect': 'Gain full Life and Mana',
    Code: '1',
    rarity: '1',
    LevelMin: '1',
    effectclass: '4',
  },
  {
    Name: 'Armor Shrine',
    '*Shrine Type': 'Booster',
    '*Effect': 'Increases Defense',
    Code: '6',
    rarity: '4',
    LevelMin: '5',
    effectclass: '4',
    'Duration in frames': '1200',
  },
]

describe('parseShrines', () => {
  it('reads the rows and indexes them by Code', () => {
    const table = parseShrines(ROWS)
    expect(table.shrines).toHaveLength(5)
    expect(table.byCode.get(2)?.name).toBe('Health Shrine')
    expect(table.byCode.get(6)?.durationFrames).toBe(1200)
  })

  it('marks the rows whose effect names a pool as applicable', () => {
    const table = parseShrines(ROWS)
    expect([...table.applicable].sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it('classifies by the table own effectclass column', () => {
    expect(effectClassOf(0)).toBe('none')
    expect(effectClassOf(1)).toBe('magic')
    expect(effectClassOf(2)).toBe('life')
    expect(effectClassOf(3)).toBe('mana')
    expect(effectClassOf(4)).toBe('pool-and-boost')
    // An unknown class is treated as no effect rather than as an assumed one.
    expect(effectClassOf(99)).toBe('none')
  })
})

describe('applyShrine', () => {
  const pools = { hp: 10, maxHp: 500, mana: 5, maxMana: 200 }
  const shrine = (code: number) => parseShrines(ROWS).byCode.get(code) as never

  it('refills life', () => {
    const { pools: after, result } = applyShrine(shrine(2), pools)
    expect(after.hp).toBe(500)
    expect(after.mana).toBe(5)
    expect(result.applied).toBe(true)
    expect(result.unmodelled).toBe(false)
  })

  it('refills mana', () => {
    const { pools: after } = applyShrine(shrine(3), pools)
    expect(after.mana).toBe(200)
    expect(after.hp).toBe(10)
  })

  it('refills both', () => {
    const { pools: after } = applyShrine(shrine(1), pools)
    expect(after.hp).toBe(500)
    expect(after.mana).toBe(200)
  })

  it('reports a booster as unmodelled rather than inventing a magnitude', () => {
    // "Increases Defense" says what, not by how much.
    const { pools: after, result } = applyShrine(shrine(6), pools)
    expect(result.applied).toBe(false)
    expect(result.unmodelled).toBe(true)
    expect(after).toEqual(pools)
    expect(result.effect).toBe('Increases Defense')
  })

  it('does not call the null row unmodelled', () => {
    // `None` has no effect at all, which is different from an effect we cannot
    // compute.
    const { result } = applyShrine(shrine(0), pools)
    expect(result.applied).toBe(false)
    expect(result.unmodelled).toBe(false)
  })

  it('carries the phrase key so a caller can announce it', () => {
    expect(applyShrine(shrine(2), pools).result.phraseKey).toBe('ShrMsg2')
  })

  it('does not mutate the pools it was given', () => {
    const before = { ...pools }
    applyShrine(shrine(1), pools)
    expect(pools).toEqual(before)
  })
})

describe('pickShrine', () => {
  it('never picks the null row', () => {
    const table = parseShrines(ROWS)
    for (let i = 0; i < 50; i += 1) {
      const def = pickShrine(table, 10, () => i / 50)
      expect(def?.code).not.toBe(0)
    }
  })

  it('respects LevelMin', () => {
    // The Armor Shrine is LevelMin 5, so a level 1 area cannot place it.
    const table = parseShrines(ROWS)
    for (let i = 0; i < 50; i += 1) {
      const def = pickShrine(table, 1, () => i / 50)
      expect(def?.code).not.toBe(6)
    }
  })

  it('weights by rarity, so a rarer shrine is picked less often', () => {
    const table = parseShrines(ROWS)
    const counts = new Map<number, number>()
    for (let i = 0; i < 800; i += 1) {
      const def = pickShrine(table, 10, () => i / 800)
      if (def) counts.set(def.code, (counts.get(def.code) ?? 0) + 1)
    }
    // Rarity 4 versus 2 and 1: the Armor Shrine should win the most draws.
    const armor = counts.get(6) ?? 0
    const health = counts.get(2) ?? 0
    expect(armor).toBeGreaterThan(health)
  })

  it('returns null when nothing is eligible', () => {
    const table = parseShrines([{ Name: 'None', Code: '0', rarity: '1', LevelMin: '0' }])
    expect(pickShrine(table, 10, () => 0.5)).toBeNull()
  })
})
