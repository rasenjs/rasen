# Rasen WebGL Example

GPU-accelerated 2D rendering example using `@rasenjs/webgl`.

## Features

- WebGL-based 2D rendering
- Reactive state management with Vue
- Smooth 60fps animations
- Batch rendering for performance

## Run

```bash
yarn dev
```

Then open http://localhost:5174

## Key Points

1. **WebGL Context**: Use `webgl` or `webgl2` context instead of `2d`
2. **Same API**: Components have identical API to canvas-2d
3. **Performance**: GPU acceleration handles thousands of shapes effortlessly
4. **Reactive**: Automatic updates when state changes
