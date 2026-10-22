/**
 * `objects.txt` — everything the maps place that is not a monster.
 *
 * A `.ds1` stores two kinds of placement: monsters (type 1, an index into
 * `monpreset.txt` for the act) and objects (type 2, an index into this table).
 * Objects are the chests, urns, doors, shrines, braziers and waypoints, and they
 * are the whole of a town's furniture: in `towns1.ds1` all 25 type-2 records are
 * objects from here, and in `expansion/town/townwest.ds1` all 38 are.
 *
 * ## The index
 *
 * The table carries its own `*ID` column, and the two do not agree: row 410 is
 * a section separator (`Class = Expansion`, every other field blank) whose `*ID`
 * is empty, and the ids continue at 410 on the row after it. The `.ds1` ids
 * therefore index `*ID` and not the row. Below 410 the two coincide, which is
 * why the distinction only shows up in the expansion object range — a chest in
 * Harrogath would otherwise resolve to a brazier.
 *
 * ## Modes
 *
 * Each object has up to eight modes (`NU`, `OP`, `ON`, `S1`..`S5` in
 * `objmode.txt`) and per mode a frame count, a frame time and a cycle flag. A
 * chest is `NU` when shut and `ON` when looted, which is what the `Selectable#`
 * and `Mode#` columns decide: `Mode#` is the mode the player can put it in, and
 * `Selectable#` whether that mode is worth highlighting under the cursor.
 */

import { tableNumber, tableString, type TableRow } from './monsters'

/** One of an object's eight modes. */
export interface ObjectMode {
  name: string
  /** `FrameCnt#` — frames in the sprite. Zero means the mode is unused. */
  frames: number
  /** `FrameDelta#` — milliseconds per frame. */
  frameDelta: number
  /** `CycleAnim#` — whether the frames loop rather than hold the last one. */
  cycle: boolean
  /** `Mode#` — the player can put the object into this mode. */
  operable: boolean
  /** `Selectable#` — the mode is worth a highlight under the cursor. */
  selectable: boolean
  /** `Lit#` — the mode is drawn on the light layer. */
  lit: boolean
  /** `BlocksLight#`. */
  blocksLight: boolean
  /** `HasCollision#` — the mode blocks movement. */
  hasCollision: boolean
}

export interface ObjectDef {
  /** The `*ID` the `.ds1` files index. */
  id: number
  /** `Class` — the game's identifier, e.g. `Casket5`, `DoorGateLeft`. */
  className: string
  /** `Name` — the display family, e.g. `Casket`, `LargeUrn`. */
  name: string
  /** `Token` — the art directory under `global/objects`. `null` for a dummy. */
  token: string | null
  /** `SizeX`/`SizeY` — the selection box, in tiles. */
  sizeX: number
  sizeY: number
  modes: readonly ObjectMode[]
  isDoor: boolean
  /** `ShrineFunction` — which shrine effect, 0 for none. */
  shrineFunction: number
  /** `Overlay` — the overlay played when the object is hit. */
  overlay: string | null
  /** `Damage` — damage dealt to whatever attacks it, 0 for prop objects. */
  damage: number
  /** `Gore` — whether it can be destroyed into gibs. */
  gore: boolean
  /** `Lockable` — whether it can be locked (doors, chests). */
  lockable: boolean
  /** `BlockMissile`. */
  blockMissile: boolean
  /** `DrawUnder` — drawn below the floor layer rather than above it. */
  drawUnder: boolean
  /** `OpenWarp` — opens a waypoint or a town portal. */
  openWarp: boolean
  /** `Restore` — whether the object resets when the area does. */
  restore: boolean
}

export interface ObjectTable {
  objects: readonly ObjectDef[]
  byId: ReadonlyMap<number, ObjectDef>
  byClass: ReadonlyMap<string, ObjectDef>
  byToken: ReadonlyMap<string, readonly ObjectDef[]>
  /** Mode names from `objmode.txt`, indexed by the `#` in the columns. */
  modes: readonly string[]
}

/** The modes `objects.txt` numbers 0..7, from `objmode.txt`. */
export function parseObjectModes(rows: readonly TableRow[]): readonly string[] {
  const modes: string[] = []
  for (const row of rows) {
    const token = tableString(row.Token) ?? tableString(row.token)
    if (token !== null) modes.push(token)
  }
  return modes
}

const MODE_SLOTS = 8

/**
 * Builds the index.
 *
 * `modes` is only used to name the per-mode fields; the frames and flags are
 * read by position either way, so a missing `objmode.txt` costs the names and
 * not the data.
 */
export function parseObjectTable(
  rows: readonly TableRow[],
  modes: readonly string[] = [],
): ObjectTable {
  const objects: ObjectDef[] = []
  const byId = new Map<number, ObjectDef>()
  const byClass = new Map<string, ObjectDef>()
  const byToken = new Map<string, ObjectDef[]>()

  for (const row of rows) {
    const id = tableNumber(row['*ID'])
    // The separator rows carry no id and are not entries at all.
    if (id === null) continue
    const className = tableString(row.Class) ?? ''
    if (className === '') continue

    const readModes = (): ObjectMode[] => {
      const list: ObjectMode[] = []
      for (let slot = 0; slot < MODE_SLOTS; slot += 1) {
        const frames = tableNumber(row[`FrameCnt${slot}`]) ?? 0
        const name = modes[slot] ?? `M${slot}`
        list.push({
          name,
          frames,
          frameDelta: tableNumber(row[`FrameDelta${slot}`]) ?? 0,
          cycle: (tableNumber(row[`CycleAnim${slot}`]) ?? 0) !== 0,
          operable: (tableNumber(row[`Mode${slot}`]) ?? 0) !== 0,
          selectable: (tableNumber(row[`Selectable${slot}`]) ?? 0) !== 0,
          lit: (tableNumber(row[`Lit${slot}`]) ?? 0) !== 0,
          blocksLight: (tableNumber(row[`BlocksLight${slot}`]) ?? 0) !== 0,
          hasCollision: (tableNumber(row[`HasCollision${slot}`]) ?? 0) !== 0,
        })
      }
      return list
    }

    const def: ObjectDef = {
      id,
      className,
      name: tableString(row.Name) ?? className,
      token: tableString(row.Token),
      sizeX: tableNumber(row.SizeX) ?? 1,
      sizeY: tableNumber(row.SizeY) ?? 1,
      modes: readModes(),
      isDoor: (tableNumber(row.IsDoor) ?? 0) !== 0,
      shrineFunction: tableNumber(row.ShrineFunction) ?? 0,
      overlay: tableString(row.Overlay),
      damage: tableNumber(row.Damage) ?? 0,
      gore: (tableNumber(row.Gore) ?? 0) !== 0,
      lockable: (tableNumber(row.Lockable) ?? 0) !== 0,
      blockMissile: (tableNumber(row.BlockMissile) ?? 0) !== 0,
      drawUnder: (tableNumber(row.DrawUnder) ?? 0) !== 0,
      openWarp: (tableNumber(row.OpenWarp) ?? 0) !== 0,
      restore: (tableNumber(row.Restore) ?? 0) !== 0,
    }

    objects.push(def)
    byId.set(id, def)
    // Later rows win a class-name clash, which matches the table's own order.
    byClass.set(className, def)
    if (def.token !== null) {
      const bucket = byToken.get(def.token)
      if (bucket) bucket.push(def)
      else byToken.set(def.token, [def])
    }
  }

  return { objects, byId, byClass, byToken, modes }
}

/** The object a `.ds1` type-2 record names, or null when the id is unknown. */
export function objectById(table: ObjectTable, id: number): ObjectDef | null {
  return table.byId.get(id) ?? null
}

/**
 * The object's `NU` frame count, i.e. how many frames it has when idle.
 *
 * Zero for a dummy, which is the signal a caller should draw nothing: `Null`
 * and the `barPatron`-style placeholders are real records with no art.
 */
export function idleFrames(def: ObjectDef): number {
  return def.modes[0]?.frames ?? 0
}
