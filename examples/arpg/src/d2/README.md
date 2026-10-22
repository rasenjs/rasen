# src/d2 — the game, driven by the retail tables

Everything in this folder implements Diablo II's rules **from the game's own
data**, not from invented numbers.

## Why this is possible at all

The retail package's `global/excel/*.txt` is not just a list of names. It stores
the game's *formulas as text* in Diablo II's "calc" mini-language, and the row
layout documents itself (`*calc1 desc` = "Damage %"). Real examples:

```
Fire Arrow      EDmgSymPerCalc = (skill('Exploding Arrow'.blvl)) * par8
Multiple Shot   calc1          = min(ln12,24)      # of Missiles created
Inner Sight     auralencalc    = ln34
Critical Strike passivecalc1   = dm12
```

`lnAB` interpolates between two skill parameters by level, `dmAB` is diminishing
returns, `skill('Name'.field)` reaches into another skill, `parN` reads the row's
own parameters. So skills, damage, auras, passives and monster skills can all be
*evaluated* rather than guessed.

## The honest boundary

The tables carry **parameters and formulas**. They do not carry **procedure**:
what a magic arrow does when it lands, how a monster chooses a target, how the
level generator lays out a cave. That lives in the game's compiled program, which
is why the reference project *runs* the binary rather than reimplementing it.

So: skill numbers, monster stats, loot, map layout and art are faithful because
they are the real data. Runtime behaviour that the tables do not describe is a
reimplementation, and is marked as such where it occurs.

## Layout

| file | what it is |
| ---- | ---------- |
| `calc.ts` | the D2 calc expression evaluator |
| `stats.ts` | the stat system (`itemstatcost.txt`) and character stats |
| `items.ts` | item generation from base items + affixes + uniques |
| `treasure.ts` | `treasureclassex.txt` drop resolution |
| `monsters.ts` | monster definitions and level scaling (`monstats`/`monlvl`) |
| `skills.ts` | skill execution: calc columns, auras, passives, missiles |
| `dt1.ts` | DT1 tile definitions |
| `levels.ts` | real level assembly from `lvlprest` + DS1 |

## The map: `dt1.ts` and `levels.ts`

`dt1.ts` decodes the catalogue a `.ds1` refers into. Read from the 260 version-7
files of the retail RomFS, a `.dt1` is a 276-byte header — version at `0x000`,
a flags dword at `0x004`, a 260-byte filename buffer, the block count at `0x10C`
and the block-array offset at `0x110`, which always holds 276 — followed by that
many 96-byte block headers, each of which points at its own array of 20-byte
sub-tile headers and the pixels behind them. A block's `(orientation,
mainIndex, subIndex)` triple is the key a `.ds1` cell carries; its 25 flag bytes
are the tile's contribution to the collision grid, five sub-cells per tile in
each direction.

The other six `.dt1` files in the tree (`act1/court/court.dt1` and five
neighbours) begin `04 00 00 00 01 00 00 00`. Their container is legible and
parsed — a count at `+20`, an offset table at `+24`, fixed 44-byte records — but
the record's fields are documented nowhere, so they are reported rather than
guessed at. No `LvlTypes` row names any of the six, so no level loads one.

`levels.ts` assembles a level from `LvlPrest`, `LvlTypes`, `Levels` and the real
`.ds1` files. Every preset that names more than one `.ds1` names files of
identical size — 490 of 490 — so those columns are *variants* of one room rather
than parts of one room, and `loadLevel(presetId, seed)` picks one and returns its
grid: per cell the tile key, whether it is walkable, and the `.ds1`'s objects.
The generator's arrangement of rooms into a level lives in the game's program,
not in these tables, so a preset is as far as shipped data can be followed
without reimplementing DRLG.

Walkability comes from the sub-tile flags, OR'd per layer exactly as the game's
own collision loader does it. Two limits are worth stating: a key no tileset the
level type names can supply is looked up in the whole tile tree (retail's lists
are incomplete — `Act 1 - Cave` names one tileset yet its rooms are padded with a
blank tile only `Act1/Outdoors/Blank.dt1` defines), and a key nothing at all can
supply falls back to the `.ds1`'s own unwalkable bit. Both are counted in
`LevelStats`, so a caller can tell what it got.

`tools/dump-level.mjs` prints a preset's summary and its walkable grid as ASCII:

```bash
cd examples/arpg
../../node_modules/.bin/tsx tools/dump-level.mjs "Act 1 - Town 1"
../../node_modules/.bin/tsx tools/dump-level.mjs "Act 1 - Cave W" --level-type 3 --subtiles
```
