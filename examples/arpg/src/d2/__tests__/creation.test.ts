/**
 * What a new character starts with.
 *
 * The expected numbers are the spec's per-class table, which it produced by
 * creating every class three times in the running game and reading the stats back.
 * They are checked against the real `charstats.txt` here, so this fails if either
 * the table parse or the creation formula drifts.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseCharStats, parseStatTable, type CharStatsRow, type StatRow } from '../stats'
import { initialBaseStats, initialRightSkill, initialSkillBytes, initialSkills } from '../creation'
import { readSave, readSummary, writeSave } from '../save/d2s'

function findTableDirectory(): string {
  let directory = process.cwd()
  for (;;) {
    for (const relative of ['public/original', 'examples/arpg/public/original', '../public/original']) {
      const candidate = resolve(directory, relative)
      if (existsSync(join(candidate, 'table_charstats.json'))) return candidate
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error('the extracted table export (public/original) was not found')
}

const statTable = parseStatTable(
  JSON.parse(readFileSync(join(findTableDirectory(), 'table_itemstatcost.json'), 'utf8')) as StatRow[],
)

const charStats = parseCharStats(
  JSON.parse(readFileSync(join(findTableDirectory(), 'table_charstats.json'), 'utf8')) as Array<
    Record<string, string | null>
  >,
)

function classRow(name: string): CharStatsRow {
  const row = charStats.get(name)
  if (row === null) throw new Error(`no ${name} row`)
  return row
}

/** Life, mana and stamina as the game stores them: points, with eight fraction bits. */
function stored(stats: ReturnType<typeof initialBaseStats>, id: number): number {
  return stats.find((stat) => stat.id === id)!.value
}

describe('initialBaseStats', () => {
  // The spec's table, all seven classes. Life is `vitality + hpAdd`, mana is the
  // `int` column, stamina is the `stamina` column — none of them scaled by a
  // per-point factor at level 1.
  const TABLE: ReadonlyArray<{ name: string; str: number; dex: number; energy: number; vit: number; life: number; mana: number; stamina: number }> = [
    { name: 'amazon', str: 20, dex: 25, energy: 15, vit: 20, life: 50, mana: 15, stamina: 84 },
    { name: 'sorceress', str: 10, dex: 25, energy: 35, vit: 10, life: 40, mana: 35, stamina: 74 },
    { name: 'necromancer', str: 15, dex: 25, energy: 25, vit: 15, life: 45, mana: 25, stamina: 79 },
    { name: 'paladin', str: 25, dex: 20, energy: 15, vit: 25, life: 55, mana: 15, stamina: 89 },
    { name: 'barbarian', str: 30, dex: 20, energy: 10, vit: 25, life: 55, mana: 10, stamina: 92 },
    { name: 'druid', str: 15, dex: 20, energy: 20, vit: 25, life: 55, mana: 20, stamina: 84 },
    { name: 'assassin', str: 20, dex: 20, energy: 25, vit: 20, life: 50, mana: 25, stamina: 95 },
  ]

  for (const expected of TABLE) {
    it(`gives a level-1 ${expected.name} the values the game logged`, () => {
      const stats = initialBaseStats(classRow(expected.name), 500)
      expect(stored(stats, 0)).toBe(expected.str)
      expect(stored(stats, 2)).toBe(expected.dex)
      expect(stored(stats, 1)).toBe(expected.energy)
      expect(stored(stats, 3)).toBe(expected.vit)
      expect(stored(stats, 6)).toBe(expected.life << 8)
      expect(stored(stats, 7)).toBe(expected.life << 8)
      expect(stored(stats, 8)).toBe(expected.mana << 8)
      expect(stored(stats, 9)).toBe(expected.mana << 8)
      expect(stored(stats, 10)).toBe(expected.stamina << 8)
      expect(stored(stats, 11)).toBe(expected.stamina << 8)
    })
  }

  it('starts at level 1 with no experience and 100 in the three resistances', () => {
    const stats = initialBaseStats(classRow('amazon'), 500)
    expect(stored(stats, 12)).toBe(1)
    expect(stored(stats, 13)).toBe(0)
    expect(stored(stats, 14)).toBe(0)
    expect(stored(stats, 30)).toBe(500)
    expect(stored(stats, 67)).toBe(100)
    expect(stored(stats, 68)).toBe(100)
    expect(stored(stats, 69)).toBe(100)
  })

  it('lists the stats in id order, the way the save writes them', () => {
    const ids = initialBaseStats(classRow('barbarian'), 500).map((stat) => stat.id)
    expect(ids).toEqual([...ids].sort((left, right) => left - right))
  })
})

describe('initialSkills', () => {
  const known: Record<string, number> = { Attack: 0, Throw: 2, Kick: 1, Unsummon: 3, 'Left Hand Throw': 4 }

  it('adds Attack first, then the class columns it knows', () => {
    const ids = initialSkills(classRow('barbarian'), (name) => known[name] ?? null)
    expect(ids[0]).toBe(0)
    expect(ids).toContain(4)
  })

  it('skips a name the skill table does not have', () => {
    expect(initialSkills(classRow('amazon'), () => null)).toEqual([0])
  })
})

describe('initialRightSkill', () => {
  const known = [0, 36]

  it('uses the class StartSkill in act 0', () => {
    const sorceress = classRow('sorceress')
    expect(initialRightSkill(sorceress, 0, known, (name) => (name === sorceress.startSkill ? 36 : null))).toBe(36)
  })

  it('leaves it on Attack outside act 0', () => {
    const sorceress = classRow('sorceress')
    expect(initialRightSkill(sorceress, 2, known, () => 36)).toBe(0)
  })

  it('leaves it on Attack when the class cannot use the skill', () => {
    expect(initialRightSkill(classRow('sorceress'), 0, known, () => 99)).toBe(0)
  })
})

describe('initialSkillBytes', () => {
  it('is one zero byte per class skill', () => {
    const bytes = initialSkillBytes(30)
    expect(bytes.length).toBe(30)
    expect(Array.from(bytes).every((byte) => byte === 0)).toBe(true)
  })
})

describe('a newly created character, saved and read back', () => {
  /** The empty sections a fresh character has: nothing done, nothing visited. */
  function blankSave(name: string, row: CharStatsRow) {
    return {
      header: {
        name,
        classId: charStats.names().indexOf(row.charClass),
        level: 1,
        status: 0,
        expansion: true,
        act: 0,
        difficulty: 0,
        mapSeed: 12345,
        lastPlayed: 1_700_000_000,
        skillsBar: { left: 0, right: initialRightSkill(row, 0, initialSkills(row, () => null), () => null) },
      },
      quests: [new Uint8Array(96), new Uint8Array(96), new Uint8Array(96)],
      waypoints: [0, 1, 2].map(() => {
        const record = new Uint8Array(16)
        record[0] = 0x02
        record[1] = 0x01
        // Waypoint 0 is the one a character always has.
        record[2] = 0x01
        return record
      }),
      npcs: {
        first: [new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)],
        second: [new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)],
      },
      stats: initialBaseStats(row, 500),
      skills: initialSkillBytes(),
      items: [],
    }
  }

  it('survives the round trip with its class, level and stats intact', () => {
    const row = classRow('barbarian')
    const bytes = writeSave(blankSave('Tester', row), statTable)
    const summary = readSummary(bytes)
    expect(summary.name).toBe('Tester')
    expect(summary.level).toBe(1)
    expect(summary.expansion).toBe(true)
    expect(summary.checksum.valid).toBe(true)
    const read = readSave(bytes, statTable, () => [])
    // A save holds only the stats `itemstatcost.txt` gives a width to. The four
    // that have none — the level-1 threshold and the three resistance offsets —
    // are rebuilt on load, which is why the game writes them and skips them here.
    const written = initialBaseStats(row, 500).filter((stat) => (statTable.get(stat.id)?.csvBits ?? 0) > 0)
    expect(read.stats).toEqual(written)
    const skipped = initialBaseStats(row, 500)
      .filter((stat) => (statTable.get(stat.id)?.csvBits ?? 0) === 0)
      .map((stat) => stat.id)
    expect(skipped).toEqual([30, 67, 68, 69])
  })

  it('writes a file the reader can size up before loading it', () => {
    const bytes = writeSave(blankSave('Tester', classRow('amazon')), statTable)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint32(0x008, true)).toBe(bytes.length)
  })
})
