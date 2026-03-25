export class Vec2f {
  readonly source: Float32Array

  constructor(x: number, y: number) {
    this.source = new Float32Array([x, y])
  }

  get x(): number {
    return this.source[0]
  }

  get y(): number {
    return this.source[1]
  }

  add(v: Vec2f): Vec2f {
    return new Vec2f(this.x + v.x, this.y + v.y)
  }

  subtract(v: Vec2f): Vec2f {
    return new Vec2f(this.x - v.x, this.y - v.y)
  }

  multiply(v: Vec2f): Vec2f {
    return new Vec2f(this.x * v.x, this.y * v.y)
  }

  divide(v: Vec2f): Vec2f {
    return new Vec2f(this.x / v.x, this.y / v.y)
  }

  scale(s: number): Vec2f {
    return new Vec2f(this.x * s, this.y * s)
  }

  dot(v: Vec2f): number {
    return this.x * v.x + this.y * v.y
  }

  length(): number {
    return Math.sqrt(this.dot(this))
  }

  lengthSquared(): number {
    return this.dot(this)
  }

  normalize(): Vec2f {
    const len = this.length()
    if (len === 0) {
      return new Vec2f(0, 0)
    }
    return this.scale(1 / len)
  }

  negate(): Vec2f {
    return new Vec2f(-this.x, -this.y)
  }

  lerp(v: Vec2f, t: number): Vec2f {
    return new Vec2f(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t
    )
  }

  distance(v: Vec2f): number {
    return this.subtract(v).length()
  }

  distanceSquared(v: Vec2f): number {
    return this.subtract(v).lengthSquared()
  }

  reflect(normal: Vec2f): Vec2f {
    const d = 2 * this.dot(normal)
    return this.subtract(normal.scale(d))
  }

  clone(): Vec2f {
    return new Vec2f(this.x, this.y)
  }

  equals(v: Vec2f, epsilon: number = 0.0001): boolean {
    return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon
  }

  toString(): string {
    return `Vec2f(${this.x}, ${this.y})`
  }

  static zero(): Vec2f {
    return new Vec2f(0, 0)
  }

  static one(): Vec2f {
    return new Vec2f(1, 1)
  }

  static up(): Vec2f {
    return new Vec2f(0, 1)
  }

  static down(): Vec2f {
    return new Vec2f(0, -1)
  }

  static left(): Vec2f {
    return new Vec2f(-1, 0)
  }

  static right(): Vec2f {
    return new Vec2f(1, 0)
  }

  static fromArray(arr: number[] | Float32Array): Vec2f {
    return new Vec2f(arr[0], arr[1])
  }
}

export function vec2f(x: number, y: number): Vec2f {
  return new Vec2f(x, y)
}

export function add(a: Vec2f, b: Vec2f): Vec2f {
  return a.add(b)
}

export function subtract(a: Vec2f, b: Vec2f): Vec2f {
  return a.subtract(b)
}

export function multiply(a: Vec2f, b: Vec2f): Vec2f {
  return a.multiply(b)
}

export function divide(a: Vec2f, b: Vec2f): Vec2f {
  return a.divide(b)
}

export function dot(a: Vec2f, b: Vec2f): number {
  return a.dot(b)
}

export function length(v: Vec2f): number {
  return v.length()
}

export function lengthSquared(v: Vec2f): number {
  return v.lengthSquared()
}

export function normalize(v: Vec2f): Vec2f {
  return v.normalize()
}

export function negate(v: Vec2f): Vec2f {
  return v.negate()
}

export function lerp(a: Vec2f, b: Vec2f, t: number): Vec2f {
  return a.lerp(b, t)
}

export function distance(a: Vec2f, b: Vec2f): number {
  return a.distance(b)
}

export function distanceSquared(a: Vec2f, b: Vec2f): number {
  return a.distanceSquared(b)
}

export function reflect(v: Vec2f, normal: Vec2f): Vec2f {
  const d = 2 * dot(v, normal)
  return subtract(v, normal.scale(d))
}
