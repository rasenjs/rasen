# 🎨 Rasen 2D Rendering Roadmap

> **Current Status**: Basic 2D primitives ✅  
> **Missing**: Camera system, scene management, advanced features

---

## ❌ Current Limitations

### No Camera System
```typescript
// Current: Fixed coordinate system (top-left origin)
circle({ x: 100, y: 100, radius: 50 })  
// Can't: pan, zoom, rotate viewport
```

### No Scene Management
```typescript
// Current: Flat component list
canvas({ children: [circle(), rect(), ...] })
// Can't: organize by layers, groups, z-index
```

### No Advanced Features
- ❌ Camera follow (e.g., follow player)
- ❌ Zoom in/out
- ❌ Parallax scrolling (multi-layer backgrounds)
- ❌ Minimap
- ❌ Split-screen
- ❌ Camera shake effects
- ❌ Smooth camera transitions

---

## 🎯 Roadmap

### **Phase 1: Camera System** 🔴 HIGH PRIORITY

#### 1.1 Camera2D Component
```typescript
const Camera2D = com((props: Camera2DProps) => {
  const runtime = getReactiveRuntime()
  const x = runtime.ref(props.x ?? 0)
  const y = runtime.ref(props.y ?? 0)
  const zoom = runtime.ref(props.zoom ?? 1)
  const rotation = runtime.ref(props.rotation ?? 0)
  
  // Watch props changes
  runtime.watch(() => props.x, (val) => { if (val !== undefined) x.value = val })
  runtime.watch(() => props.y, (val) => { if (val !== undefined) y.value = val })
  runtime.watch(() => props.zoom, (val) => { if (val !== undefined) zoom.value = val })
  runtime.watch(() => props.rotation, (val) => { if (val !== undefined) rotation.value = val })
  
  return (host: WebGLRenderingContext | WebGL2RenderingContext) => {
    const renderContext = getRenderContext(host)
    
    // Update camera in render context
    runtime.watch(
      () => [x.value, y.value, zoom.value, rotation.value],
      () => {
        renderContext.setCamera({
          x: x.value,
          y: y.value,
          zoom: zoom.value,
          rotation: rotation.value
        })
      },
      { immediate: true }
    )
    
    return () => {
      renderContext.resetCamera()
    }
  }
})
```

#### 1.2 RenderContext Camera Support
```typescript
export class RenderContext {
  private camera = {
    x: 0,
    y: 0,
    zoom: 1,
    rotation: 0
  }
  private viewMatrix: Float32Array = new Float32Array(9)
  
  setCamera(camera: Camera2D) {
    this.camera = camera
    this.updateViewMatrix()
    this.scheduleRender()
  }
  
  private updateViewMatrix() {
    // Create view matrix from camera transform
    // View = inverse(Translate * Rotate * Scale)
    const { x, y, zoom, rotation } = this.camera
    
    // 1. Scale (zoom)
    // 2. Rotate
    // 3. Translate (camera position)
    // Result: objects move opposite to camera
    
    this.viewMatrix = createViewMatrix(x, y, zoom, rotation)
    this.updateProjectionViewMatrix()
  }
  
  private updateProjectionViewMatrix() {
    // Combined matrix = projection * view
    this.projectionViewMatrix = multiplyMatrix3(
      this.projectionMatrix,
      this.viewMatrix
    )
    
    // Update all renderers with new matrix
    this.batchRenderer?.setProjectionMatrix(this.projectionViewMatrix)
    this.instancedRenderer?.setProjectionMatrix(this.projectionViewMatrix)
  }
}
```

#### 1.3 Camera Utilities
- [ ] `createViewMatrix(x, y, zoom, rotation)` - 生成视图矩阵
- [ ] Camera bounds calculation (what's visible)
- [ ] Screen-to-world coordinate conversion
- [ ] World-to-screen coordinate conversion

**Deliverable**: Camera can pan, zoom, rotate viewport

---

### **Phase 2: Scene Management**

#### 2.1 Layer System
```typescript
const Scene2D = com((props: Scene2DProps) => {
  return canvas({
    children: [
      camera2D({ x: 100, y: 100, zoom: 1 }),
      
      // Background layer (moves slower - parallax)
      layer({ name: 'background', parallax: 0.5, children: [
        rect({ x: 0, y: 0, width: 2000, height: 1000, color: '#87CEEB' })
      ]}),
      
      // Main layer (moves with camera 1:1)
      layer({ name: 'main', children: [
        circle({ x: 200, y: 200, radius: 50, color: '#ff6b6b' })
      ]}),
      
      // UI layer (fixed, doesn't move with camera)
      layer({ name: 'ui', fixed: true, children: [
        rect({ x: 10, y: 10, width: 100, height: 20, color: '#333' })
      ]})
    ]
  })
})
```

#### 2.2 Group Component
```typescript
// Hierarchical transforms
const Tank = () => group({
  x: 100,
  y: 100,
  rotation: 0.5,
  children: [
    // Tank body (inherits parent transform)
    rect({ x: -25, y: -15, width: 50, height: 30, color: '#4a4a4a' }),
    
    // Tank turret (additional rotation)
    group({
      x: 0,
      y: 0,
      rotation: 0.3,
      children: [
        rect({ x: -10, y: -5, width: 30, height: 10, color: '#333' })
      ]
    })
  ]
})
```

#### 2.3 Z-Index / Depth Sorting
```typescript
circle({ 
  x: 100, 
  y: 100, 
  zIndex: 10  // Draw on top
})

rect({ 
  x: 90, 
  y: 90, 
  zIndex: 5   // Draw behind
})
```

**Deliverable**: Multi-layer scenes with transform hierarchy

---

### **Phase 3: Advanced Camera Features**

#### 3.1 Camera Controllers
```typescript
// Follow camera (smooth follow)
const FollowCamera = com((props: { target: { x: Ref<number>, y: Ref<number> } }) => {
  const x = ref(0)
  const y = ref(0)
  const smoothness = 0.1
  
  effect(() => {
    const animate = () => {
      x.value += (props.target.x.value - x.value) * smoothness
      y.value += (props.target.y.value - y.value) * smoothness
      requestAnimationFrame(animate)
    }
    animate()
  })
  
  return camera2D({ x, y })
})

// Bounded camera (stays within world bounds)
const BoundedCamera = com((props: { 
  bounds: { minX: number, minY: number, maxX: number, maxY: number }
}) => {
  const x = ref(0)
  const y = ref(0)
  
  watch(() => x.value, (val) => {
    x.value = clamp(val, props.bounds.minX, props.bounds.maxX)
  })
  
  return camera2D({ x, y })
})
```

#### 3.2 Camera Effects
- [ ] Camera shake (earthquake, explosions)
- [ ] Smooth pan/zoom (easing)
- [ ] Screen flash (damage indicator)
- [ ] Screenshake on impact

#### 3.3 Multi-Camera Support
```typescript
// Split-screen multiplayer
canvas({
  children: [
    // Player 1 viewport (left half)
    viewport({
      x: 0, y: 0, width: 400, height: 600,
      camera: camera2D({ x: player1.x, y: player1.y }),
      children: [/* game scene */]
    }),
    
    // Player 2 viewport (right half)
    viewport({
      x: 400, y: 0, width: 400, height: 600,
      camera: camera2D({ x: player2.x, y: player2.y }),
      children: [/* game scene */]
    })
  ]
})
```

**Deliverable**: Advanced camera controls for games

---

### **Phase 4: Parallax & Effects**

#### 4.1 Parallax Scrolling
```typescript
// Automatic parallax based on layer depth
const ParallaxScene = () => canvas({
  children: [
    camera2D({ x: cameraX, y: cameraY }),
    
    // Far background (moves slowest)
    layer({ parallax: 0.2, children: [
      rect({ x: 0, y: 0, width: 5000, height: 600, color: '#1a1a2e' })
    ]}),
    
    // Mid background
    layer({ parallax: 0.5, children: [
      // Mountains, clouds, etc.
    ]}),
    
    // Main game layer
    layer({ parallax: 1.0, children: [
      // Player, enemies, platforms
    ]}),
    
    // Foreground (parallax > 1, moves faster)
    layer({ parallax: 1.3, children: [
      // Grass, leaves in foreground
    ]})
  ]
})
```

#### 4.2 Minimap
```typescript
const Minimap = () => {
  const worldCamera = ref({ x: 0, y: 0, zoom: 1 })
  
  return layer({
    fixed: true,  // UI layer
    children: [
      // Minimap background
      rect({ x: 650, y: 50, width: 150, height: 150, color: '#000' }),
      
      // Minimap content (tiny viewport)
      viewport({
        x: 650, y: 50, width: 150, height: 150,
        camera: camera2D({ 
          x: worldCamera.x, 
          y: worldCamera.y, 
          zoom: 0.1  // Zoomed out
        }),
        children: [
          // Render world at small scale
        ]
      })
    ]
  })
}
```

**Deliverable**: Parallax scrolling and minimap support

---

### **Phase 5: Optimization for Camera**

#### 5.1 Frustum Culling (2D)
```typescript
// Only render shapes visible in camera viewport
class RenderContext {
  private getCameraViewBounds(): Bounds {
    const { x, y, zoom } = this.camera
    const width = this.gl.canvas.width / zoom
    const height = this.gl.canvas.height / zoom
    
    return {
      minX: x - width / 2,
      minY: y - height / 2,
      maxX: x + width / 2,
      maxY: y + height / 2
    }
  }
  
  private isVisible(bounds: Bounds): boolean {
    const viewBounds = this.getCameraViewBounds()
    // AABB intersection test
    return !(
      bounds.maxX < viewBounds.minX ||
      bounds.minX > viewBounds.maxX ||
      bounds.maxY < viewBounds.minY ||
      bounds.minY > viewBounds.maxY
    )
  }
}
```

#### 5.2 Level of Detail (LOD)
```typescript
// Render simpler shapes when zoomed out
circle({
  x: 100,
  y: 100,
  radius: 50,
  segments: computed(() => {
    // More segments when zoomed in
    return Math.max(8, Math.floor(camera.zoom.value * 32))
  })
})
```

#### 5.3 Spatial Partitioning
- [ ] Quadtree for large worlds
- [ ] Grid-based culling
- [ ] Only update visible regions

**Deliverable**: Smooth performance with large worlds

---

## 🎮 Use Cases Enabled

### Game Development
- ✅ Platformer with smooth camera follow
- ✅ Top-down RPG with camera bounds
- ✅ Racing game with camera ahead of player
- ✅ Multiplayer split-screen

### Visualization
- ✅ Zoomable data visualization
- ✅ Interactive maps
- ✅ Panning charts/graphs
- ✅ Minimap overview

### Effects
- ✅ Parallax backgrounds
- ✅ Camera shake on events
- ✅ Smooth zoom transitions
- ✅ Screenshake effects

---

## 🚀 Example: Complete 2D Game Scene

```typescript
import { canvas } from '@rasenjs/dom'
import { camera2D, layer, circle, rect } from '@rasenjs/webgl'

const Game = () => {
  const playerX = ref(400)
  const playerY = ref(300)
  const cameraX = ref(400)
  const cameraY = ref(300)
  
  // Smooth camera follow
  effect(() => {
    const animate = () => {
      cameraX.value += (playerX.value - cameraX.value) * 0.1
      cameraY.value += (playerY.value - cameraY.value) * 0.1
      requestAnimationFrame(animate)
    }
    animate()
  })
  
  // Player movement
  useKeyboard({
    ArrowLeft: () => playerX.value -= 5,
    ArrowRight: () => playerX.value += 5,
    ArrowUp: () => playerY.value -= 5,
    ArrowDown: () => playerY.value += 5,
  })
  
  return canvas({
    width: 800,
    height: 600,
    contextType: 'webgl2',
    children: [
      // Camera follows player
      camera2D({ 
        x: cameraX, 
        y: cameraY, 
        zoom: 1 
      }),
      
      // Background layer (parallax)
      layer({
        name: 'background',
        parallax: 0.3,
        children: [
          rect({ x: 0, y: 0, width: 3000, height: 2000, color: '#87CEEB' })
        ]
      }),
      
      // Main game layer
      layer({
        name: 'main',
        children: [
          // Player
          circle({ 
            x: playerX, 
            y: playerY, 
            radius: 20, 
            color: '#ff6b6b' 
          }),
          
          // Obstacles
          rect({ x: 200, y: 200, width: 50, height: 50, color: '#333' }),
          rect({ x: 500, y: 400, width: 50, height: 50, color: '#333' })
        ]
      }),
      
      // UI layer (fixed)
      layer({
        name: 'ui',
        fixed: true,
        children: [
          // Score display
          rect({ x: 10, y: 10, width: 200, height: 30, color: '#000' })
        ]
      })
    ]
  })
}
```

---

## 📊 Priority

| Feature | Priority | Complexity | Impact |
|---------|----------|------------|--------|
| Camera2D Component | 🔴 P0 | Medium | High |
| View Matrix | 🔴 P0 | Medium | High |
| Layer System | 🟡 P1 | Low | High |
| Group Component | 🟡 P1 | Low | Medium |
| Frustum Culling | 🟡 P1 | Medium | High |
| Parallax | 🟢 P2 | Low | Medium |
| Camera Controllers | 🟢 P2 | Medium | High |
| Minimap | 🟢 P2 | Medium | Low |
| Split-screen | ⚪ P3 | High | Low |

---

## 🎯 Current Status

**Phase**: Pre-Phase 1  
**Blockers**: No camera system  
**Next Steps**: 
1. Implement `createViewMatrix()` in utils
2. Add camera state to RenderContext
3. Create Camera2D component
4. Update examples with camera usage
