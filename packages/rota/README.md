# Rota Components

Headless UI components for the Rasen framework.

## Installation

```bash
npm install @rasenjs/rota
# or
yarn add @rasenjs/rota
# or
pnpm add @rasenjs/rota
```

## Usage

```typescript
import { primitive } from '@rasenjs/rota'

const Button = primitive('button')
```

## Development

```bash
# Install dependencies
yarn install

# Build
yarn build

# Run unit tests
yarn test

# Run unit tests with coverage
yarn test:coverage

# Run E2E tests
yarn e2e

# Run E2E tests with UI
yarn e2e:ui

# Type check
yarn typecheck

# Lint
yarn lint
yarn lint:fix
```

## Architecture

```
src/
├── index.ts          # Main exports
├── dom.ts           # DOM renderer exports
├── html.ts          # HTML/SSR exports
├── types/           # Type definitions
└── primitives/      # Base component primitives

tests/
├── unit/            # Unit tests (Vitest)
│   └── *.test.ts
└── e2e/            # E2E tests (Playwright)
    └── *.spec.ts
```

## Scripts

| Command         | Description                    |
| --------------- | ------------------------------ |
| `dev`           | Watch mode for development     |
| `build`         | Build for production           |
| `test`          | Run unit tests                 |
| `test:coverage` | Run tests with coverage report |
| `typecheck`     | TypeScript type checking       |
| `lint`          | ESLint check                   |
| `lint:fix`      | ESLint fix                     |
| `e2e`           | Run E2E tests                  |
| `e2e:ui`        | Run E2E tests with UI          |
| `clean`         | Remove dist folder             |
