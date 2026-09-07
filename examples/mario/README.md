# Super Mario · Rasen Edition

A complete side-scrolling Super Mario (World 1) built on **Rasen**'s reactive
rendering system — all four levels (1-1 overworld, 1-2 underground, 1-3
athletic, 1-4 castle), the full power-up system (Super Mushroom → big Mario,
Fire Flower, 1-UP mushrooms), Goombas and Koopa Troopas with the classic
shell mechanics, lava, a flag-pole finale and the full game flow.

## Run

```bash
# from repo root
yarn examples:mario:dev

# or from this folder
yarn dev
```

Open http://localhost:3010 (Vite).

## Controls

| Key | Action |
| --- | --- |
| `←` / `→` or `A` / `D` | Move |
| `SPACE` / `↑` / `W` | Jump (hold for higher jumps) |
| `SHIFT` / `X` | Run |
| `↓` / `S` | Crouch (big Mario only) |

## Game features

- **All 4 levels of World 1** with authentic layouts (level data adapted from
  the Meth Meth Method Super Mario project: `1-1.json` … `1-4.json`).
- **Power-ups**: the first `?` block of each level holds a Super Mushroom
  (small → big Mario with 2-tile hitbox, breakable bricks, crouching); bricks
  shatter with shrapnel when big. Fire Flowers give points, 1-UP every 100
  coins and via green mushrooms.
- **Enemies**: Goombas (brown overworld / blue underground palettes) and
  Koopa Troopas — stomp them, kick shells into other enemies, shells wake up
  if you wait.
- **Level goals**: flag-pole slide + walk-into-castle (1-1, 1-3), exit pipe
  (1-2), Toad's chamber (1-4) → "THANK YOU MARIO!" win screen.
- **Classic flow**: title → WORLD x-x intro card → play → death → intro →
  … → game over / win; 400-unit timer with hurry-up warning, checkpoint
  respawns, forward-only camera, coin/score HUD.
- **Music & sound**: looping theme tracks per level theme (overworld /
  underworld / castle) with the hurry-up variant, plus die / game-over /
  level-clear jingles — all from the Meth Meth Method audio assets; sound
  effects are synthesized with the WebAudio API. The 🔊 button mutes both.

## How it uses Rasen

This example showcases Rasen's reactive canvas-2d renderer driving a 60 fps
game, plus the reactive DOM layer for UI — all in **one JSX syntax**:

- **Unified JSX** — DOM and canvas share the same JSX. `<canvas>` is a JSX
  tag (mapped to the `@rasenjs/dom` canvas component) and canvas-2d shapes are
  lowercase JSX tags too (`<rect>`, `<image>`, `<text>`, `<group>`, `<sprite>`,
  registered via `configureTags` and typed through `src/jsx.d.ts`).
- **Entity = one self-contained module** — each game object is a class
  (`Mario`, `Goomba`, `Koopa`, `Coin`, `Block`, `Item`, `Particle`) that owns
  its behaviour, and its render component (`MarioSprite`, `GoombaSprite`, …)
  lives in the same module. The scene tree just composes components.
- **`each` for pools** — entity pools are rendered with the host-agnostic
  `each()` from `@rasenjs/core` (not array `.map()`).
- **`sprite` vs `image`** — entities whose frames sit on the 16px sheet grid
  (Goomba, Coin, Block, Item, Particle) use the `sprite` component with a
  reactive `frame` index; Mario and Koopas use `image` with pre-cropped frame
  canvases because their frames don't sit on the 16px grid.
- **Reactive state** — `ref()` from `@rasenjs/reactive-signals` (`phase`,
  `score`, `time`, camera, and each entity's screen position/frame). Each
  frame the game loop mutates entity refs and the renderer redraws
  automatically with dirty-region tracking. DOM overlays bind through getter
  functions (`() => expr`), canvas props through refs — both auto-tracked.
- **Static layer** — terrain, pipes, decorations, flag and castle are
  pre-rendered once per level to an offscreen canvas and drawn with a single
  camera-offset `image`.
- **HMR** — the root component uses `com()` and is hot-reloaded by
  `@rasenjs/vite-plugin-rasen`.

## Architecture

```
src/
  main.ts        entry — register canvas-2d JSX tags, load assets, boot loop
  game.ts        Game — orchestrator implementing the World interface
                 (phases, lives/score/time, level progression, flag sequence)
  world.ts       World interface (tile collision, spawning, events)
  level-data.ts  loads the Meth Meth Method level JSONs (public/levels/*.json)
                 + pattern sheets (public/patterns/*.json) and expands them
                 into grids, solids, blocks, coins, enemies and goal markers
  themes.ts      per-theme tile tables (overworld / underworld / castle)
  View2D.tsx     2D render view (canvas-2d scene tree)
  render.tsx     App — JSX shell + overlays (title / WORLD card / game over / win)
  Mario.tsx      player entity (small/large, crouch, skid, pole slide) + sprite
  Goomba.tsx     goomba entity (brown/blue palettes) + sprite
  Koopa.tsx      koopa entity (walk / shell / kick / wake) + sprite
  Item.tsx       mushroom & fire-flower entities + sprite
  Coin.tsx       collectible entity + sprite (theme coin frames)
  Block.tsx      brick / ? block entity (bump, break, contents) + sprite
  Particle.tsx   coin popups, brick shrapnel, floating score text
  StaticLayer.tsx  pre-rendered world layer (sky + terrain), JSX
  Hud.tsx        reactive canvas HUD (MARIO / coins / WORLD / TIME)
  sprites.ts     sprite-frame definitions + SpriteBank (frame cropping)
  assets.ts      image loading + static-layer pre-render
  input.ts       keyboard + touch input
  audio.ts       WebAudio square-wave sound effects
  bgm.ts         looping background music (theme / hurry / jingles)
  constants.ts   tuning constants
  jsx.d.ts       JSX type augmentation for canvas-2d tags
public/
  levels/        1-1.json … 1-4.json (Meth Meth Method level data)
  patterns/      overworld / underworld / castle pattern sheets
  assets/        sprites.png, tiles.png
  audio/music/   looping theme tracks & jingles (Meth Meth Method audio)
```

### Framework notes (changes made to enable unified JSX)

- `@rasenjs/dom` `jsx-runtime`: `JSX.IntrinsicElements` is now an `interface`
  (extending a mapped type) so host packages/apps can augment it with their
  own lowercase tags.
- `@rasenjs/dom` `setStyle` + element style paths: camelCase CSS keys
  (`flexDirection`, `flexShrink`, …) are now converted to kebab-case before
  `setProperty` — previously they were silently ignored.
- `@rasenjs/canvas-2d`: exports component `Props` types (`RectProps`,
  `ImageProps`, `TextProps`, `GroupProps`, …).
- `@rasenjs/core` `com()`: falls back to plain mount when the HMR module stack
  is empty — previously the sticky HMR flag made runtime `com()` calls (e.g.
  inside `each()`) crash after module evaluation finished.

## Assets

Sprite sheets (`sprites.png`, `tiles.png`) come from the open-source
**"Code Super Mario Bros. in JavaScript"** tutorial by Meth Meth Method
(https://github.com/meth-meth-method/super-mario), used here for learning
purposes. Level data, sprite coordinate tables and music tracks likewise
come from that project's `public/levels`, `public/sprites` and
`public/audio/music` files. Note the NES sky color baked into that
tilesheet is `#9c9bff` — the background is tiled with the sky tile itself
so decorative tiles always blend seamlessly.

## Notes

- Viewport is the classic 256×240, scaled 3× with `image-rendering: pixelated`.
- The debug hook `window.__marioGame` exposes the `Game` instance for console
  inspection.
