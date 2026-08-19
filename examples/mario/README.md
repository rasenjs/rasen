# Super Mario · Rasen Edition

A side-scrolling Super Mario clone built entirely on **Rasen**'s reactive
rendering system — a tile-based platformer with physics, enemies, coins,
bumpable blocks, a camera and a full win/lose flow.

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
| `Space` / `↑` / `W` | Jump (input buffered — pressing slightly early still works) |

Stomp goombas, grab coins, bump `?` blocks, jump the pits and reach the flag
pole. You have 3 lives and a 400-second timer.

## How it uses Rasen

This example showcases Rasen's reactive canvas-2d renderer driving a 60 fps
game, plus the reactive DOM layer for UI — all in **one JSX syntax**:

- **Unified JSX** — DOM and canvas share the same JSX. `<canvas>` is a JSX
  tag (mapped to the `@rasenjs/dom` canvas component) and canvas-2d shapes are
  lowercase JSX tags too (`<rect>`, `<image>`, `<text>`, `<group>`, `<sprite>`,
  registered via `configureTags` and typed through `src/jsx.d.ts`).
- **Entity = one self-contained module** — each game object is a class
  (`Mario`, `Goomba`, `Coin`, `Block`, `Particle`) that owns its behaviour,
  and its render component (`MarioSprite`, `GoombaSprite`, …) lives in the
  same module. The scene tree just composes components.
- **`each` for pools** — entity pools are rendered with the host-agnostic
  `each()` from `@rasenjs/core` (not array `.map()`).
- **`sprite` vs `image`** — entities whose frames sit on the 16px sheet grid
  (Goomba, Coin, Block, Particle) use the `sprite` component with a reactive
  `frame` index; Mario uses `image` with pre-cropped frame canvases because
  his frames sit at `y=88` (not on the grid), which `sprite`'s grid cropping
  can't address.
- **Reactive state** — `ref()` / `computed()` from `@rasenjs/reactive-signals`
  (`phase`, `score`, `time`, camera, and each entity's screen position/frame).
  Each frame the game loop mutates entity refs and the renderer redraws
  automatically with dirty-region tracking.
- **Static layer** — terrain, pipes, decorations, flag and castle are
  pre-rendered once to an offscreen canvas and drawn with a single
  camera-offset `image`.
- **HMR** — the root component uses `com()` and is hot-reloaded by
  `@rasenjs/vite-plugin-rasen`.

## Architecture

```
src/
  main.ts      entry — register canvas-2d JSX tags, load assets, boot loop
  game.ts      Game — orchestrator implementing the World interface
  world.ts     World interface (tile collision, events) shared by entities
  View2D.tsx   2D render view (canvas-2d scene tree)
  render.tsx   App — JSX shell + overlays (title / game over / win)
  Mario.tsx    player entity + MarioSprite component (same module)
  Goomba.tsx   enemy entity + GoombaSprite component
  Coin.tsx     collectible entity + CoinSprite component
  Block.tsx    brick / ? block entity + BlockSprite component
  Particle.tsx coin popup entity + ParticleSprite component
  StaticLayer.tsx  pre-rendered world layer (sky + terrain), JSX
  Hud.tsx      reactive canvas HUD, JSX
  level.ts     tile-based level builder (terrain, blocks, coins, goombas)
  sprites.ts   sprite-frame definitions + SpriteBank (frame cropping)
  assets.ts    image loading + static-layer pre-render
  input.ts     keyboard + touch input
  audio.ts     WebAudio square-wave sound effects (no audio assets)
  constants.ts tuning constants
  jsx.d.ts     JSX type augmentation for canvas-2d tags
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

> **Note on 3D**: `@rasenjs/webgl` also gained 3D primitives (`box`,
> `billboard`, `PerspectiveCamera`/`OrthographicCamera`, mesh, texture
> support, `RenderContext.setMode('3d')`) as framework work — this example
> stays 2D, but those modules remain in the package for future 3D targets.

## Assets

Sprite sheets (`sprites.png`, `tiles.png`) come from the open-source
**"Code Super Mario Bros. in JavaScript"** tutorial by Meth Meth Method
(https://github.com/meth-meth-method/super-mario), used here for learning
purposes. Sound effects are synthesized with the WebAudio API.

## Notes

- Viewport is the classic 256×240, scaled 3× with `image-rendering: pixelated`.
- The debug hook `window.__marioGame` exposes the `Game` instance for console
  inspection.
