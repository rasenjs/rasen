/**
 * Diablo II's level layout format (`.ds1`).
 *
 * A `.ds1` is a grid of cell references plus object records; the tileset it
 * points into is a separate `.dt1`. This module reads the layout only — what the
 * cells mean to a game (walkable, a wall, a door) is the game's business.
 *
 * Written with reference to the MIT `d2r-mobile` project
 * (`Copyright (c) 2026 jhaizhou`); `ds1.ts` states what was measured versus
 * cited.
 */

export * from './ds1'
