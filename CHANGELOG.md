# Changelog

All notable changes to the Rasen project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4-alpha] - 2026-01-05

### Fixed

#### Router
- **Critical**: Fixed Link component not passing through props like `class` and `style`
  - Link components were missing CSS classes causing styling issues
  - Now properly spreads all additional props to the underlying Anchor component

#### Template
- Restored original home page structure with hero section, code examples, and features grid
- Fixed layout structure to match original design

## [0.1.3-alpha] - 2026-01-05

### Added

#### Router Packages
- Enhanced routing capabilities with nested route processing and navigation guards
- Added leave guard functionality and navigation error handling
- Implemented core router functionality with components, history management, and route definitions
- Created `@rasenjs/router-dom` package with DOM-specific router components

#### Core & DOM
- Element now supports mixing arrays and strings as children
- Added more DOM tags (details, summary, dialog, etc.)
- Optimized DOM operations and signal processing to reduce unnecessary updates
- Enhanced component lifecycle management with effect scopes
- Updated component types to use Mountable for better consistency

#### Shared
- Added boundary utility functions and tests for geometric calculations

#### Template
- Updated `rasen-ts` template to version 0.1.3-alpha
- Added router integration with multiple views (Home, Counter, Todo, Timer, About)
- Implemented navigation with active link highlighting
- Created view-based architecture for better code organization
- Enhanced UI with navigation bar and improved layout
- Updated documentation with router examples and setup instructions

### Changed

- All core packages updated to 0.1.3-alpha
- `@rasenjs/core`: 0.1.2-alpha → 0.1.3-alpha
- `@rasenjs/dom`: 0.1.2-alpha → 0.1.3-alpha
- `@rasenjs/jsx-runtime`: 0.1.2-alpha → 0.1.3-alpha
- `@rasenjs/reactive-vue`: 0.1.2-alpha → 0.1.3-alpha
- `@rasenjs/reactive-signals`: 0.1.2-alpha → 0.1.3-alpha
- `@rasenjs/shared`: 0.1.0-alpha → 0.1.3-alpha
- `@rasenjs/router`: 0.1.0-alpha → 0.1.3-alpha
- `@rasenjs/router-dom`: 0.1.0 → 0.1.3-alpha
- Wrapped components with `com` helper function for better lifecycle management

### Fixed

- Reduced unnecessary DOM updates by optimizing signal processing
- Enhanced component lifecycle to prevent memory leaks

## [0.1.2-alpha] - 2025-12-05

### Added
- Component lifecycle management with effect scopes
- `com` wrapper for automatic effect scope management

### Changed
- Updated package versions to 0.1.2-alpha
- Added publish configuration

## [0.1.1-alpha] - 2025-12-XX

### Added
- Initial router implementation
- Basic DOM and Canvas renderers

## [0.1.0-alpha] - 2025-12-XX

### Added
- Initial release
- Core reactive framework
- DOM renderer
- Canvas 2D renderer
- Vue reactivity adapter
- Signals reactivity adapter
- JSX runtime
