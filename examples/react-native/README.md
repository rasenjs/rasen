# Rasen React Native Example

This example demonstrates using Rasen's reactive rendering system with React Native's Fabric architecture, **without using React**.

## Overview

This example showcases:

- **Counter** - Simple counter with increment/decrement buttons
- **Todo List** - More complex list management example

## Key Features

- **No React Dependency** - Rasen directly calls Fabric UI Manager APIs
- **Vue-style Reactivity** - Uses `@rasenjs/reactive-vue` for reactive state
- **Direct Native Interface** - Interfaces directly with React Native native components
- **Independent View Management** - No React Reconciler, Rasen manages the view hierarchy

## How It Works

Rasen bypasses React entirely by:

1. Using `AppRegistry.registerRunnable()` instead of `registerComponent()`
2. Directly calling Fabric UI Manager to create/update native views
3. Managing its own view tree and reconciliation logic

```javascript
// No React required!
AppRegistry.registerRunnable('RasenExample', ({ rootTag }) => {
  const unmount = createApp(rootTag);
  return { run: () => {} };
});
```

## Setup

### Prerequisites

- Node.js 18+
- Yarn (project uses Yarn 4)
- React Native CLI
- **iOS**: macOS + Xcode 15+ + CocoaPods
- **Android**: Android Studio + JDK 17+

### Installation

From the monorepo root:

```bash
# Install all dependencies
yarn install

# Build Rasen packages
yarn build
```

### iOS Setup

```bash
cd examples/react-native

# Install CocoaPods dependencies
cd ios && pod install && cd ..
```

### Android Setup

```bash
# Ensure environment variables are set
export ANDROID_HOME=~/Library/Android/sdk
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

# Or open in Android Studio
open -a "Android Studio" examples/react-native/android
```

## Running

### Start Metro Bundler

```bash
cd examples/react-native
yarn start
```

### Run iOS

```bash
# Option 1: CLI
yarn ios

# Option 2: Xcode
# Open ios/RasenExample.xcworkspace
# Select simulator and click Run
```

### Run Android

```bash
# Option 1: CLI (requires running emulator or connected device)
yarn android

# Option 2: Android Studio
# Open android/ directory
# Select device and click Run
```

### Manual Bundling (Optional)

```bash
# Generate iOS bundle
yarn bundle:ios

# Generate Android bundle
yarn bundle:android
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Rasen Application                        │
│            (examples/react-native/src/App.ts)                │
├─────────────────────────────────────────────────────────────┤
│  @rasenjs/reactive-vue  │  @rasenjs/core  │  @rasenjs/rn    │
│  (Vue Reactivity)       │  (Core Runtime) │  (RN Renderer)  │
├─────────────────────────────────────────────────────────────┤
│              React Native Fabric Architecture                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  UIManager  │  ShadowTree  │  Yoga Layout  │  Native UI │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
examples/react-native/
├── index.js              # Entry point (no React!)
├── src/
│   └── App.ts            # Main application logic
├── ios/                  # iOS native code
│   ├── RasenExample/     # iOS app
│   └── Podfile           # CocoaPods configuration
├── android/              # Android native code
│   ├── app/              # Android app module
│   └── build.gradle      # Gradle configuration
├── metro.config.js       # Metro bundler config
├── babel.config.js       # Babel config
└── package.json          # Project dependencies
```

## Example Code

```typescript
import { setReactiveRuntime } from '@rasenjs/core';
import { createVueRuntime } from '@rasenjs/reactive-vue';
import { view, text, touchableOpacity } from '@rasenjs/react-native';
import { ref, computed } from 'vue';

setReactiveRuntime(createVueRuntime());

const count = ref(0);

const Counter = view({
  style: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  children: [
    text({
      style: { fontSize: 48, fontWeight: 'bold' },
      children: computed(() => `${count.value}`)
    }),
    touchableOpacity({
      style: {
        backgroundColor: '#007AFF',
        padding: 16,
        borderRadius: 8,
        marginTop: 20
      },
      onPress: () => count.value++,
      children: [
        text({
          style: { color: 'white', fontSize: 18 },
          children: 'Increment'
        })
      ]
    })
  ]
});
```

## Troubleshooting

### Metro Bundling Issues

If you encounter module resolution issues, make sure to start from the monorepo root:

```bash
cd /path/to/rasen
cd examples/react-native && yarn start
```

### iOS Pod Installation Failure

```bash
# Accept Xcode license
sudo xcodebuild -license accept

# Clean and reinstall
cd ios && rm -rf Pods Podfile.lock && pod install
```

### Android Gradle Issues

```bash
# Clean Gradle cache
cd android && ./gradlew clean

# Ensure JAVA_HOME points to correct JDK
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

## Notes

- This example uses a hybrid approach where React Native's AppRegistry is used for bootstrapping
- Actual UI rendering is managed by Rasen's render context
- For a pure Fabric implementation, native modules would need to expose Fabric APIs
- Current RNRenderContext is a mock implementation requiring native module support for actual rendering

## License

MIT
