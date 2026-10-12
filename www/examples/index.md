# Examples

Everything below lives in the repository and runs from the workspace root — no
publishing required while the compiler and several targets are still in-repo.

```bash
git clone https://github.com/rasenjs/rasen.git
cd rasen
yarn install
yarn build          # the examples import the workspace packages
```

## Runnable examples

| Example | Command | What it shows |
| ------- | ------- | ------------- |
| [web](https://github.com/rasenjs/rasen/tree/main/examples/web) | `yarn examples:web:dev` | DOM, Canvas 2D, JSX, transitions, lazy components, HMR |
| [canvas-2d](https://github.com/rasenjs/rasen/tree/main/examples/canvas-2d) | `yarn workspace @rasenjs/examples-canvas-2d dev` | the shape gallery and animation basics |
| [gfx](https://github.com/rasenjs/rasen/tree/main/examples/gfx) | `yarn examples:webgl:dev` | WebGL painting the canvas-2d API, batching, cameras |
| [ssr](https://github.com/rasenjs/rasen/tree/main/examples/ssr) | `yarn examples:ssr:dev` | `renderToString` + `hydrate`, isomorphic routing |
| [router-demo](https://github.com/rasenjs/rasen/tree/main/examples/router-demo) | — | the router on both targets |
| [react-native](https://github.com/rasenjs/rasen/tree/main/examples/react-native) | see its README | an RN app with no React |
| [rn-dom-test](https://github.com/rasenjs/rasen/tree/main/examples/rn-dom-test) | see its README | the Fabric document layer directly |
| [gpui](https://github.com/rasenjs/rasen/tree/main/examples/gpui) | see its README | native desktop window, Tailwind-style classes |
| [lvgl](https://github.com/rasenjs/rasen/tree/main/examples/lvgl) | native simulator | embedded target (LVGL + QuickJS) |
| [mario](https://github.com/rasenjs/rasen/tree/main/examples/mario) | `yarn examples:mario:dev` | a platformer: sprites, input, frame scheduling |
| [racing](https://github.com/rasenjs/rasen/tree/main/examples/racing) | `yarn examples:racing:dev` | a top-down racer, Kenney starter kit |
| [fps](https://github.com/rasenjs/rasen/tree/main/examples/fps) | `yarn examples:fps:dev` | a first-person view with sprites and assets |
| [craft](https://github.com/rasenjs/rasen/tree/main/examples/craft) | `yarn examples:craft:dev` | voxel-style world, WebGL |
| [kenney-fps](https://github.com/rasenjs/rasen/tree/main/examples/kenney-fps), [kenney-racing](https://github.com/rasenjs/rasen/tree/main/examples/kenney-racing) | — | 3D content in the GL target |
| [nikke-viewer](https://github.com/rasenjs/rasen/tree/main/examples/nikke-viewer) | `yarn examples:nikke-viewer:dev` | Spine character viewer with routing and drawers |
| [perry-nikke-viewer](https://github.com/rasenjs/rasen/tree/main/examples/perry-nikke-viewer) | `yarn examples:perry-nikke-viewer:build` | the same viewer compiled ahead-of-time with Perry |
| [perry-spine](https://github.com/rasenjs/rasen/tree/main/examples/perry-spine), [perry-reactive-test](https://github.com/rasenjs/rasen/tree/main/examples/perry-reactive-test) | — | the native AOT path |

The canonical *template* — what a new app looks like — is
[`templates/rasen-ts`](https://github.com/rasenjs/rasen/tree/main/templates/rasen-ts)
(SSR + hydration, isomorphic routing, signals, compiler).

## Code walkthroughs

- [Counter (DOM + React Native)](/examples/playground) — one component,
  two hosts
- [Todo list](/examples/playground) — `each`, DOM properties, computed text
- [Canvas animation](/examples/playground) — signals driving shapes
- [SSR](/examples/playground) — rendering to a string

The [Interactive Playground](/examples/playground) page renders the same
snippet sources the repository ships (`www/snippets/*`), so the code you read
there is exactly the code that is built and type-checked.
