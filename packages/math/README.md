# @rasenjs/math

Rasen math library - Vector, Matrix, and Quaternion operations for 2D/3D graphics.

## Installation

```bash
npm install @rasenjs/math
# or
yarn add @rasenjs/math
```

## Features

- **Vector Types**: `Vec2f`, `Vec3f`, `Vec4f`
- **Matrix Types**: `Mat3x3f`, `Mat4x4f`
- **Quaternion**: `Quatf`
- **Immutable**: All operations return new instances
- **Type-safe**: Full TypeScript support with strict typing
- **Zero dependencies**: Pure TypeScript implementation

## Usage

### Vectors

```typescript
import { Vec2f, Vec3f, vec2f, vec3f, addVec2, normalizeVec3 } from '@rasenjs/math'

// Create vectors
const v1 = vec2f(1, 2)
const v2 = new Vec2f(3, 4)

// Operations
const sum = addVec2(v1, v2)
const normalized = normalizeVec3(vec3f(1, 2, 3))

// Access components
console.log(v1.x, v1.y) // 1, 2
```

### Matrices

```typescript
import { Mat4x4f, mat4x4f, multiplyMat4x4 } from '@rasenjs/math'

// Create identity matrix
const identity = mat4x4f()

// Create transformation matrices
const translation = Mat4x4f.translate(10, 20, 0)
const rotation = Mat4x4f.rotateZ(Math.PI / 4)
const scale = Mat4x4f.scale(2, 2, 1)

// Combine transformations
const transform = multiplyMat4x4(translation, multiplyMat4x4(rotation, scale))
```

### Quaternions

```typescript
import { Quatf, quatf, slerp } from '@rasenjs/math'

// Create quaternions
const q1 = quatf(0, 0, 0, 1) // identity
const q2 = Quatf.fromEuler(Math.PI / 4, 0, 0) // rotation around X

// Interpolate
const result = slerp(q1, q2, 0.5)
```

## API Reference

### Vec2f

- `vec2f(x, y)` - Create a 2D vector
- `addVec2(a, b)` - Add two vectors
- `subtractVec2(a, b)` - Subtract vectors
- `multiplyVec2(v, s)` - Multiply by scalar
- `dotVec2(a, b)` - Dot product
- `lengthVec2(v)` - Vector length
- `normalizeVec2(v)` - Normalize vector
- `distanceVec2(a, b)` - Distance between vectors

### Vec3f

- `vec3f(x, y, z)` - Create a 3D vector
- `addVec3(a, b)` - Add two vectors
- `cross(a, b)` - Cross product
- `reflectVec3(v, normal)` - Reflect vector

### Mat4x4f

- `mat4x4f()` - Create identity matrix
- `Mat4x4f.translate(x, y, z)` - Translation matrix
- `Mat4x4f.rotateX(angle)` - Rotation around X axis
- `Mat4x4f.rotateY(angle)` - Rotation around Y axis
- `Mat4x4f.rotateZ(angle)` - Rotation around Z axis
- `Mat4x4f.scale(x, y, z)` - Scale matrix
- `multiplyMat4x4(a, b)` - Multiply matrices
- `inverseMat4x4(m)` - Inverse matrix

## License

MIT
