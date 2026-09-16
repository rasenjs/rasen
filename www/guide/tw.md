# Tailwind Classes with @rasenjs/tw

`@rasenjs/tw` converts Tailwind-style class strings into a **standard flat
camelCase style record** (`TwStyle`). Because the record is neutral — not tied
to any one renderer — every target can consume it with a thin adapter.

```ts
import { tw } from '@rasenjs/tw'

tw('flex flex-col gap-2 bg-[#505050]')
// => { display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: '#505050' }
```

This guide shows how to wire that record into each render target.

## The standard record

`TwStyle` is a flat, camelCase, CSS-like object:

- **Lengths** are numbers in **px** (native-friendly) or strings for relative
  values (`'100%'`, `'50%'`, `'auto'`, `'100vw'`, `'100vh'`).
- **Colors** are CSS strings (`'#3B82F6'`, `'rgba(0,0,0,0.5)'`).
- **Layout** keys mirror CSS: `display`, `flexDirection`, `justifyContent`,
  `alignItems`, `width`, `height`, `gap`, `paddingTop`, `marginLeft`, etc.

This shape is deliberately compatible with React Native's style objects and
Perry UI's `StyleProps` (issue #185), so the same classes work everywhere.

## React Native

RN styles are already flat camelCase objects, so the record drops straight in
as a `style` prop:

```tsx
import { tw } from '@rasenjs/tw'
import { View, Text } from '@rasenjs/react-native'

const Card = () => (
  <View style={tw('flex flex-col gap-2 p-4 bg-white rounded-lg')}>
    <Text style={tw('text-lg font-bold text-gray-900')}>Hello</Text>
  </View>
)
```

For function styles (e.g. `Pressable`'s `({ pressed }) => style`), merge the
record with the existing `resolveStyle` helper:

```tsx
import { tw } from '@rasenjs/tw'
import { resolveStyle } from '@rasenjs/react-native/utils/style'

const PressableCard = () => (
  <Pressable
    style={({ pressed }) => ({
      ...tw('p-4 rounded-lg'),
      opacity: pressed ? 0.7 : 1
    })}
  />
)
```

Because `tw()` memoizes, passing the same class string repeatedly returns the
same frozen record — no re-parsing per render.

## DOM

The record is a camelCase style object, so apply it directly to `el.style`:

```ts
import { tw } from '@rasenjs/tw'

const el = document.createElement('div')
Object.assign(el.style, tw('flex items-center gap-2 p-4'))
```

Or feed it to `@rasenjs/dom`'s `style` binding (which already accepts a
camelCase-keyed object):

```ts
import { div } from '@rasenjs/dom'
import { tw } from '@rasenjs/tw'

const Box = () => div({ style: tw('flex flex-col gap-2 bg-[#505050]') })
```

## Perry UI (native macOS / iOS / …)

Perry UI applies styles through flat `perry_ui_*` FFI setters. The
`@rasenjs/tw/perry` entry provides `applyTw(handle, classes)`, which maps each
record key to the matching setter and converts CSS colors to normalized RGBA
channels in `[0, 1]`:

```ts
import { App, VStack, Text, Button } from 'perry/ui'
import { applyTw } from '@rasenjs/tw/perry'

const title = Text('Hello')
applyTw(title, 'text-xl font-bold text-blue-500')

const primary = Button('Save', () => {})
applyTw(primary, 'bg-blue-500 text-white rounded-lg', 'button')
```

The bridge maps:

| Record key | Perry FFI setter |
| ---------- | ---------------- |
| `backgroundColor` | `perry_ui_widget_set_background_color` |
| `color` | `perry_ui_text_set_color` / `perry_ui_button_set_text_color` |
| `borderColor` / `borderWidth` | `perry_ui_widget_set_border_color` / `_width` |
| `borderRadius` | `perry_ui_widget_set_corner_radius` |
| `padding*` | `perry_ui_widget_set_edge_insets` |
| `opacity` | `perry_ui_widget_set_opacity` |
| `shadow*` | `perry_ui_widget_set_shadow` |
| `fontSize` / `fontWeight` / `fontFamily` | `perry_ui_text_set_font_*` |
| `display: 'none'` | `perry_ui_widget_set_hidden` |
| `width` / `height` | `perry_ui_widget_set_width` / `_height` |

> **Future-proofing**: Perry UI's `StyleProps` (issue #185) is the same
> camelCase shape. Once the inline `Button("Save", onPress, { style })` codegen
> lands, `tw()` output can be passed directly as the `style` prop — code
> written against `applyTw` today keeps working because the prop names map 1:1
> to the same setters.

Because `@rasenjs/tw` is pure TypeScript, it compiles into a Perry app via
`perry.compilePackages` just like any other shared package.

## gpui / lvgl (native Rust / C)

`@rasenjs/gpui` and `@rasenjs/lvgl` currently parse class strings **natively**
(`tw_parser.rs` / `tw_parser.c`). Two integration options:

### Option A — parse in TS, pass the record to native (recommended)

Resolve classes on the JS side and send the record across the boundary instead
of the raw class string. This unifies parsing in one place and lets the native
side be a dumb mapper.

```ts
import { tw } from '@rasenjs/tw'

// gpui
host.appendChild({
  type: 'div',
  class: '', // no longer needed
  style: tw('flex flex-col gap-2 p-4') // new: pass the record
})
```

The native `ElementDescriptor` gains a `style` field; the native side maps the
flat record to its `ParsedStyles` / `tw_styles_t` struct.

### Option B — generate the native parser tables from the same token source

Keep native parsing, but drive it from the same token definitions so the two
never drift. The `TOKENS` table in `@rasenjs/tw` is the single source of truth;
a codegen step emits the Rust/C lookup tables from it.

## AOT generation for production

For maximum performance, precompute every class string your app uses into a
static table:

```bash
tw-generate --scan src --out src/tw.generated.ts
```

```ts
import { createTw } from '@rasenjs/tw'
import { TABLE } from './tw.generated'

const tw = createTw(TABLE) // O(1) lookup for every known class string
```

The generated table maps full class strings to precomputed records, so known
strings skip parsing entirely; anything new falls back to the runtime
interpreter and is memoized.

## Performance notes

- **Memoization**: identical class strings return the same frozen record —
  zero re-parsing, zero GC churn on hot paths (lists, per-frame updates).
- **AOT**: known strings are a single object lookup.
- **Small surface**: the interpreter is dependency-free and tree-shakeable.