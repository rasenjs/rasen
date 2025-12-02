#!/usr/bin/env npx tsx
/**
 * Rasen LVGL Native Dependencies Setup Script
 *
 * Run with: npx tsx scripts/setup-deps.ts
 * Or: node --import tsx scripts/setup-deps.ts
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, rmSync, createWriteStream } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEPS_DIR = join(__dirname, '..', 'simulator', 'deps')

const DEPS = {
  lvgl: {
    name: 'LVGL',
    version: 'v8.3.11',
    repo: 'https://github.com/lvgl/lvgl.git',
    branch: 'v8.3.11'
  },
  quickjs: {
    name: 'QuickJS-ng',
    repo: 'https://github.com/quickjs-ng/quickjs.git'
  },
  sdl2: {
    name: 'SDL2',
    version: '2.28.5',
    // Windows: pre-built VC binaries
    // macOS/Linux: use system package or build from source
    windowsUrl:
      'https://github.com/libsdl-org/SDL/releases/download/release-2.28.5/SDL2-devel-2.28.5-VC.zip'
  }
}

function run(cmd: string, cwd?: string) {
  console.log(`  $ ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          https
            .get(response.headers.location!, (res) => {
              res.pipe(file)
              file.on('finish', () => {
                file.close()
                resolve()
              })
            })
            .on('error', reject)
        } else {
          response.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve()
          })
        }
      })
      .on('error', reject)
  })
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  // Use PowerShell on Windows, unzip on Unix
  if (process.platform === 'win32') {
    run(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`
    )
  } else {
    run(`unzip -o "${zipPath}" -d "${destDir}"`)
  }
}

async function setupLVGL() {
  const dir = join(DEPS_DIR, 'lvgl')
  if (existsSync(dir)) {
    console.log('  ✓ LVGL already exists, skipping...')
    return
  }

  console.log(`  Cloning LVGL ${DEPS.lvgl.version}...`)
  run(
    `git clone --depth 1 --branch ${DEPS.lvgl.branch} ${DEPS.lvgl.repo}`,
    DEPS_DIR
  )
}

async function setupQuickJS() {
  const dir = join(DEPS_DIR, 'quickjs')
  if (existsSync(dir)) {
    console.log('  ✓ QuickJS-ng already exists, skipping...')
    return
  }

  console.log('  Cloning QuickJS-ng...')
  run(`git clone --depth 1 ${DEPS.quickjs.repo}`, DEPS_DIR)
}

async function setupSDL2() {
  const version = DEPS.sdl2.version
  const dir = join(DEPS_DIR, `SDL2-${version}`)

  if (existsSync(dir)) {
    console.log('  ✓ SDL2 already exists, skipping...')
    return
  }

  const platform = process.platform

  if (platform === 'win32') {
    console.log(`  Downloading SDL2 ${version} for Windows...`)
    const zipPath = join(DEPS_DIR, `SDL2-${version}.zip`)
    await downloadFile(DEPS.sdl2.windowsUrl, zipPath)

    console.log('  Extracting...')
    await extractZip(zipPath, DEPS_DIR)
    rmSync(zipPath)
    console.log(`  ✓ SDL2 extracted to SDL2-${version}/`)
  } else if (platform === 'darwin') {
    console.log('  For macOS, install SDL2 via Homebrew:')
    console.log('    brew install sdl2')
    console.log(
      '  Or download from: https://github.com/libsdl-org/SDL/releases'
    )
  } else {
    console.log('  For Linux, install SDL2 via package manager:')
    console.log('    Ubuntu/Debian: sudo apt install libsdl2-dev')
    console.log('    Fedora: sudo dnf install SDL2-devel')
    console.log('    Arch: sudo pacman -S sdl2')
  }
}

async function main() {
  console.log('\n🔧 Setting up Rasen LVGL dependencies...\n')

  // Create deps directory
  if (!existsSync(DEPS_DIR)) {
    mkdirSync(DEPS_DIR, { recursive: true })
  }

  console.log('[1/3] LVGL')
  await setupLVGL()

  console.log('\n[2/3] QuickJS-ng')
  await setupQuickJS()

  console.log('\n[3/3] SDL2')
  await setupSDL2()

  console.log('\n✅ Dependencies setup complete!')
  console.log(`\nLocation: ${DEPS_DIR}`)
  console.log('  - lvgl/         (LVGL v8.3.11)')
  console.log('  - quickjs/      (QuickJS-ng)')
  console.log(`  - SDL2-${DEPS.sdl2.version}/   (SDL2 for simulator)`)
  console.log('\nNext step: Build the simulator')
  console.log('  cd native/simulator')
  console.log('  mkdir build && cd build')
  console.log('  cmake .. && cmake --build . --config Release')
}

main().catch(console.error)
