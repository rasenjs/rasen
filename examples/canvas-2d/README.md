# Canvas 2D Examples

Complete examples showcasing all features of `@rasenjs/canvas-2d`.

## 📁 Examples

- **Basic Shapes** (`shapes.html`) - Rectangles, circles, ellipses, arcs, rings, stars, polygons, wedges
- **Paths & Lines** (`paths.html`) - Lines, arrows, curves, SVG paths, Bézier curves
- **Transforms & Effects** (`transforms.html`) - Rotation, scaling, opacity, shadows, composite operations
- **Text & Images** (`text.html`) - Text rendering, alignment, letter spacing, underline, images
- **Advanced** (`advanced.html`) - Groups, animations, interactions, reactive updates

## 🚀 Getting Started

### Install Dependencies

```bash
# From the root of the repository
yarn install
```

### Run Development Server

```bash
cd examples/canvas-2d
yarn dev
```

Then open http://localhost:5173 in your browser.

## 📦 Features Demonstrated

### Basic Shapes

- ✅ Rectangle - fill, stroke, custom dimensions
- ✅ Circle - radius, center point
- ✅ Ellipse - radiusX, radiusY
- ✅ Arc - circular arcs, pie slices
- ✅ Ring - donut shapes with inner/outer radius
- ✅ Star - multi-pointed stars
- ✅ Polygon - regular and custom polygons
- ✅ Wedge - pie chart slices

### Paths & Lines

- ✅ Line - single and multi-point lines
- ✅ Arrow - single and double-ended arrows
- ✅ Path - SVG path data support
- ✅ Bézier Curves - smooth curves
- ✅ Line Styles - dash, cap, join

### Transforms & Effects

- ✅ Rotation - rotate shapes
- ✅ Scale - resize shapes
- ✅ Translate - move shapes
- ✅ Opacity - transparency
- ✅ Shadow - drop shadows with blur
- ✅ Composite Operations - blend modes

### Text & Images

- ✅ Text Rendering - fill and stroke
- ✅ Text Alignment - left, center, right
- ✅ Letter Spacing - custom spacing
- ✅ Text Decoration - underline
- ✅ Image Rendering - with cropping

### Advanced

- ✅ Group - shared transforms and effects
- ✅ Animations - with requestAnimationFrame
- ✅ Interactions - mouse events
- ✅ Reactive Updates - with Vue/Signals runtime

## 🎨 Code Example

```typescript
import { rect, circle } from '@rasenjs/canvas-2d'
import { canvas } from '@rasenjs/dom'

canvas({
  width: 400,
  height: 300,
  children: [
    rect({ x: 50, y: 50, width: 100, height: 100, fill: '#667eea' }),
    circle({ x: 200, y: 150, radius: 50, fill: '#ff6b6b' })
  ]
})
```

## 📖 Documentation

For full API documentation, visit the [Rasen documentation](../../www/packages/canvas-2d.md).
