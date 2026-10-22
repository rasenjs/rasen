# Reading the original game's assets

This folder contains ports of the reference project's extractors, so the app can
draw the original game's own art instead of an imitation of it.

| File | Ported from |
| ---- | ----------- |
| `nvn-tex.ts` | `dm/gfx/nvn/nvn_tex.c` (which ports deko3d's `dk_image.cpp`, zlib licence, © 2018-2020 fincs) |
| `nvn-deswizzle.ts` | `dm/gfx/tex/nvn_deswizzle.c`, plus the DXT5 block decode the original delegates to Pillow |
| `romfs.ts` | `dm/ios/tools/romfs_art.py` and `touch_layout.py`'s entry reader |
| `sprite.ts` | `romfs_art.py`'s `sprite()` / `frame()` |
| `md5.ts` | — (needed because the manifest is MD5-verified, and the browser has no `crypto` MD5) |
| `bitknit2.ts` | `eiz/pybg3`'s `src/rans.h` (MIT, © 2024 Mackenzie Straight) — the BitKnit2 decoder that Granny3D `.model` sections are compressed with |
| `png.ts` | — (the original hands linear data to Pillow; here we encode PNG ourselves) |

## What this is, and what it is not

It is **format knowledge**: how a Switch texture is laid out in memory, how the
package index addresses an entry, how an `SpA1` sprite is framed. That knowledge
is MIT-licensed code from the reference project and is reproduced here as code.

It is **not game data, and it fetches none.** The reader only opens files the
caller supplies. Every entry is MD5-checked against the manifest, so a wrong game
version fails loudly instead of decoding into wrong pixels. The reference project
takes the same position in its `docs/GAME_FILES.md`: the repository "does not
contain any game files and never will."

The output directory (`examples/arpg/public/original/`) is git-ignored for the
same reason.

## Using it

Point it at a `RomFS` directory extracted from your own copy of the game —
`RomFS/data/build_manifest.psv` plus the `.data` archives. The reference project
documents producing that folder with `hactool` from a dump of your own cartridge
(`dm/tools/extract_game.sh`).

```bash
# What paths does my package actually contain?
yarn workspace @rasenjs/examples-arpg assets:list | grep -i panel

# Decode matching sprites to PNG (into public/original/, which is git-ignored)
yarn workspace @rasenjs/examples-arpg assets:extract hd/global/ui/panel

# Or against an explicit location
yarn workspace @rasenjs/examples-arpg assets:extract '' --romfs ~/dm-work/.../RomFS
```

`index.json` records where each file came from, so it stays obvious that the
assets were extracted locally rather than shipped.

## The honest limit

Original art gets you the original **look**. It does not get you the original
**game**: skills, damage, monster AI, loot rolls and quest flow live in the
game's compiled program, not in its assets, and no extractor can read them. The
reference project does not reimplement any of that either — it *runs* the
original binary behind a compatibility layer, which is what a browser cannot do.

So the boundary of what this folder can deliver is: a faithful interface and a
faithful art pipeline, on top of game systems written from scratch.

---

## Verification: is this code equivalent to the reference?

Yes, and it is checked rather than asserted. Two differential tests compare this
port against the reference implementations directly:

| Test | Compared against | Result |
| ---- | ---------------- | ------ |
| `__tests__/nvn-reference.test.ts` | `nvn_tex.c` + `nvn_deswizzle.c`, compiled unmodified and run over **180 descriptors** (BC1/BC3, uncompressed, ASTC, automatic and packaged block heights, mip chains, 1D/2D/3D/array/cubemap targets, LINEAR, multisampled, BUFFER, unknown format) | layout, layer size, alignment, block sizes, every level offset, geometry, and **FNV checksums of the deswizzled bytes and of the swizzled round trip** all match |
| `__tests__/dxt5-reference.test.ts` | `romfs_art.sprite()` (which decodes through Pillow) on crafted blocks covering both colour modes and both alpha modes | RGBA byte-for-byte |
| `romfs` fixtures + a synthetic package | `romfs_art.read()` + `romfs_art.sprite()` | raw bytes and RGBA SHA-256 identical for raw, zlib and chunked entries, and for `SpA1` v31 and v61 |

The differential testing paid for itself immediately: it caught three bugs that a
synthetic round-trip test could not have caught, all of which would have silently
produced wrong pixels once real files arrived:

1. **Block-height selection** — the C uses truncating integer division
   (`(ah + ah/2 + 7) / 8`); the port used `Math.ceil`, picking one block height
   too many. Layout and every level offset after it were wrong.
2. **RGB565 → 8-bit expansion** — DXT5 packs 5- and 6-bit channels; the correct
   expansion is bit replication (`(v << 3) | (v >> 2)`), not rescaling by
   `255/31`. Off-by-one on some channel values.
3. **Two BC3 details** — the interpolated colours belong in palette slots 2 and
   3 (not 1 and 2), and BC3's colour block **always** uses the four-colour
   formulas, ignoring the `colour0 > colour1` test that BC1 uses. Pillow states
   this outright in `BcnDecode.c`: *"BC2 and BC3 reuse BC1 color blocks but
   always act like c0 > c1"*. Since the reference pipeline decodes every original
   sprite through Pillow, matching it is what makes the output identical.

## What has to come from the game files, and what does not

Derived from what the reference project's own tools read. `probe` reports which
of these are actually present in a given package:

```bash
yarn workspace @rasenjs/examples-arpg assets:extract probe --romfs <RomFS>
```

| What | Where in the package | Reader status |
| ---- | -------------------- | ------------- |
| **UI art** (panels, orbs, skill icons, item icons, cursor) | `hd/**/*.sprite` (`SpA1` v31/v61) | **Done and verified** |
| **Fonts** | `hd/ui/fonts/*.ttf` | Done (plain file read) |
| **All game text**, all languages | `data/local/lng/strings/*.json` | No reader needed (JSON) |
| **UI layout geometry** (panel positions/sizes) | `hd/**/layouts/*.json` | Not ported yet — `touch_layout.py` has the reader |
| **Level/area definitions** | `data/global/excel/Levels.txt`, `LvlPrest.txt`, `LvlTypes.txt`, `LvlMaze.txt`, `LvlWarp.txt` | No reader needed (TSV) |
| **Numeric rules data** (xp curve, monster stats, uniques, skills, stat ids) | `data/global/excel/{experience,monstats,UniqueItems,Skills,Skilldesc,ItemStatCost}.txt` | No reader needed (TSV) |
| **Environment: biome, day/night, lighting** | `hd/env/preset/*.json`, `hd/env/vis/*` | No reader needed (JSON) |
| **Terrain / environment art** | `hd/env/**/*.texture`, `hd/global/tiles/**` | **Not ported** — the format is documented in `dm/tools/astc_pack.py` (byte 4 is the format code, data starts at the u32 at offset 40), so a reader is straightforward new work |
| **Texture catalogue** (format + thumbnails for every texture) | `data/hd/texture_desc_cache.json` | No reader needed (JSON) |

**Not needed from the package:** the program files (`ExeFS/main`, `sdk`,
`subsdk0`). Nothing in this reader touches them; `extract_game.sh` uses their
SHA-256 only to prove the update is 3.3.94012.

**Not obtainable from the package at all:** the game's *behaviour* — level
generation, monster AI, damage, loot rolls, quest flow. `dm/host/dm_world.c` is
the clearest example of the reference project's position: it does not reimplement
interaction, it **calls into the original program** (`main+0x4ace20`) to do it.
Data tables describe *what* exists; the *how* lives in the compiled program.

## Consuming the extracted art

The extractor writes PNGs, so nothing in the app ever deals with block-linear
layouts or DXT5 — the whole decode path lives on the extracting side, where the
differential tests pin it to the reference.

At startup the app reads `public/original/index.json` (git-ignored). If it is
absent — the normal case — the HUD keeps the icons it draws itself. If it is
present, icons are matched **by a distinctive path fragment rather than an exact
path**, and only the ones the package actually has are replaced:

```ts
setIconOverrides(iconOverrides(originalArt, {
  fireball: '/actionbar/fire',
  nova: '/actionbar/frost',
  potion: '/actionbar/health',
}))
```

Both halves of that were verified: with a partial package the icons it contains
are served from the extracted files while the rest fall through to the drawn
version, and with no package at all everything falls back and the game runs
normally. Matching on a fragment is deliberate — exact paths are tied to one game
build, so binding to them would turn a version difference into a broken
interface.
