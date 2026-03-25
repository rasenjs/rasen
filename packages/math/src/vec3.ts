import { Vec2f } from './vec2'

export class Vec3f {
  readonly source: Float32Array

  constructor(x: number, y: number, z: number) {
    this.source = new Float32Array([x, y, z])
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

  get xy(): Vec2f {
    return new Vec2f(this.x, this.y)
  }

  get yz(): Vec2f {
    return new Vec2f(this.y, this.z)
  }

  get xz(): Vec2f {
    return new Vec2f(this.x, this.z)
  }

  add(v: Vec3f): Vec3f {
    return new Vec3f(this.x + v.x, this.y + v.y, this.z + v.z)
  }

  subtract(v: Vec3f): Vec3f {
    return new Vec3f(this.x - v.x, this.y - v.y, this.z - v.z)
  }

  multiply(v: Vec3f): Vec3f {
    return new Vec3f(this.x * v.x, this.y * v.y, this.z * v.z)
  }

  divide(v: Vec3f): Vec3f {
    return new Vec3f(this.x / v.x, this.y / v.y, this.z / v.z)
  }

  scale(s: number): Vec3f {
    return new Vec3f(this.x * s, this.y * s, this.z * s)
  }

  dot(v: Vec3f): number {
    return this.x * v.x + this.y * v.y + this.z * v.z
  }

  cross(v: Vec3f): Vec3f {
    return new Vec3f(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    )
  }

  length(): number {
    return Math.sqrt(this.dot(this))
  }

  lengthSquared(): number {
    return this.dot(this)
  }

  normalize(): Vec3f {
    const len = this.length()
    if (len === 0) {
      return new Vec3f(0, 0, 0)
    }
    return this.scale(1 / len)
  }

  negate(): Vec3f {
    return new Vec3f(-this.x, -this.y, -this.z)
  }

  lerp(v: Vec3f, t: number): Vec3f {
    return new Vec3f(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
      this.z + (v.z - this.z) * t
    )
  }

  distance(v: Vec3f): number {
    return this.subtract(v).length()
  }

  distanceSquared(v: Vec3f): number {
    return this.subtract(v).lengthSquared()
  }

  reflect(normal: Vec3f): Vec3f {
    const d = 2 * this.dot(normal)
    return this.subtract(normal.scale(d))
  }

  clone(): Vec3f {
    return new Vec3f(this.x, this.y, this.z)
  }

  equals(v: Vec3f, epsilon: number = 0.0001): boolean {
    return (
      Math.abs(this.x - v.x) < epsilon &&
      Math.abs(this.y - v.y) < epsilon &&
      Math.abs(this.z - v.z) < epsilon
    )
  }

  toString(): string {
    return `Vec3f(${this.x}, ${this.y}, ${this.z})`
  }

  static zero(): Vec3f {
    return new Vec3f(0, 0, 0)
  }

  static one(): Vec3f {
    return new Vec3f(1, 1, 1)
  }

  static up(): Vec3f {
    return new Vec3f(0, 1, 0)
  }

  static down(): Vec3f {
    return new Vec3f(0, -1, 0)
  }

  static left(): Vec3f {
    return new Vec3f(-1, 0, 0)
  }

  static right(): Vec3f {
    return new Vec3f(1, 0, 0)
  }

  static forward(): Vec3f {
    return new Vec3f(0, 0, -1)
  }

  static back(): Vec3f {
    return new Vec3f(0, 0, 1)
  }

  static fromArray(arr: number[] | Float32Array): Vec3f {
    return new Vec3f(arr[0], arr[1], arr[2])
  }
}

export function vec3f(x: number, y: number, z: number): Vec3f
export function vec3f(xy: Vec2f, z: number): Vec3f
export function vec3f(x: number, yz: Vec2f): Vec3f
export function vec3f(v: Vec3f): Vec3f
export function vec3f(a: Vec2f | Vec3f | number, b?: Vec2f | number, c?: number): Vec3f {
  if (a instanceof Vec3f) {
    return a.clone()
  }
  if (a instanceof Vec2f) {
    if (typeof b === 'number') {
      return new Vec3f(a.x, a.y, b)
    }
    throw new Error('Invalid arguments for vec3f')
  }
  if (typeof a === 'number') {
    if (b instanceof Vec2f) {
      return new Vec3f(a, b.x, b.y)
    }
    if (typeof b === 'number' && typeof c === 'number') {
      return new Vec3f(a, b, c)
    }
  }
  throw new Error('Invalid arguments for vec3f')
}

export function add(a: Vec3f, b: Vec3f): Vec3f {
  return a.add(b)
}

export function subtract(a: Vec3f, b: Vec3f): Vec3f {
  return a.subtract(b)
}

export function multiply(a: Vec3f, b: Vec3f): Vec3f {
  return a.multiply(b)
}

export function divide(a: Vec3f, b: Vec3f): Vec3f {
  return a.divide(b)
}

export function dot(a: Vec3f, b: Vec3f): number {
  return a.dot(b)
}

export function cross(a: Vec3f, b: Vec3f): Vec3f {
  return a.cross(b)
}

export function length(v: Vec3f): number {
  return v.length()
}

export function lengthSquared(v: Vec3f): number {
  return v.lengthSquared()
}

export function normalize(v: Vec3f): Vec3f {
  return v.normalize()
}

export function negate(v: Vec3f): Vec3f {
  return v.negate()
}

export function lerp(a: Vec3f, b: Vec3f, t: number): Vec3f {
  return a.lerp(b, t)
}

export function distance(a: Vec3f, b: Vec3f): number {
  return a.distance(b)
}

export function distanceSquared(a: Vec3f, b: Vec3f): number {
  return a.distanceSquared(b)
}

export function reflect(v: Vec3f, normal: Vec3f): Vec3f {
  return v.reflect(normal)
}
