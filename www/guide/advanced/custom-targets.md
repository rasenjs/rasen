# Custom Render Targets

One of Rasen's core strengths is the ability to render to any target. This guide shows how to create custom render target adapters.

## The MountFunction Pattern

Every render target implements the same pattern:

```typescript
type MountFunction<Host> = (host: Host) => (() => void) | undefined
```

- **Input**: A host (the render target)
- **Output**: An unmount function for cleanup

## Example: Three.js Adapter

Let's create a simple Three.js adapter:

```typescript
import * as THREE from 'three'
import { watchProp, unref } from '@rasenjs/dom'
import type { PropValue, MountFunction } from '@rasenjs/core'

// Host type
type ThreeHost = THREE.Object3D

// Primitive: mesh
export const mesh = (props: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  position?: PropValue<{ x: number; y: number; z: number }>
  rotation?: PropValue<{ x: number; y: number; z: number }>
}): MountFunction<ThreeHost> => (parent) => {
  const mesh = new THREE.Mesh(props.geometry, props.material)
  
  const stops: (() => void)[] = []
  
  if (props.position) {
    stops.push(watchProp(
      () => unref(props.position),
      (pos) => {
        if (pos) mesh.position.set(pos.x, pos.y, pos.z)
      }
    ))
  }
  
  if (props.rotation) {
    stops.push(watchProp(
      () => unref(props.rotation),
      (rot) => {
        if (rot) mesh.rotation.set(rot.x, rot.y, rot.z)
      }
    ))
  }
  
  parent.add(mesh)
  
  return () => {
    stops.forEach(stop => stop())
    parent.remove(mesh)
    mesh.geometry.dispose()
    if (mesh.material instanceof THREE.Material) {
      mesh.material.dispose()
    }
  }
}

// Primitive: group
export const group = (props: {
  position?: PropValue<{ x: number; y: number; z: number }>
  children?: MountFunction<ThreeHost>[]
}): MountFunction<ThreeHost> => (parent) => {
  const grp = new THREE.Group()
  
  const stops: (() => void)[] = []
  const childUnmounts: ((() => void) | undefined)[] = []
  
  if (props.position) {
    stops.push(watchProp(
      () => unref(props.position),
      (pos) => {
        if (pos) grp.position.set(pos.x, pos.y, pos.z)
      }
    ))
  }
  
  if (props.children) {
    for (const child of props.children) {
      childUnmounts.push(child(grp))
    }
  }
  
  parent.add(grp)
  
  return () => {
    stops.forEach(stop => stop())
    childUnmounts.forEach(unmount => unmount?.())
    parent.remove(grp)
  }
}

// Mount helper
export function mount(
  component: MountFunction<ThreeHost>,
  scene: THREE.Scene
) {
  return component(scene)
}
```

## Usage

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref } from 'vue'
import * as THREE from 'three'
import { mesh, group, mount } from './three-adapter'

useReactiveRuntime()

const scene = new THREE.Scene()
const rotation = ref({ x: 0, y: 0, z: 0 })

const SpinningCube = () => mesh({
  geometry: new THREE.BoxGeometry(1, 1, 1),
  material: new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
  rotation
})

mount(SpinningCube(), scene)

// Animate
function animate() {
  rotation.value = {
    x: rotation.value.x + 0.01,
    y: rotation.value.y + 0.01,
    z: 0
  }
  requestAnimationFrame(animate)
}
animate()
```

## Key Principles

### 1. Accept PropValue for Reactive Props

```typescript
interface Props {
  staticProp: string           // Always static
  reactiveProp: PropValue<number>  // Can be static or reactive
}
```

### 2. Use watchProp for Updates

```typescript
watchProp(
  () => unref(props.value),
  (newValue) => {
    // Apply update to host
  }
)
```

### 3. Return Cleanup Function

```typescript
return () => {
  // Stop all watchers
  stops.forEach(stop => stop())
  
  // Unmount children
  childUnmounts.forEach(unmount => unmount?.())
  
  // Remove from host
  host.remove(element)
  
  // Dispose resources
  element.dispose?.()
}
```

### 4. Support Children

```typescript
if (props.children) {
  for (const child of props.children) {
    childUnmounts.push(child(element))
  }
}
```

## More Examples

### Terminal UI

```typescript
type TerminalHost = { write: (text: string) => void }

const text = (content: PropValue<string>): MountFunction<TerminalHost> => 
  (terminal) => {
    watchProp(
      () => unref(content),
      (text) => terminal.write(text)
    )
    return () => terminal.write('\x1b[2K')  // Clear line
  }
```

### PDF Generation

```typescript
type PDFHost = { addPage: () => void; text: (s: string, x: number, y: number) => void }

const paragraph = (props: { text: string; x: number; y: number }): MountFunction<PDFHost> =>
  (pdf) => {
    pdf.text(props.text, props.x, props.y)
    return undefined  // PDFs are write-once
  }
```

The pattern is infinitely flexible — anywhere you can mount and unmount, you can use Rasen.
