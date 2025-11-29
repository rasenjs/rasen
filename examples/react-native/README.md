# Rasen React Native Example

This example demonstrates using Rasen's reactive rendering system with React Native's Fabric architecture, **without using React**.

## Demo

https://github.com/user-attachments/assets/demo.mp4

> For architecture details, see [@rasenjs/react-native](../../packages/react-native/README.md)

## Quick Start

### Prerequisites

- Node.js 18+
- Yarn (project uses Yarn 4)
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
cd ios && pod install && cd ..
```

### Android Setup

```bash
export ANDROID_HOME=~/Library/Android/sdk
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

## Running

### Start Metro Bundler

```bash
cd examples/react-native
yarn start
```

### Run iOS

```bash
yarn ios
# Or open ios/RasenExample.xcworkspace in Xcode
```

### Run Android

```bash
yarn android
# Or open android/ in Android Studio
```

## Troubleshooting

### Metro Bundling Issues

```bash
cd /path/to/rasen
cd examples/react-native && yarn start
```

### iOS Pod Installation Failure

```bash
sudo xcodebuild -license accept
cd ios && rm -rf Pods Podfile.lock && pod install
```

### Android Gradle Issues

```bash
cd android && ./gradlew clean
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

## License

MIT
