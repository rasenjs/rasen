# @rasenjs/assets

Asset parsing and loading for [Rasen](https://github.com/rasenjs/rasen):
**Spine** skeletons and **glTF/GLB** models.

The package is a pure data layer — parsers plus the Spine runtime (skeleton
pose solving, `AnimationState`, path constraints, hit testing) — and performs no
I/O of its own. Image loading goes through a host-injected adapter, so the same
code runs in the browser, in Node and on embedded hosts; the rendering
components live in the target packages (`@rasenjs/canvas-2d`, `@rasenjs/gfx`).

## Installation

```bash
npm install @rasenjs/assets
```

## Usage

```typescript
import { loadGLTF, parseGLB, loadImage, setImageAdapter } from '@rasenjs/assets'

// glTF / GLB — fetches and parses, returning the meshes ready to draw
const model = await loadGLTF('/models/robot.glb')
// → { meshes: GLTFMesh[], scene?: number }

// Raw bytes, when the host does its own fetching
const parsed = parseGLB(new Uint8Array(arrayBuffer))

// Images: inject the host's loader once. @rasenjs/dom installs one at import
// time; other hosts provide their own (native, embedded, tests).
setImageAdapter({
  loadImage: (url) => new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = url
  }),
  loadImageBitmap: async (url) => {
    const res = await fetch(url)
    return createImageBitmap(await res.blob())
  }
})

const texture = await loadImage('/sprites/hero.png')
```

Spine types, parsers and the runtime are re-exported from the `./spine`
submodule; `spine` components for the canvas/GL targets take the parsed data and
render it.

## License

MIT
