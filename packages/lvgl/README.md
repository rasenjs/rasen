# @rasenjs/lvgl

LVGL binding for Rasen - Run JavaScript UI on embedded devices with GPU acceleration using LVGL + QuickJS.

## Features

- 🎯 **Tailwind-style classes** - Use familiar Tailwind CSS syntax
- ⚡ **QuickJS runtime** - Lightweight JavaScript engine for embedded
- 🖥️ **LVGL rendering** - Hardware-accelerated graphics for embedded displays
- 🔄 **Reactive** - Works with Rasen's reactive signals

## Installation

```bash
npm install @rasenjs/lvgl
```

## Usage

```typescript
import { div, text, label, button, run } from '@rasenjs/lvgl'
import { ref } from '@rasenjs/reactive-signals'

const App = () => {
  const count = ref(0)

  return div({
    class:
      'flex flex-col gap-4 bg-[#2e2e2e] size-full justify-center items-center',
    children: [
      label({
        class: 'text-2xl text-white font-bold',
        children: () => `Count: ${count.value}`
      }),
      button({
        class: 'bg-blue-500 text-white px-4 py-2 rounded-lg',
        onClick: () => count.value++,
        children: [text({ children: 'Increment' })]
      })
    ]
  })
}

run(App)
```

## CLI

```bash
# Run a project
rasen-lvgl run

# Run a specific file
rasen-lvgl run src/main.ts

# Initialize a new project
rasen-lvgl init my-embedded-app

# Build for production
rasen-lvgl build
```

## LVGL Components

| Component  | Description                   |
| ---------- | ----------------------------- |
| `div`      | Container (lv_obj)            |
| `label`    | Text label (lv_label)         |
| `button`   | Button (lv_btn)               |
| `text`     | Text span within container    |
| `image`    | Image (lv_img)                |
| `slider`   | Slider control (lv_slider)    |
| `switch`   | Toggle switch (lv_switch)     |
| `checkbox` | Checkbox (lv_checkbox)        |
| `textarea` | Text input area (lv_textarea) |
| `arc`      | Arc/gauge (lv_arc)            |
| `bar`      | Progress bar (lv_bar)         |
| `spinner`  | Loading spinner (lv_spinner)  |

## Tailwind to LVGL Mapping

The package converts Tailwind CSS classes to LVGL styles:

| Tailwind         | LVGL Style                  |
| ---------------- | --------------------------- |
| `flex`           | `LV_FLEX_FLOW_ROW/COLUMN`   |
| `gap-{n}`        | `lv_style_set_pad_gap`      |
| `p-{n}`          | `lv_style_set_pad_all`      |
| `m-{n}`          | `lv_style_set_margin_*`     |
| `bg-{color}`     | `lv_style_set_bg_color`     |
| `text-{color}`   | `lv_style_set_text_color`   |
| `rounded-{size}` | `lv_style_set_radius`       |
| `border-{n}`     | `lv_style_set_border_width` |
| `w-{n}`          | `lv_style_set_width`        |
| `h-{n}`          | `lv_style_set_height`       |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   JavaScript/TypeScript             │
│  ┌───────────────┐  ┌───────────────────────────┐  │
│  │ @rasenjs/lvgl │  │ @rasenjs/reactive-signals │  │
│  └───────┬───────┘  └─────────────┬─────────────┘  │
├──────────┼─────────────────────────┼────────────────┤
│          ▼                         ▼                │
│  ┌─────────────────────────────────────────────┐   │
│  │              QuickJS Runtime                │   │
│  └──────────────────────┬──────────────────────┘   │
├─────────────────────────┼──────────────────────────┤
│                         ▼                          │
│  ┌─────────────────────────────────────────────┐   │
│  │            TW Parser (Rust)                 │   │
│  │    Tailwind classes → LVGL styles           │   │
│  └──────────────────────┬──────────────────────┘   │
├─────────────────────────┼──────────────────────────┤
│                         ▼                          │
│  ┌─────────────────────────────────────────────┐   │
│  │               LVGL (C)                      │   │
│  │         Hardware-accelerated UI             │   │
│  └──────────────────────┬──────────────────────┘   │
├─────────────────────────┼──────────────────────────┤
│                         ▼                          │
│  ┌─────────────────────────────────────────────┐   │
│  │         Display Driver / Framebuffer        │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Building Native Runtime

### Prerequisites

- Rust toolchain
- C compiler (for LVGL)
- LVGL source (v8.x or v9.x)

### Build

```bash
cd packages/lvgl/native
cargo build --release
```

### Cross-compilation for embedded targets

```bash
# ARM Cortex-M
cargo build --release --target thumbv7em-none-eabihf

# ESP32
cargo build --release --target xtensa-esp32-espidf
```

## License

MIT
