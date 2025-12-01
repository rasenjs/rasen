# @rasenjs/gpui

<p align="center">
  <img src="./screenshot.png" alt="Rasen GPUI Demo" width="600" />
</p>

<p align="center">
  <strong>GPU-Accelerated Native Desktop Apps</strong><br>
  <em>Run TypeScript/JavaScript on Zed's GPUI Framework</em>
</p>

---

## ✨ Features

- 🚀 **GPU-Accelerated Rendering** - Built on Zed editor's GPUI framework, 60fps smooth experience
- 🎨 **Tailwind-Style Syntax** - Familiar class strings, zero learning curve
- ⚡ **Reactive-Driven** - Deep integration with `@rasenjs/reactive-signals`
- 🔄 **Three-Phase Lifecycle** - Setup → Mount → Unmount, clear and controllable
- 📦 **Cross-Platform Support** - macOS (Metal), Windows (DirectX 11), Linux (Vulkan)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              YOUR APPLICATION                                │
│                                                                             │
│    ┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐    │
│    │   main.ts   │────▶│  @rasenjs/gpui   │────▶│ @rasenjs/reactive-  │    │
│    │  App Code   │     │   TypeScript API │     │     signals         │    │
│    └─────────────┘     └──────────────────┘     └─────────────────────┘    │
│                                 │                                           │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │ JSON Element Descriptors
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RASEN-GPUI RUNTIME (Rust)                          │
│                                                                             │
│    ┌──────────────────────────────────────────────────────────────────┐    │
│    │                         rasen-gpui CLI                            │    │
│    │  ┌─────────────┐   ┌──────────────────┐   ┌─────────────────┐   │    │
│    │  │   QuickJS   │──▶│  TW Class Parser │──▶│   GPUI Bridge   │   │    │
│    │  │  JS Engine  │   │  Tailwind → GPUI │   │  Element Render │   │    │
│    │  └─────────────┘   └──────────────────┘   └─────────────────┘   │    │
│    └──────────────────────────────────────────────────────────────────┘    │
│                                 │                                           │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │ Native Rendering Calls
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GPUI FRAMEWORK                                  │
│                                                                             │
│    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────┐    │
│    │   Taffy Layout  │   │  Scene Builder  │   │   Platform Layer    │    │
│    │  Flexbox Engine │   │  GPU Scene Build │   │  Native Integration │    │
│    └─────────────────┘   └─────────────────┘   └─────────────────────┘    │
│                                 │                                           │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              ┌──────────┐ ┌──────────┐ ┌──────────────┐
              │  Metal   │ │  Vulkan  │ │  DirectX 11  │
              │  macOS   │ │  Linux   │ │   Windows    │
              └──────────┘ └──────────┘ └──────────────┘
```

---

## 🎯 Design Philosophy

### Tailwind → GPUI Transformation

Use familiar Tailwind class syntax, automatically transformed to GPUI chain calls on the Rust side:

```
JavaScript                           Rust (Auto-generated)
─────────────────────────────────────────────────────────────
class="flex flex-col gap-3"    →    div().flex().flex_col().gap_3()
class="bg-[#1a1a2e]"           →    div().bg(rgb(0x1a1a2e))
class="text-xl text-white"     →    text.text_xl().text_color(white())
```

### Three-Phase Function Pattern

Following Rasen's core design:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Component Lifecycle                              │
│                                                                         │
│   SETUP PHASE              MOUNT PHASE              UNMOUNT PHASE       │
│  ┌─────────────┐          ┌─────────────┐          ┌─────────────┐     │
│  │ • Create    │    ──▶   │ • Generate  │    ──▶   │ • Cleanup   │     │
│  │   reactive  │          │   descriptor│          │   listeners │     │
│  │   state     │          │ • Register  │          │ • Unmount   │     │
│  │ • Define    │          │   events    │          │   children  │     │
│  │   tree      │          │ • Mount     │          │             │     │
│  └─────────────┘          └─────────────┘          └─────────────┘     │
│                                                                         │
│  const App = () => {       return (host) => {       return () => {     │
│    const count = ref(0)      // mount logic           // cleanup       │
│    return div({...})         return () => {...}     }                  │
│  }                         }                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Installation

```bash
npm install @rasenjs/gpui @rasenjs/reactive-signals
```

### Basic Example

```typescript
import { div, text, button, run } from '@rasenjs/gpui'
import { ref } from '@rasenjs/reactive-signals'

const App = () => {
  // Setup Phase: Create reactive state
  const count = ref(0)

  // Return Mount Function
  return div({
    class: "flex flex-col gap-4 bg-[#1a1a2e] size-full justify-center items-center",
    children: [
      text({
        class: "text-4xl text-white font-bold",
        children: "🌀 Rasen GPUI",
      }),
      
      // Reactive binding - pass ref directly
      text({
        class: "text-5xl text-white",
        children: count,  // ← ref, auto-updates reactively
      }),
      
      div({
        class: "flex gap-3",
        children: [
          button({
            class: "px-4 py-2 bg-[#e94560] rounded-lg text-white",
            onClick: () => count.value--,
            children: [text({ children: "−" })]
          }),
          button({
            class: "px-4 py-2 bg-[#0f3460] rounded-lg text-white", 
            onClick: () => count.value++,
            children: [text({ children: "+" })]
          }),
        ],
      }),
    ],
  })
}

// Start the app
run(App)
```

### Run

```bash
# Development mode
npx rasen-gpui run .

# Or using yarn
yarn rasen-gpui run .
```

---

## 📚 API Reference

### Components

| Component | Description | Props |
|-----------|-------------|-------|
| `div` | Container component | `class`, `onClick`, `onMouseEnter`, `onMouseLeave`, `children` |
| `text` | Text component | `class`, `children` (string \| number \| Ref) |
| `button` | Button component | `class`, `onClick`, `children` |

### Supported Tailwind Classes

#### Layout

| Class | GPUI Method | Description |
|-------|-------------|-------------|
| `flex` | `.flex()` | Flex container |
| `flex-col` | `.flex_col()` | Column direction |
| `flex-row` | `.flex_row()` | Row direction |
| `gap-{n}` | `.gap_{n}()` | Gap (0-12) |
| `gap-[{px}]` | `.gap(px(n))` | Custom gap |
| `justify-center` | `.justify_center()` | Center main axis |
| `justify-between` | `.justify_between()` | Space between |
| `items-center` | `.items_center()` | Center cross axis |

#### Sizing

| Class | GPUI Method | Description |
|-------|-------------|-------------|
| `size-{n}` | `.size_{n}()` | Fixed size |
| `size-full` | `.size_full()` | 100% |
| `size-[{px}]` | `.size(px(n))` | Custom size |
| `w-{n}`, `h-{n}` | `.w_{n}()`, `.h_{n}()` | Width/Height |

#### Spacing

| Class | GPUI Method | Description |
|-------|-------------|-------------|
| `p-{n}` | `.p_{n}()` | Padding |
| `px-{n}`, `py-{n}` | `.px_{n}()`, `.py_{n}()` | Horizontal/Vertical padding |
| `m-{n}` | `.m_{n}()` | Margin |
| `mt-{n}`, `mb-{n}` | `.mt_{n}()`, `.mb_{n}()` | Top/Bottom margin |

#### Background & Border

| Class | GPUI Method | Description |
|-------|-------------|-------------|
| `bg-[#{hex}]` | `.bg(rgb(hex))` | Custom background |
| `bg-red-500` | `.bg(red_500())` | Preset color |
| `border` | `.border_1()` | 1px border |
| `border-{n}` | `.border_{n}()` | n px border |
| `border-dashed` | `.border_dashed()` | Dashed border |
| `rounded-{size}` | `.rounded_{size}()` | Border radius |

#### Typography

| Class | GPUI Method | Description |
|-------|-------------|-------------|
| `text-{size}` | `.text_{size}()` | Font size (xs/sm/base/lg/xl/2xl...) |
| `text-white` | `.text_color(white())` | White text |
| `text-[#{hex}]` | `.text_color(rgb(hex))` | Custom text color |
| `font-bold` | `.font_weight(BOLD)` | Bold |

#### Effects

| Class | GPUI Method | Description |
|-------|-------------|-------------|
| `shadow-sm` | `.shadow_sm()` | Small shadow |
| `shadow-lg` | `.shadow_lg()` | Large shadow |
| `cursor-pointer` | `.cursor_pointer()` | Pointer cursor |

---

## 🔧 Development Guide

### Project Structure

```
packages/gpui/
├── src/
│   └── index.ts          # TypeScript API
├── bin/
│   └── rasen-gpui.cjs    # CLI entry
├── native/
│   └── rasen-gpui/       # Rust runtime
│       ├── src/
│       │   ├── main.rs
│       │   ├── js_runtime.rs
│       │   └── tw_parser.rs
│       └── Cargo.toml
└── package.json
```

### Build Native Runtime

```bash
cd packages/gpui/native
cargo build --release
```

### CLI Commands

```bash
# Run project
rasen-gpui run [path]

# Initialize new project (coming soon)
rasen-gpui init <name>

# Build for production (coming soon)
rasen-gpui build
```

---

## 🌍 Platform Support

| Platform | Graphics Backend | Status |
|----------|------------------|--------|
| macOS (Apple Silicon) | Metal | ✅ Supported |
| macOS (Intel) | Metal | ✅ Supported |
| Windows | DirectX 11 | 🚧 In Development |
| Linux | Vulkan | 🚧 In Development |

---

## 📖 More Resources

- [Rasen Design Document](../../docs/DESIGN.md)
- [GPUI Examples](../../examples/gpui)
- [Zed GPUI Official Docs](https://zed.dev/blog/gpui)

---

## License

MIT © [Rasen](https://github.com/rasenjs/rasen)
