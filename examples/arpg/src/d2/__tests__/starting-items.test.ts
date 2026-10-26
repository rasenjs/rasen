/**
 * A starting kit, rolled against the game's own log.
 *
 * The two examples are the spec's: game seed `5389700c:0f9a1148`, an expansion
 * Sorceress and Barbarian created in the same batch. Every seed they list is here —
 * the player's, each copy's unit and start seed, the state each seed is left in
 * after its draws, and the game seed the two kits leave behind. That is the whole
 * point: a starting item is not "a staff with 15 durability", it is a staff whose
 * durability and whose later affixes both come from seeds this sequence produced.
 * Get one draw wrong and the items still look plausible; only these states show it.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { rollStartingItems, type KitSlot } from '../creation'
import type { ItemBaseRecord } from '../item-base'
import { step, type Seed } from '../rng'

function findTableDirectory(): string {
  let directory = process.cwd()
  for (;;) {
    for (const relative of ['public/original', 'examples/arpg/public/original', '../public/original']) {
      const candidate = resolve(directory, relative)
      if (existsSync(join(candidate, 'table_weapons.json'))) return candidate
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error('the extracted table export (public/original) was not found')
}

type Rows = Array<Record<string, string | null>>
const read = (name: string): Rows => JSON.parse(readFileSync(join(findTableDirectory(), name), 'utf8')) as Rows

const WEAPONS = read('table_weapons.json')
const ARMOR = read('table_armor.json')
const MISC = read('table_misc.json')
const TYPES = read('table_itemtypes.json')

const typeByCode = new Map(TYPES.map((row) => [String(row.Code ?? '').trim().toLowerCase(), row]))

/** The `Equiv1`/`Equiv2` chain a base belongs to, e.g. `staf → rod → blun → mele → weap`. */
function typeChain(code: string): string[] {
  const out: string[] = []
  const walk = (current: string, depth: number): void => {
    if (depth > 6 || out.includes(current)) return
    out.push(current)
    const row = typeByCode.get(current)
    if (row === undefined) return
    for (const column of ['Equiv1', 'Equiv2']) {
      const parent = String(row[column] ?? '').trim().toLowerCase()
      if (parent !== '') walk(parent, depth + 1)
    }
  }
  walk(code.toLowerCase(), 0)
  return out
}

/** The socket caps the type chain carries: the first non-zero one wins. */
function capsOf(chain: readonly string[]): [number, number, number] {
  for (const code of chain) {
    const row = typeByCode.get(code)
    if (row === undefined) continue
    const caps: [number, number, number] = [
      Number(row.MaxSockets1 ?? 0) || 0,
      Number(row.MaxSockets2 ?? 0) || 0,
      Number(row.MaxSockets3 ?? 0) || 0,
    ]
    if (caps[0] + caps[1] + caps[2] > 0) return caps
  }
  return [0, 0, 0]
}

/** The `StaffMods` column of the type chain, 7 when the base carries no class skills. */
function staffModsOf(chain: readonly string[]): number {
  for (const code of chain) {
    const row = typeByCode.get(code)
    if (row === undefined) continue
    const value = row.StaffMods
    if (value !== null && value !== undefined && String(value).trim() !== '') return Number(value) || 0
  }
  return 7
}

function baseOf(code: string): ItemBaseRecord | null {
  const row = [...WEAPONS, ...ARMOR, ...MISC].find((candidate) => String(candidate.code ?? '').trim() === code)
  if (row === undefined) return null
  const chain = typeChain(String(row.type ?? ''))
  return {
    code,
    types: chain,
    durability: Number(row.durability ?? 0) || 0,
    minac: Number(row.minac ?? 0) || 0,
    maxac: Number(row.maxac ?? 0) || 0,
    stackable: Number(row.stackable ?? 0) === 1,
    minstack: Number(row.minstack ?? 0) || 0,
    maxstack: Number(row.maxstack ?? 0) || 0,
    spawnstack: Number(row.spawnstack ?? 0) || 0,
    hasinv: Number(row.hasinv ?? 0) === 1,
    gemsockets: Number(row.gemsockets ?? 0) || 0,
    maxSockets: capsOf(chain),
    staffMods: staffModsOf(chain),
  }
}

/** The sliver of the class rows this needs: which items the class starts with. */
function kitOf(className: string): KitSlot[] {
  const rows = JSON.parse(readFileSync(join(findTableDirectory(), 'table_charstats.json'), 'utf8')) as Rows
  const row = rows.find((candidate) => String(candidate.class ?? '').toLowerCase() === className)
  if (row === undefined) throw new Error(`no ${className} row`)
  const kit: KitSlot[] = []
  for (let index = 1; index <= 10; index += 1) {
    const code = String(row[`item${index}`] ?? '').trim()
    const count = Number(row[`item${index}count`] ?? 0) || 0
    if (code === '' || code === '0' || count <= 0) continue
    kit.push({ code, count })
  }
  return kit
}

const GAME_SEED_ENTRY = { low: 0x5389700c, high: 0x0f9a1148 }

describe('the stock kits', () => {
  it('reads the Sorceress kit in the order the game gives it out', () => {
    expect(kitOf('sorceress').map((slot) => `${slot.code}x${slot.count}`)).toEqual([
      'sstx1',
      'hp1x4',
      'tscx1',
      'iscx1',
    ])
  })

  it('reads the Barbarian kit, one copy more than the Sorceress', () => {
    expect(kitOf('barbarian').map((slot) => `${slot.code}x${slot.count}`)).toEqual([
      'haxx1',
      'bucx1',
      'hp1x4',
      'tscx1',
      'iscx1',
    ])
  })
})

describe('a new Sorceress', () => {
  // Everything below is the spec's Example 1.
  const playerSeed: Seed = { ...GAME_SEED_ENTRY }
  step(playerSeed) // PlayerUnitInit's draw
  const gameSeed: Seed = { ...playerSeed }
  const items = rollStartingItems(kitOf('sorceress'), baseOf, gameSeed)

  it('leaves the game seed at the player step the run logged', () => {
    expect([playerSeed.low, playerSeed.high]).toEqual([0x48ac0a84, 0x22d7b3ef])
  })

  it('gives each copy the unit seed and start seed the run logged', () => {
    expect(items.map((item) => item.unitId)).toEqual([
      0x9f3e0b83, 0xbb44d1e8, 0x450d87c4, 0x61ad922c, 0x6cd49484, 0x6b5f9eca, 0xe40e20c9,
    ])
    expect(items.map((item) => item.start)).toEqual([
      0xb4da2652, 0x86e6a265, 0x21a3dbbd, 0x20da2c9a, 0xe6ec5b5e, 0x3e73ccac, 0x20d2ae4d,
    ])
  })

  it('rolls the staff the way the run logged it', () => {
    const staff = items[0]
    // 20 durability: half is 10, so the roll is 10 + Range(10) = 15, and the seed
    // is left where the log says it is.
    expect(staff.base).toEqual({ maxDurability: 20, durability: 15 })
    expect([staff.unitSeed.low, staff.unitSeed.high]).toEqual([0x968a8e69, 0x426b34ce])
    // The socket roll draws and refuses: 85 is over the threshold anyway, but a
    // starting item never gets sockets — the draw still happens.
    expect(staff.sockets.sockets).toBe(0)
    expect(staff.sockets.roll).toBe(85)
  })

  it('draws nothing for the potions and the two scrolls', () => {
    for (const item of items.slice(1)) {
      expect(item.sockets.drew).toBe(false)
      expect(item.base).toEqual({})
    }
  })

  it('leaves the game seed where the run left it: 15 steps', () => {
    expect([gameSeed.low, gameSeed.high]).toEqual([0x20d2ae4d, 0x5f1ebd78])
  })
})

describe('a new Barbarian', () => {
  // The spec's Example 2: same batch, same entry seed, one copy more.
  const gameSeed: Seed = { ...GAME_SEED_ENTRY }
  step(gameSeed)
  const items = rollStartingItems(kitOf('barbarian'), baseOf, gameSeed)

  it('takes the same seven first seeds and then its own eighth', () => {
    expect(items.map((item) => item.unitId)).toEqual([
      0x9f3e0b83, 0xbb44d1e8, 0x450d87c4, 0x61ad922c, 0x6cd49484, 0x6b5f9eca, 0xe40e20c9, 0xd4d82eb9,
    ])
    expect(items[7].start).toBe(0x2f6ab60b)
  })

  it('rolls the axe and the buckler the way the run logged them', () => {
    const axe = items[0]
    expect(axe.base).toEqual({ maxDurability: 28, durability: 21 })
    expect([axe.unitSeed.low, axe.unitSeed.high]).toEqual([0x968a8e69, 0x426b34ce])
    // 16 is below the 33 threshold, and the item still gets no sockets: a starting
    // item refuses after the draw, which is why the draw cannot be skipped.
    expect(axe.sockets.roll).toBe(16)
    expect(axe.sockets.sockets).toBe(0)

    const buckler = items[1]
    // Durability first (12 → 6 + Range(6) = 10), then defense in 4..6 = 6.
    expect(buckler.base).toEqual({ maxDurability: 12, durability: 10, armorClass: 6 })
    expect([buckler.unitSeed.low, buckler.unitSeed.high]).toEqual([0x817aac35, 0x18cdd4ab])
    expect(buckler.sockets.roll).toBe(7)
  })

  it('leaves the game seed where the run left it: 17 steps', () => {
    expect([gameSeed.low, gameSeed.high]).toEqual([0x2f6ab60b, 0x58c69aea])
  })
})
