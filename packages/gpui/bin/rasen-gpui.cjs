#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Determine the native binary path based on platform and build type
const platform = process.platform;
const arch = process.arch;

// Map Node.js platform/arch to our binary naming convention
function getPlatformInfo() {
  const platformMap = {
    darwin: 'darwin',
    win32: 'win32',
    linux: 'linux',
  };
  const archMap = {
    arm64: 'arm64',
    x64: 'x64',
    x86_64: 'x64',
  };
  
  const p = platformMap[platform];
  const a = archMap[arch];
  const ext = platform === 'win32' ? '.exe' : '';
  
  return { platform: p, arch: a, ext };
}

function findBinary() {
  const packageDir = path.dirname(__dirname);
  const { platform: p, arch: a, ext } = getPlatformInfo();
  
  // 1. Check for local development build (release)
  const localBinaryName = platform === 'win32' ? 'rasen-gpui.exe' : 'rasen-gpui';
  const releaseBinary = path.join(packageDir, 'native', 'target', 'release', localBinaryName);
  if (fs.existsSync(releaseBinary)) {
    return releaseBinary;
  }
  
  // 2. Check for local development build (debug)
  const debugBinary = path.join(packageDir, 'native', 'target', 'debug', localBinaryName);
  if (fs.existsSync(debugBinary)) {
    return debugBinary;
  }
  
  // 3. Check for pre-built binary in bin directory (for npm distribution)
  if (p && a) {
    const prebuiltBinary = path.join(packageDir, 'bin', `rasen-gpui-${p}-${a}${ext}`);
    if (fs.existsSync(prebuiltBinary)) {
      return prebuiltBinary;
    }
  }
  
  return null;
}

const binaryPath = findBinary();

if (!binaryPath) {
  const { platform: p, arch: a } = getPlatformInfo();
  console.error('Error: Native binary not found.');
  console.error('');
  console.error(`Platform: ${platform} (${p}), Arch: ${arch} (${a})`);
  console.error('');
  console.error('For local development, build the native binary:');
  console.error('  cd packages/gpui/native && cargo build --release');
  console.error('');
  console.error('Supported platforms:');
  console.error('  - macOS (Apple Silicon): darwin-arm64');
  console.error('  - macOS (Intel): darwin-x64');
  console.error('  - Windows: win32-x64');
  console.error('  - Linux: linux-x64');
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
