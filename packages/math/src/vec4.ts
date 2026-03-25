import { Vec2f } from './vec2'
import { Vec3f } from './vec3'

export class Vec4f {
  readonly source: Float32Array

  constructor(x: number, y: number, z: number, w: number) {
    this.source = new Float32Array([x, y, z, w])
  }

  get x(): number {
    return this.source[0]
  }

  get y(): number {
    return this.source[1]
  }

  get z(): number {
    return this.source[2]
  }

  get w(): number {
    return this.source[3]
  }

  get r(): number {
    return this.source[0]
  }

  get g(): number {
    return this.source[1]
  }

  get b(): number {
    return this.source[2]
  }

  get a(): number {
    return this.source[3]
  }

  get xy(): Vec2f {
    return new Vec2f(this.x, this.y)
  }

  get yz(): Vec2f {
    return new Vec2f(this.y, this.z)
  }

  get zw(): Vec2f {
    return new Vec2f(this.z, this.w)
  }

  get xyz(): Vec3f {
    return new Vec3f(this.x, this.y, this.z)
  }

  get yzw(): Vec3f {
    return new Vec3f(this.y, this.z, this.w)
  }

  toVec3(): Vec3f {
    return new Vec3f(this.x, this.y, this.z)
  }

  add(v: Vec4f): Vec4f {
    return new Vec4f(this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w)
  }

  subtract(v: Vec4f): Vec4f {
    return new Vec4f(this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w)
  }

  multiply(v: Vec4f): Vec4f {
    return new Vec4f(this.x * v.x, this.y * v.y, this.z * v.z, this.w * v.w)
  }

  divide(v: Vec4f): Vec4f {
    return new Vec4f(this.x / v.x, this.y / v.y, this.z / v.z, this.w / v.w)
  }

  scale(s: number): Vec4f {
    return new Vec4f(this.x * s, this.y * s, this.z * s, this.w * s)
  }

  dot(v: Vec4f): number {
    return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w
  }

  length(): number {
    return Math.sqrt(this.dot(this))
  }

  lengthSquared(): number {
    return this.dot(this)
  }

  normalize(): Vec4f {
    const len = this.length()
    if (len === 0) {
      return new Vec4f(0, 0, 0, 0)
    }
    return this.scale(1 / len)
  }

  negate(): Vec4f {
    return new Vec4f(-this.x, -this.y, -this.z, -this.w)
  }

  lerp(v: Vec4f, t: number): Vec4f {
    return new Vec4f(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
      this.z + (v.z - this.z) * t,
      this.w + (v.w - this.w) * t
    )
  }

  clone(): Vec4f {
    return new Vec4f(this.x, this.y, this.z, this.w)
  }

  equals(v: Vec4f, epsilon: number = 0.0001): boolean {
    return (
      Math.abs(this.x - v.x) < epsilon &&
      Math.abs(this.y - v.y) < epsilon &&
      Math.abs(this.z - v.z) < epsilon &&
      Math.abs(this.w - v.w) < epsilon
    )
  }

  toString(): string {
    return `Vec4f(${this.x}, ${this.y}, ${this.z}, ${this.w})`
  }

  static zero(): Vec4f {
    return new Vec4f(0, 0, 0, 0)
  }

  static one(): Vec4f {
    return new Vec4f(1, 1, 1, 1)
  }

  static fromArray(arr: number[] | Float32Array): Vec4f {
    return new Vec4f(arr[0], arr[1], arr[2], arr[3])
  }
}

export function vec4f(x: number, y: number, z: number, w: number): Vec4f
export function vec4f(xy: Vec2f, z: number, w: number): Vec4f
export function vec4f(x: number, y: number, zw: Vec2f): Vec4f
export function vec4f(x: number, yz: Vec2f, w: number): Vec4f
export function vec4f(xy: Vec2f, zw: Vec2f): Vec4f
export function vec4f(xyz: Vec3f, w: number): Vec4f
export function vec4f(x: number, yzw: Vec3f): Vec4f
export function vec4f(v: Vec4f): Vec4f
export function vec4f(
  a: Vec4f | Vec3f | Vec2f | number,
  b?: Vec3f | Vec2f | number,
  c?: Vec2f | number,
  d?: number
): Vec4f {
  if (a instanceof Vec4f) {
    return a.clone()
  }
  if (a instanceof Vec3f) {
    if (typeof b === 'number') {
      return new Vec4f(a.x, a.y, a.z, b)
    }
    throw new Error('Invalid arguments for vec4f')
  }
  if (a instanceof Vec2f) {
    if (b instanceof Vec2f) {
      return new Vec4f(a.x, a.y, b.x, b.y)
    }
    if (typeof b === 'number' && typeof c === 'number') {
      return new Vec4f(a.x, a.y, b, c)
    }
    throw new Error('Invalid arguments for vec4f')
  }
  if (typeof a === 'number') {
    if (b instanceof Vec3f) {
      return new Vec4f(a, b.x, b.y, b.z)
    }
    if (b instanceof Vec2f) {
      if (typeof c === 'number') {
        return new Vec4f(a, b.x, b.y, c)
      }
      throw new Error('Invalid arguments for vec4f')
    }
    if (typeof b === 'number') {
      if (c instanceof Vec2f) {
        return new Vec4f(a, b, c.x, c.y)
      }
      if (typeof c === 'number' && typeof d === 'number') {
        return new Vec4f(a, b, c, d)
      }
    }
  }
  throw new Error('Invalid arguments for vec4f')
}

export function add(a: Vec4f, b: Vec4f): Vec4f {
  return a.add(b)
}

export function subtract(a: Vec4f, b: Vec4f): Vec4f {
  return a.subtract(b)
}

export function multiply(a: Vec4f, b: Vec4f): Vec4f {
  return a.multiply(b)
}

export function divide(a: Vec4f, b: Vec4f): Vec4f {
  return a.divide(b)
}

export function dot(a: Vec4f, b: Vec4f): number {
  return a.dot(b)
}

export function length(v: Vec4f): number {
  return v.length()
}

export function lengthSquared(v: Vec4f): number {
  return v.lengthSquared()
}

export function normalize(v: Vec4f): Vec4f {
  return v.normalize()
}

export function negate(v: Vec4f): Vec4f {
  return v.negate()
}

export function lerp(a: Vec4f, b: Vec4f, t: number): Vec4f {
  return a.lerp(b, t)
}
