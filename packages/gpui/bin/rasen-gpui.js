#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Determine the native binary path based on platform and build type
const platform = process.platform;
const arch = process.arch;

// For now, we only support macOS with the release build
// In the future, we can add support for other platforms and download pre-built binaries
function findBinary() {
  const packageDir = path.dirname(__dirname);
  
  // Check for release build first
  const releaseBinary = path.join(packageDir, 'native', 'target', 'release', 'rasen-gpui');
  if (fs.existsSync(releaseBinary)) {
    return releaseBinary;
  }
  
  // Fall back to debug build
  const debugBinary = path.join(packageDir, 'native', 'target', 'debug', 'rasen-gpui');
  if (fs.existsSync(debugBinary)) {
    return debugBinary;
  }
  
  // Check for pre-built binary in bin directory (for npm distribution)
  const prebuiltBinary = path.join(packageDir, 'bin', `rasen-gpui-${platform}-${arch}`);
  if (fs.existsSync(prebuiltBinary)) {
    return prebuiltBinary;
  }
  
  return null;
}

const binaryPath = findBinary();

if (!binaryPath) {
  console.error('Error: Native binary not found.');
  console.error('');
  console.error('Please build the native binary first:');
  console.error('  cd packages/gpui && yarn build:native');
  console.error('');
  console.error('Or if you installed from npm, please report this issue.');
  process.exit(1);
}

// Forward all arguments to the native binary
const args = process.argv.slice(2);
const child = spawn(binaryPath, args, {
  stdio: 'inherit',
  cwd: process.cwd(),
});

child.on('error', (err) => {
  console.error('Failed to start native binary:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
