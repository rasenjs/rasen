<script setup>
import counterDom from '../snippets/counter-dom.ts?raw'
import counterRn from '../snippets/counter-rn.ts?raw'
import todoDom from '../snippets/todo-dom.ts?raw'
import canvasAnimation from '../snippets/canvas-animation.ts?raw'
</script>

# Examples

Explore complete examples of Rasen in action.

::: tip 运行示例
Clone 仓库后运行 `yarn examples:dev` 即可在本地查看完整可交互示例。
:::

## Counter

A simple counter demonstrating reactive state across different platforms:

<CodeTabs
  :examples="{
    dom: { label: 'DOM', code: counterDom },
    rn: { label: 'React Native', code: counterRn }
  }"
/>

## Todo List

A complete todo application with add, toggle, and remove functionality:

<CodeBlock :code="todoDom" title="Todo App (DOM)" />

## Canvas Animation

Animated graphics using Canvas 2D with reactive state:

<CodeBlock :code="canvasAnimation" title="Canvas Animation" />

## Running Examples Locally

Clone the repository and run:

```bash
git clone https://github.com/rasenjs/rasen.git
cd rasen
yarn install
yarn examples:dev
```

Visit `http://localhost:5173` to see the examples in action.

## Example Files

The example source files are located in:

| Platform     | Location                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- |
| Web (DOM)    | [`examples/web/`](https://github.com/rasenjs/rasen/tree/main/examples/web)                   |
| Canvas 2D    | [`examples/canvas-2d/`](https://github.com/rasenjs/rasen/tree/main/examples/canvas-2d)       |
| React Native | [`examples/react-native/`](https://github.com/rasenjs/rasen/tree/main/examples/react-native) |
