# LVGL + Rasen Example

This example demonstrates using Rasen with LVGL for embedded UI development.

## Features

- Counter with increment/decrement buttons
- Progress bar with controls
- LED toggle switch
- Reactive state management

## Running

### Development (Simulator)

```bash
# Install dependencies
pnpm install

# Run in simulator mode (requires SDL2)
pnpm run dev
```

### Build for Embedded

```bash
# Build for ESP32
pnpm run build:esp32

# Build for Raspberry Pi
pnpm run build:rpi
```

## Project Structure

```
examples/lvgl/
├── src/
│   └── main.ts      # Main application
├── rasen.config.js  # Configuration
└── package.json
```

## Hardware Support

| Platform     | Display     | Touch      | Status   |
| ------------ | ----------- | ---------- | -------- |
| ESP32        | SPI LCD     | Capacitive | 🚧 WIP   |
| STM32        | FSMC LCD    | Resistive  | 🚧 WIP   |
| Raspberry Pi | Framebuffer | USB Touch  | 🚧 WIP   |
| Linux (SDL)  | Window      | Mouse      | ✅ Ready |

## Architecture

```
┌─────────────────────────────────────┐
│           main.ts (App)             │
│  ┌─────────────────────────────┐    │
│  │  Reactive State (refs)      │    │
│  │  - count, progress, ledOn   │    │
│  └─────────────────────────────┘    │
│                ▼                    │
│  ┌─────────────────────────────┐    │
│  │  Component Tree             │    │
│  │  div → label, button, bar   │    │
│  └─────────────────────────────┘    │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│        @rasenjs/lvgl                │
│  Tailwind classes → LVGL styles    │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│          LVGL Runtime              │
│  lv_obj, lv_label, lv_btn, etc.   │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│         Display Driver              │
│  SDL2 / SPI LCD / Framebuffer      │
└─────────────────────────────────────┘
```
