# 🎮 Rasen 3D Rendering Roadmap

> **Vision**: Build a Three.js-like 3D rendering engine within the Rasen paradigm, supporting lightweight games, PBR rendering, and ray tracing.

---

## 🎯 Long-term Goals

1. **Lightweight Game Support** - Physics, collision detection, game loop optimization
2. **PBR (Physically Based Rendering)** - Realistic material system with metallic/roughness workflow
3. **Ray Tracing** - Real-time ray tracing effects (reflections, shadows, global illumination)
4. **Three.js Feature Parity** - Core features comparable to Three.js for most use cases

---

## 📋 Development Phases

### **Phase 0: Foundation (Current)**
> Establish basic 3D infrastructure and architecture

#### 0.1 Core Math & Utilities
- [ ] 4x4 matrix operations (multiply, transpose, inverse)
- [ ] Perspective projection matrix
- [ ] View matrix (lookAt)
- [ ] Model transformation (translate, rotate, scale)
- [ ] Quaternion support for rotations
- [ ] Vector3 utilities (add, subtract, dot, cross, normalize)
- [ ] Frustum culling utilities

#### 0.2 WebGL Setup & Context
- [ ] Extend RenderContext for 3D mode
  - [ ] Depth testing (`gl.DEPTH_TEST`)
  - [ ] Depth buffer clear
  - [ ] Face culling (`gl.CULL_FACE`)
  - [ ] 3D viewport management
- [ ] Separate 2D and 3D render pipelines
- [ ] 3D-specific context options

#### 0.3 Shader System V2
- [ ] Unified shader manager
- [ ] Vertex shader with normals and UVs
- [ ] Fragment shader with lighting calculations
- [ ] Shader preprocessor (for feature flags)
- [ ] Shader library (reusable chunks)

**Deliverable**: Basic 3D rendering capability

---

### **Phase 1: Basic 3D Scene (Foundation)**
> Render simple 3D scenes with primitives

#### 1.1 Camera System
- [ ] `PerspectiveCamera` component
  - [ ] FOV, aspect, near, far planes
  - [ ] Position, target, up vector
  - [ ] Reactive view matrix
- [ ] `OrthographicCamera` component
- [ ] Camera controls
  - [ ] Orbit controls
  - [ ] First-person controls
  - [ ] Pan/zoom

#### 1.2 Basic Primitives
- [ ] `Box` (cube with normals)
- [ ] `Sphere` (UV sphere generation)
- [ ] `Plane`
- [ ] `Cylinder`
- [ ] `Cone`
- [ ] All primitives support:
  - [ ] Position, rotation (Euler/quaternion), scale
  - [ ] Vertex normals
  - [ ] UV coordinates

#### 1.3 Basic Lighting
- [ ] Phong lighting model
- [ ] `AmbientLight` component
- [ ] `DirectionalLight` component
- [ ] `PointLight` component
- [ ] Basic material properties (ambient, diffuse, specular, shininess)

#### 1.4 Scene Graph
- [ ] `Group` component (transform hierarchy)
- [ ] Parent-child relationships
- [ ] World matrix calculation
- [ ] Transform propagation

**Deliverable**: Render lit 3D primitives with camera controls

---

### **Phase 2: Material & Texture System**
> Realistic materials and texture mapping

#### 2.1 Texture System
- [ ] Texture loading (image, canvas, video)
- [ ] Texture wrapping (repeat, clamp, mirror)
- [ ] Texture filtering (nearest, linear, mipmap)
- [ ] Texture formats (RGB, RGBA, depth)
- [ ] Cube textures (skybox)
- [ ] Multi-texturing support

#### 2.2 Advanced Materials
- [ ] `MeshBasicMaterial` (no lighting)
- [ ] `MeshPhongMaterial` (specular highlights)
- [ ] `MeshStandardMaterial` (PBR preview)
- [ ] Material properties:
  - [ ] Diffuse/albedo map
  - [ ] Normal map
  - [ ] Specular map
  - [ ] Emissive map
  - [ ] Alpha/transparency
  - [ ] Double-sided rendering

#### 2.3 Advanced Lighting
- [ ] `SpotLight` component
- [ ] Multiple light support (uniform arrays)
- [ ] Light attenuation
- [ ] Per-fragment lighting (vs per-vertex)

**Deliverable**: Textured 3D objects with advanced lighting

---

### **Phase 3: Geometry & Performance**
> Custom geometry and optimization

#### 3.1 Custom Geometry
- [ ] `Geometry` class (vertices, indices, normals, UVs)
- [ ] `BufferGeometry` (efficient attribute storage)
- [ ] Geometry utilities:
  - [ ] Merge geometries
  - [ ] Compute normals
  - [ ] Compute tangents (for normal mapping)
  - [ ] Bounding box/sphere calculation

#### 3.2 Mesh Loading
- [ ] OBJ loader
- [ ] glTF 2.0 loader (basic)
- [ ] Geometry compression
- [ ] Async loading with progress

#### 3.3 Performance Optimization
- [ ] Frustum culling
- [ ] Occlusion culling (basic)
- [ ] Level of Detail (LOD)
- [ ] Instanced rendering for 3D (reuse Phase 0 work)
- [ ] Geometry batching
- [ ] Draw call optimization

#### 3.4 Picking & Interaction
- [ ] Ray casting
- [ ] Object picking (mouse/touch)
- [ ] Bounding volume hit testing

**Deliverable**: Load and render complex 3D models efficiently

---

### **Phase 4: PBR (Physically Based Rendering)**
> Realistic material rendering

#### 4.1 PBR Theory Implementation
- [ ] Cook-Torrance BRDF
- [ ] Metallic-roughness workflow
- [ ] Energy conservation
- [ ] Fresnel effect (Schlick approximation)
- [ ] Image-based lighting (IBL)

#### 4.2 PBR Material System
- [ ] `MeshPBRMaterial` component
- [ ] PBR texture maps:
  - [ ] Albedo/base color
  - [ ] Metallic
  - [ ] Roughness
  - [ ] Normal (tangent space)
  - [ ] Ambient occlusion
  - [ ] Emissive
- [ ] Material presets (metal, plastic, wood, etc.)

#### 4.3 Environment Mapping
- [ ] Skybox rendering
- [ ] Environment probes
- [ ] IBL (diffuse + specular)
- [ ] HDRI support
- [ ] Pre-filtered environment maps

#### 4.4 Tone Mapping & Color Grading
- [ ] HDR rendering pipeline
- [ ] Tone mapping operators (ACES, Reinhard, etc.)
- [ ] Exposure control
- [ ] Gamma correction
- [ ] Color grading LUTs

**Deliverable**: Photorealistic PBR rendering

---

### **Phase 5: Shadows & Advanced Effects**
> Realistic shadows and visual effects

#### 5.1 Shadow Mapping
- [ ] Directional light shadows
- [ ] Point light shadows (cube maps)
- [ ] Spot light shadows
- [ ] Shadow map resolution control
- [ ] PCF (Percentage Closer Filtering)
- [ ] Cascaded shadow maps (CSM)

#### 5.2 Post-Processing Pipeline
- [ ] Render targets / FBO management
- [ ] Post-processing stack
- [ ] Built-in effects:
  - [ ] Bloom
  - [ ] Depth of field
  - [ ] Motion blur
  - [ ] SSAO (Screen Space Ambient Occlusion)
  - [ ] Fog
  - [ ] Anti-aliasing (FXAA, SMAA)

#### 5.3 Particle Systems
- [ ] Particle emitter component
- [ ] GPU-based particles
- [ ] Particle physics (gravity, wind)
- [ ] Texture atlas support
- [ ] Soft particles (depth blending)

**Deliverable**: Shadows and post-processing effects

---

### **Phase 6: Ray Tracing (WebGPU)**
> Real-time ray tracing effects

> **Note**: This phase requires WebGPU support. May need to create `@rasenjs/webgpu` package.

#### 6.1 WebGPU Foundation
- [ ] WebGPU context setup
- [ ] Compute shader support
- [ ] BVH (Bounding Volume Hierarchy) acceleration
- [ ] Ray-triangle intersection
- [ ] Material system for ray tracing

#### 6.2 Hybrid Rendering Pipeline
- [ ] Rasterization for primary rays
- [ ] Ray tracing for secondary effects
- [ ] Denoising algorithms

#### 6.3 Ray Traced Effects
- [ ] Screen-space reflections → Ray traced reflections
- [ ] Ray traced shadows (soft shadows)
- [ ] Ray traced ambient occlusion
- [ ] Ray traced global illumination (basic)

#### 6.4 Path Tracing (Optional)
- [ ] Unbiased path tracer
- [ ] Importance sampling
- [ ] Progressive rendering
- [ ] Offline rendering mode

**Deliverable**: Real-time ray tracing effects using WebGPU

---

### **Phase 7: Game Engine Features**
> Support for lightweight games

#### 7.1 Physics Integration
- [ ] Rigid body dynamics
- [ ] Collision detection
  - [ ] Sphere-sphere
  - [ ] Box-box
  - [ ] Mesh-mesh (simplified)
- [ ] Physics constraints (joints)
- [ ] Integration with physics libraries (Cannon.js, Rapier)

#### 7.2 Animation System
- [ ] Skeletal animation
- [ ] Blend shapes (morph targets)
- [ ] Animation mixer/blending
- [ ] Keyframe interpolation
- [ ] IK (Inverse Kinematics) basic

#### 7.3 Audio System
- [ ] 3D positional audio
- [ ] Audio listener (follows camera)
- [ ] Audio sources (point, ambient)
- [ ] Doppler effect
- [ ] Integration with Web Audio API

#### 7.4 Input & Controls
- [ ] Keyboard input handling
- [ ] Mouse/touch input
- [ ] Gamepad support
- [ ] Virtual joystick (mobile)

#### 7.5 Game Loop & Optimization
- [ ] Fixed timestep physics update
- [ ] Variable rendering
- [ ] Performance monitoring
- [ ] Memory pooling
- [ ] Entity component system (optional)

**Deliverable**: Lightweight 3D game development capability

---

### **Phase 8: Advanced Features & Polish**
> Production-ready features

#### 8.1 Advanced Rendering
- [ ] Screen-space reflections (SSR)
- [ ] Volumetric lighting
- [ ] God rays
- [ ] Lens flares
- [ ] Subsurface scattering (SSS)

#### 8.2 Tools & Debugging
- [ ] Scene inspector
- [ ] Performance profiler
- [ ] Shader hot-reload
- [ ] Bounding box visualization
- [ ] Normal visualization

#### 8.3 glTF 2.0 Full Support
- [ ] Animations
- [ ] Skinning
- [ ] Morph targets
- [ ] Extensions (KHR_materials_pbrSpecularGlossiness, etc.)
- [ ] Draco compression

#### 8.4 Content Pipeline
- [ ] Asset manager
- [ ] Texture compression (KTX2, Basis)
- [ ] Mesh optimization
- [ ] Batch processing

**Deliverable**: Production-ready 3D engine

---

## 📊 Feature Comparison with Three.js

| Feature | Three.js | Rasen 3D | Priority |
|---------|----------|----------|----------|
| Basic primitives | ✅ | Phase 1 | P0 |
| Camera system | ✅ | Phase 1 | P0 |
| Phong lighting | ✅ | Phase 1 | P0 |
| Textures | ✅ | Phase 2 | P0 |
| Custom geometry | ✅ | Phase 3 | P1 |
| Model loading | ✅ | Phase 3 | P1 |
| PBR materials | ✅ | Phase 4 | P1 |
| Shadows | ✅ | Phase 5 | P1 |
| Post-processing | ✅ | Phase 5 | P2 |
| Ray tracing | ⚠️ (limited) | Phase 6 | P2 |
| Physics | ➕ (via plugins) | Phase 7 | P2 |
| Animation | ✅ | Phase 7 | P2 |
| Reactive paradigm | ❌ | ✅ | Core |

---

## 🏗️ Architecture Principles

### 1. Rasen-First Design
- All components are Rasen three-phase functions
- Reactive props propagate to GPU automatically
- No imperative API unless necessary

### 2. Performance by Default
- GPU instancing for repeated geometry
- Frustum culling always enabled
- Efficient buffer management
- Zero-copy where possible

### 3. Progressive Enhancement
- Works with WebGL 1.0 (fallbacks)
- Best with WebGL 2.0
- WebGPU for ray tracing (future)

### 4. Modular Design
- Each phase is independently usable
- Tree-shakeable exports
- Optional features don't bloat core

---

## 🚀 Getting Started (Future)

```typescript
import { canvas } from '@rasenjs/dom'
import { 
  perspectiveCamera, 
  box, 
  directionalLight,
  meshPBRMaterial 
} from '@rasenjs/webgl'

const Scene = () => {
  const rotation = ref(0)
  
  // Game loop
  effect(() => {
    const animate = () => {
      rotation.value += 0.01
      requestAnimationFrame(animate)
    }
    animate()
  })
  
  return canvas({
    contextType: 'webgl2',
    contextOptions: { mode: '3d' },
    width: 800,
    height: 600,
    children: [
      // Camera
      perspectiveCamera({
        position: [0, 5, 10],
        target: [0, 0, 0],
        fov: 75
      }),
      
      // Lights
      directionalLight({
        direction: [-1, -1, -1],
        intensity: 1
      }),
      
      // 3D Object with PBR material
      box({
        position: [0, 0, 0],
        rotation: [0, rotation, 0],
        material: meshPBRMaterial({
          albedo: '#ff6b6b',
          metallic: 0.8,
          roughness: 0.2
        })
      })
    ]
  })
}
```

---

## 📚 Technical References

- [Learn OpenGL](https://learnopengl.com/) - 3D graphics fundamentals
- [WebGL2 Fundamentals](https://webgl2fundamentals.org/) - WebGL API
- [PBR Book](https://pbr-book.org/) - Physically based rendering theory
- [Real-Time Rendering](https://www.realtimerendering.com/) - Industry standard
- [GPU Gems](https://developer.nvidia.com/gpugems) - Advanced techniques

---

## 🎯 Current Status

**Phase**: Phase 0 - Foundation  
**Progress**: 0% (Planning complete)  
**Next Steps**: Implement 4x4 matrix utilities and 3D RenderContext mode
