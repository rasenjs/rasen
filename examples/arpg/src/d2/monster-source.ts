/**
 * The browser side of monster data: fetch the tables, build the index.
 *
 * `monsters.ts` takes parsed rows, so this only has to know where the rows come
 * from. A missing table yields an empty list rather than an error, because a
 * partial export should still let the game run with its own content.
 */

import {
  parseMonsterTables,
  type MonsterTables,
  type TableRow,
} from './monsters'

/** The tables `parseMonsterTables` needs, in the exported naming. */
const REQUIRED = ['monstats', 'monstats2', 'monlvl', 'monai', 'monseq', 'levels'] as const

export interface MonsterDataSource {
  tables: MonsterTables
  missing: string[]
}

export async function createMonsterDataSource(base: string): Promise<MonsterDataSource | null> {
  const rows: Partial<Record<(typeof REQUIRED)[number], TableRow[]>> = {}
  const missing: string[] = []

  await Promise.all(
    REQUIRED.map(async (name) => {
      try {
        const response = await fetch(`${base}original/table_${name}.json`, { cache: 'no-store' })
        if (!response.ok) {
          missing.push(name)
          return
        }
        rows[name] = (await response.json()) as TableRow[]
      } catch {
        missing.push(name)
      }
    }),
  )

  // monstats is the one table without which there are no monsters to describe.
  if (!rows.monstats) return null

  return {
    tables: parseMonsterTables({
      monstats: rows.monstats,
      monstats2: rows.monstats2 ?? [],
      monlvl: rows.monlvl ?? [],
      monai: rows.monai ?? [],
      monseq: rows.monseq ?? [],
      levels: rows.levels ?? [],
    }),
    missing,
  }
}
