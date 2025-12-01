# Rasen - js-framework-benchmark Implementation

This is the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) implementation for Rasen.

## Features

- **Keyed implementation**: Each row maintains a stable DOM node based on its ID
- **Reactive rendering**: Using Vue's reactivity system via `@rasenjs/reactive-vue`
- **Minimal DOM operations**: Direct DOM manipulation for optimal performance

## Operations

| Button | Operation |
|--------|-----------|
| Create 1,000 rows | Create a table with 1,000 rows |
| Create 10,000 rows | Create a table with 10,000 rows |
| Append 1,000 rows | Append 1,000 rows to the existing table |
| Update every 10th row | Update the label of every 10th row |
| Clear | Remove all rows |
| Swap Rows | Swap row 2 and row 999 |
| Row click | Select row (highlight with danger class) |
| Delete icon click | Remove the specific row |

## Local Development

```bash
# Install dependencies
yarn install

# Start dev server
yarn dev

# Build for production
yarn build-prod
```

## Integrating with js-framework-benchmark

1. Clone the benchmark repository:
```bash
git clone https://github.com/krausest/js-framework-benchmark.git
cd js-framework-benchmark
npm ci
npm run install-local
```

2. Copy this folder to the benchmark frameworks:
```bash
cp -r examples/benchmark frameworks/keyed/rasen
```

3. Update `package.json` to use npm packages instead of workspace:
```json
{
  "dependencies": {
    "@rasenjs/core": "^x.x.x",
    "@rasenjs/dom": "^x.x.x",
    "@rasenjs/reactive-vue": "^x.x.x"
  }
}
```

4. Build and run:
```bash
cd frameworks/keyed/rasen
npm install
npm run build-prod

# Start server from root
cd ../../..
npm start

# Open http://localhost:8080/frameworks/keyed/rasen/
```

5. Run the benchmark:
```bash
npm run bench -- --framework keyed/rasen
npm run results
```

## Architecture

```
src/
└── main.ts          # Main benchmark implementation
    ├── Data generation (adjectives, colours, nouns)
    ├── State management (data, selected)
    ├── Actions (run, runLots, add, update, clear, swapRows, select, remove)
    └── Row component (keyed rendering with selection support)
```

## Performance Considerations

1. **shallowRef for data array**: Avoids deep reactivity overhead
2. **Direct DOM manipulation**: Row component creates DOM nodes directly
3. **Keyed updates via each()**: Rasen's `each` component maintains stable instances
4. **Minimal watch scope**: Only watch selection state per row

## License

MIT
