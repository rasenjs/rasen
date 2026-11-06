/**
 * Collision against the drawn tile art.
 *
 * Two things have to agree or the player walks through walls that are drawn,
 * and stops in front of walls that are not:
 *
 * - an integer world position is a cell CENTRE, because a cell's artwork is
 *   drawn centred on `toScreen(x, y)` and the `.ds1` placements put NPCs and
 *   props at integer coordinates too;
 * - a cell is not all-or-nothing — a retail wall block denies a strip along one
 *   edge and leaves the centre free, so the test has to look at the 5x5 sub-cell
 *   the walker is actually standing on.
 */

import { describe, expect, it } from 'vitest'
import { dt1FlagIndex } from '../d2/dt1'
import { isWalkable, isWalkableBody, tileAt, type RealLevelGrid, type WorldMap } from '../world'

/** A 3x3 map of walkable path with no level art behind it. */
function plainMap(): WorldMap {
  const width = 3
  const height = 3
  return {
    width,
    height,
    tiles: Array.from({ length: width * height }, () => ({ kind: 'path', walkable: true }) as never),
    ground: {} as HTMLCanvasElement,
    wallCells: [],
    roof: {} as HTMLCanvasElement,
    groundX: 0,
    groundY: 0,
    groundWidth: 0,
    groundHeight: 0,
    props: [],
    heroStart: { x: 1, y: 1 },
    spawnPoints: [],
    bossSpawn: { x: 1, y: 1 },
    realLevel: null,
  }
}

/**
 * A level whose single cell at (1, 1) blocks the whole `gy = 0` row — the north
 * strip — and leaves everything else free. That is the shape of a retail wall
 * block: the footprint it denies is an edge, not the whole cell.
 */
function wallMap(): WorldMap {
  const flags = new Uint8Array(25)
  for (let gx = 0; gx < 5; gx += 1) flags[dt1FlagIndex(gx, 0)] = 1
  const level: RealLevelGrid = {
    width: 3,
    height: 3,
    kindAt: () => 'path',
    walkable: () => true,
    flagsAt: (x, y) => (x === 1 && y === 1 ? flags : null),
  }
  const map = plainMap()
  map.realLevel = level
  return map
}

describe('cell lookup', () => {
  it('treats an integer position as a cell centre, not a corner', () => {
    const map = plainMap()
    expect(tileAt(map, 1, 1)).not.toBeNull()
    expect(tileAt(map, 1.4, 1)).not.toBeNull()
    // 1.5 is the boundary with cell 2, which is still on this map.
    expect(tileAt(map, 1.6, 1)).not.toBeNull()
    // Off the map on both sides.
    expect(tileAt(map, 3, 1)).toBeNull()
    expect(tileAt(map, -3, 1)).toBeNull()
  })
})

describe('sub-cell collision', () => {
  it('is walkable at the centre of a cell whose edge strip blocks', () => {
    const map = wallMap()
    expect(isWalkable(map, 1, 1)).toBe(true)
  })

  it('is blocked inside the strip the wall block actually denies', () => {
    const map = wallMap()
    // The blocked row is the north strip: local y in [-0.5, -0.4).
    expect(isWalkable(map, 1, 0.55)).toBe(false)
    // ... and free again one sub-cell further in.
    expect(isWalkable(map, 1, 0.75)).toBe(true)
  })

  it('follows the cell it is in when walking across a boundary', () => {
    const map = wallMap()
    // In cell (1,2) there are no flags, so the same north offset is free.
    expect(isWalkable(map, 1, 1.55)).toBe(true)
  })

  it('falls back to the per-tile bit when the level has no flag grid', () => {
    const map = plainMap()
    expect(isWalkable(map, 1, 0.55)).toBe(true)
    map.tiles[0].walkable = false
    expect(isWalkable(map, 0, 0)).toBe(false)
  })
})

describe('the walker\'s footprint', () => {
  it('stops a sub-cell earlier than a point, on every side', () => {
    // The original game requires the walker's cell AND its four neighbours to be
    // free ("玩家占一个十字"), so the centre of a cell must be unreachable when
    // any orthogonal neighbour is blocked.
    const map = wallMap()
    // Cell (1,1) blocks its northern row; (1,0) is open in this fixture, so a
    // point test at the centre passes but the body test does not reach further
    // north than the blocked strip.
    expect(isWalkable(map, 1, 1)).toBe(true)
    expect(isWalkableBody(map, 1, 1)).toBe(true)
    // One sub-cell into the blocked row: both refuse.
    expect(isWalkable(map, 1, 0.56)).toBe(false)
    expect(isWalkableBody(map, 1, 0.56)).toBe(false)
  })

  it('refuses a spot whose neighbour is blocked even when the spot is free', () => {
    const flags = new Uint8Array(25)
    // Block only the eastern neighbour's west edge, i.e. the cell's own east row.
    for (let gy = 0; gy < 5; gy += 1) flags[dt1FlagIndex(4, gy)] = 1
    const level: RealLevelGrid = {
      width: 3,
      height: 3,
      kindAt: () => 'path',
      walkable: () => true,
      flagsAt: (x, y) => (x === 1 && y === 1 ? flags : null),
    }
    const map = plainMap()
    map.realLevel = level
    // Dead centre is free for a point...
    expect(isWalkable(map, 1, 1)).toBe(true)
    // ...and still free for the body, because the blocked row is a sub-cell away.
    expect(isWalkableBody(map, 1, 1)).toBe(true)
    // A sub-cell towards it is refused by both.
    expect(isWalkableBody(map, 1.21, 1)).toBe(false)
  })
})
