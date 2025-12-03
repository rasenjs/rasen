#!/usr/bin/env node

/**
 * Rasen LVGL CLI
 *
 * Commands:
 *   run [file]   - Run in simulator
 *   flash        - Flash to ESP32
 *   init [name]  - Create new project
 *   build        - Build for production
 */

const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// ============ Platform Detection ============

const platform = process.platform
const isWindows = platform === 'win32'
const ext = isWindows ? '.exe' : ''

// ============ Find Simulator Binary ============

function findSimulatorBinary() {
  const packageDir = path.dirname(__dirname)
  const nativeDir = path.join(packageDir, 'native')

  // Check common build locations
  const candidates = [
    // CMake build directory
    path.join(nativeDir, 'simulator', 'build', 'rasen_simulator' + ext),
    path.join(
      nativeDir,
      'simulator',
      'build',
      'Release',
      'rasen_simulator' + ext
    ),
    path.join(
      nativeDir,
      'simulator',
      'build',
      'Debug',
      'rasen_simulator' + ext
    ),
    // Pre-built binary
    path.join(packageDir, 'bin', `rasen-lvgl-${platform}` + ext)
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

// ============ Commands ============

function runSimulator(scriptPath) {
  const binary = findSimulatorBinary()

  if (!binary) {
    console.error('Error: Simulator binary not found.')
    console.error('')
    console.error('To build the simulator:')
    console.error('  cd packages/lvgl/native/simulator')
    console.error('  mkdir build && cd build')
    console.error('  cmake ..')
    console.error('  cmake --build .')
    process.exit(1)
  }

  // Resolve script path
  let script = scriptPath
  if (!script) {
    // Look for entry file in current directory
    const candidates = [
      'src/main.ts',
      'src/main.js',
      'src/index.ts',
      'src/index.js',
      'main.js'
    ]
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        script = candidate
        break
      }
    }
  }

  if (!script) {
    console.error('Error: No script file specified and no entry file found.')
    console.error('Usage: rasen-lvgl run <script.js>')
    process.exit(1)
  }

  // Check if TypeScript - need to compile first
  if (script.endsWith('.ts')) {
    console.log('Compiling TypeScript...')
    try {
      // Use esbuild if available
      const outFile = script.replace(/\.ts$/, '.js')
      execSync(
        `npx esbuild ${script} --outfile=${outFile} --format=esm --bundle --external:@rasenjs/*`,
        {
          stdio: 'inherit'
        }
      )
      script = outFile
    } catch (e) {
      console.error(
        'Failed to compile TypeScript. Make sure esbuild is installed.'
      )
      process.exit(1)
    }
  }

  console.log(`Running: ${script}`)
  console.log(`Simulator: ${binary}`)
  console.log('')

  const child = spawn(binary, [path.resolve(script)], {
    stdio: 'inherit',
    cwd: process.cwd()
  })

  child.on('exit', (code) => {
    process.exit(code || 0)
  })
}

function flashDevice(options) {
  console.log('Flashing to ESP32...')
  console.log('')

  // Check for esptool
  try {
    execSync('esptool.py version', { stdio: 'pipe' })
  } catch (e) {
    console.error('Error: esptool.py not found.')
    console.error('Install with: pip install esptool')
    process.exit(1)
  }

  // TODO: Build ESP32 firmware and flash
  console.log('To flash ESP32:')
  console.log('  1. Build the ESP32 firmware:')
  console.log('     cd packages/lvgl/native/esp32')
  console.log('     idf.py build')
  console.log('')
  console.log('  2. Flash:')
  console.log('     idf.py -p COM5 flash')
  console.log('')
  console.log('(Automated flashing coming soon)')
}

function initProject(name) {
  const targetDir = path.resolve(name || 'my-lvgl-app')

  if (fs.existsSync(targetDir)) {
    console.error(`Error: Directory '${name}' already exists.`)
    process.exit(1)
  }

  console.log(`Creating project: ${name}`)

  // Create directories
  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })

  // package.json
  const pkg = {
    name: name,
    version: '0.0.1',
    type: 'module',
    scripts: {
      dev: 'rasen-lvgl run',
      build: 'rasen-lvgl build',
      flash: 'rasen-lvgl flash'
    },
    dependencies: {
      '@rasenjs/lvgl': 'workspace:*'
    }
  }
  fs.writeFileSync(
    path.join(targetDir, 'package.json'),
    JSON.stringify(pkg, null, 2)
  )

  // src/main.ts
  const mainTs = `import { ref, div, label, button, run } from '@rasenjs/lvgl'

function App() {
    const count = ref(0)
    
    return div({
        class: 'flex flex-col items-center justify-center size-full bg-gray-900 gap-4',
        children: [
            label({
                class: 'text-2xl text-white',
                children: () => \`Count: \${count.value}\`
            }),
            div({
                class: 'flex flex-row gap-2',
                children: [
                    button({
                        class: 'px-4 py-2 bg-blue-500 rounded-lg',
                        onClick: () => count.value--,
                        children: [label({ class: 'text-white', children: '-' })]
                    }),
                    button({
                        class: 'px-4 py-2 bg-blue-500 rounded-lg',
                        onClick: () => count.value++,
                        children: [label({ class: 'text-white', children: '+' })]
                    })
                ]
            })
        ]
    })
}

run(App)
`
  fs.writeFileSync(path.join(targetDir, 'src', 'main.ts'), mainTs)

  console.log('')
  console.log(`✔ Project '${name}' created successfully!`)
  console.log('')
  console.log('Next steps:')
  console.log(`  cd ${name}`)
  console.log('  npm install')
  console.log('  npm run dev')
}

function buildProject() {
  console.log('Building for production...')
  // TODO: Bundle JS, optimize, prepare for ESP32
  console.log('(Build not implemented yet)')
}

function showHelp() {
  console.log('Rasen LVGL - Run Rasen UI on LVGL displays')
  console.log('')
  console.log('Usage: rasen-lvgl <command> [options]')
  console.log('')
  console.log('Commands:')
  console.log('  run [file]     Run in SDL2 simulator')
  console.log('  flash          Flash firmware to ESP32')
  console.log('  init [name]    Create a new project')
  console.log('  build          Build for production')
  console.log('')
  console.log('Examples:')
  console.log('  rasen-lvgl run src/main.ts')
  console.log('  rasen-lvgl init my-app')
  console.log('  rasen-lvgl flash')
}

// ============ Main ============

const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'run':
    runSimulator(args[1])
    break
  case 'flash':
    flashDevice({ port: args[1] })
    break
  case 'init':
    initProject(args[1] || 'my-lvgl-app')
    break
  case 'build':
    buildProject()
    break
  case 'help':
  case '--help':
  case '-h':
    showHelp()
    break
  default:
    if (command) {
      console.error(`Unknown command: ${command}`)
      console.error('')
    }
    showHelp()
    process.exit(command ? 1 : 0)
}
