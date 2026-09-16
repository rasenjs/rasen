# @rasenjs/tw

High-performance Tailwind-style class interpreter. Converts class strings into a
**standard flat camelCase style record** that every render target can consume
directly — React Native, DOM, Perry UI, gpui, lvgl.

```ts
import { tw } from '@rasenjs/tw'

tw('flex flex-col gap-2 bg-[#505050]')
// => { display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: '#505050' }
```

## Why a standard record?

Instead of each native target hand-writing its own Tailwind parser (as
`@rasenjs/gpui`'s `tw_parser.rs` and `@rasenjs/lvgl`'s `tw_parser.c` do today),
`@rasenjs/tw` produces one neutral record, and each target maps it to its own
style structure:

| Target | How it consumes the record |
| ------ | -------------------------- |
| React Native | pass it as a `style` prop (RN styles are flat camelCase) |
| DOM | apply it as a camelCase style object |
| Perry UI | `applyTw(handle, classes)` maps it to native FFI setters |
| gpui / lvgl | serialize it and map to the native style struct |

## Pipeline

`@rasenjs/tw` implements two stages of a class→style pipeline. Stage 1-1
(external interpreters) and Stage 3 (host adapters) live outside this package.

```
1-1  External interpreter (real Tailwind / UnoCSS / custom)   ← outside
     ▼  produces CSS string or style object
1-2  cssToStyle(cssText) → style object                       ← this package
     ▼
2    mergeStyles(...sources) → single-key style record        ← this package
     ▼
3    Host adapter (RN / DOM / Perry / gpui / lvgl)            ← outside
```

### Stage 1-2 — CSS → style object

`cssToStyle` parses a CSS stylesheet (as produced by an external interpreter)
into a `Map<className, styleObject>`:

```ts
import { cssToStyle } from '@rasenjs/tw'

const map = cssToStyle(`
  .p-4 { padding: 16px; }
  .flex { display: flex; }
  .text-lg { font-size: 18px; color: #3b82f6; }
`)
map.get('p-4') // => { padding: 16 }
```

- kebab → camelCase (`padding-top` → `paddingTop`)
- value normalization (px → number, rem → px, 3-digit hex → 6-digit, `calc()`)
- aggregate keys (`padding`, `margin`, `shadow`, `border`) are kept as-is and
  expanded by Stage 2

### Stage 2 — aggregate expansion + priority merge

`mergeStyles` merges multiple style sources with later-wins priority, expanding
aggregates per source so aggregate-vs-single conflicts resolve correctly:

```ts
import { mergeStyles } from '@rasenjs/tw'

mergeStyles({ padding: 16 }, { paddingTop: 4 }, { backgroundColor: '#fff' })
// => { paddingTop: 4, paddingRight: 16, paddingBottom: 16, paddingLeft: 16,
//      backgroundColor: '#fff' }
```

`expandAggregates` expands `padding` / `margin` → per-side keys, `shadow`
(object) → `shadowColor` / `shadowBlur` / `shadowOffsetX` / `shadowOffsetY`,
and `border` (object) → `borderWidth` / `borderColor`.

## Performance

- **Memoization** — identical class strings return the *same frozen record*
  instance: zero re-parsing, zero GC churn on hot paths.
- **AOT table** — `tw-generate` scans your source and emits a static
  full-string → record table. `createTw(table)` makes known strings an O(1)
  lookup with no parsing at all.

```ts
import { createTw } from '@rasenjs/tw'
import { TABLE } from './tw.generated' // emitted by tw-generate

const tw = createTw(TABLE) // O(1) for every class string in your app
```

## Usage

```ts
import { tw } from '@rasenjs/tw'

// Layout
tw('flex flex-col items-center justify-between gap-4')

// Sizing & spacing (px numbers, native-friendly)
tw('w-full h-screen p-4 mt-2 gap-x-3')

// Colors (Tailwind v3 palette)
tw('bg-blue-500 text-white border-gray-900')

// Text
tw('text-xl font-bold font-mono underline')

// Effects
tw('opacity-50 shadow-md rounded-lg')

// Arbitrary values
tw('bg-[#505050] w-[500px] p-[10px] text-[20px] rounded-[8px]')
```

## Token coverage

A curated subset aligned with the native targets that already consume
Tailwind-style classes: display, flex layout, sizing, spacing, colors (full
Tailwind v3 palette), borders, text, effects — plus arbitrary values
(`prefix-[value]`).

## Perry UI

```ts
import { Text } from 'perry/ui'
import { applyTw } from '@rasenjs/tw/perry'

const title = Text('Hello')
applyTw(title, 'text-xl font-bold text-blue-500')
```

`applyTw` maps each record key to the matching `perry_ui_*` FFI setter and
converts CSS colors to normalized RGBA channels in `[0, 1]`.

## AOT generation

```bash
tw-generate --scan src --out src/tw.generated.ts
```

Scans `tw("...")`, `className="..."`, `class="..."`, and `class: "..."` across
`.ts/.tsx/.js/.jsx/.html/.vue/.svelte/.mdx` files (skipping `node_modules`,
`dist`, etc.) and emits a static table.

## License

MIT