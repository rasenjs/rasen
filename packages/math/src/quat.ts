import { Vec3f } from './vec3'
import { Mat4x4f } from './mat4x4'

export class Quatf {
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

  add(q: Quatf): Quatf {
    return new Quatf(this.x + q.x, this.y + q.y, this.z + q.z, this.w + q.w)
  }

  subtract(q: Quatf): Quatf {
    return new Quatf(this.x - q.x, this.y - q.y, this.z - q.z, this.w - q.w)
  }

  multiply(q: Quatf): Quatf {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w
    const bx = q.x, by = q.y, bz = q.z, bw = q.w

    return new Quatf(
      ax * bw + aw * bx + ay * bz - az * by,
      ay * bw + aw * by + az * bx - ax * bz,
      az * bw + aw * bz + ax * by - ay * bx,
      aw * bw - ax * bx - ay * by - az * bz
    )
  }

  scale(s: number): Quatf {
    return new Quatf(this.x * s, this.y * s, this.z * s, this.w * s)
  }

  dot(q: Quatf): number {
    return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w
  }

  length(): number {
    return Math.sqrt(this.dot(this))
  }

  lengthSquared(): number {
    return this.dot(this)
  }

  normalize(): Quatf {
    const len = this.length()
    if (len === 0) {
      return new Quatf(0, 0, 0, 1)
    }
    return this.scale(1 / len)
  }

  conjugate(): Quatf {
    return new Quatf(-this.x, -this.y, -this.z, this.w)
  }

  invert(): Quatf {
    const lenSq = this.lengthSquared()
    if (lenSq === 0) {
      return new Quatf(0, 0, 0, 1)
    }
    const conj = this.conjugate()
    return conj.scale(1 / lenSq)
  }

  lerp(q: Quatf, t: number): Quatf {
    return new Quatf(
      this.x + (q.x - this.x) * t,
      this.y + (q.y - this.y) * t,
      this.z + (q.z - this.z) * t,
      this.w + (q.w - this.w) * t
    ).normalize()
  }

  slerp(q: Quatf, t: number): Quatf {
    let dot = this.dot(q)

    if (dot < 0) {
      dot = -dot
      q = new Quatf(-q.x, -q.y, -q.z, -q.w)
    }

    if (dot > 0.9995) {
      return this.lerp(q, t)
    }

    const theta0 = Math.acos(dot)
    const theta = theta0 * t

    const sinTheta = Math.sin(theta)
    const sinTheta0 = Math.sin(theta0)

    const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0
    const s1 = sinTheta / sinTheta0

    return new Quatf(
      s0 * this.x + s1 * q.x,
      s0 * this.y + s1 * q.y,
      s0 * this.z + s1 * q.z,
      s0 * this.w + s1 * q.w
    )
  }

  rotateVec(v: Vec3f): Vec3f {
    const qv = new Quatf(v.x, v.y, v.z, 0)
    const result = this.multiply(qv).multiply(this.conjugate())
    return new Vec3f(result.x, result.y, result.z)
  }

  toMat4(): Mat4x4f {
    const x = this.x, y = this.y, z = this.z, w = this.w

    const x2 = x + x
    const y2 = y + y
    const z2 = z + z

    const xx = x * x2
    const xy = x * y2
    const xz = x * z2
    const yy = y * y2
    const yz = y * z2
    const zz = z * z2
    const wx = w * x2
    const wy = w * y2
    const wz = w * z2

    return new Mat4x4f([
      1 - (yy + zz), xy + wz, xz - wy, 0,
      xy - wz, 1 - (xx + zz), yz + wx, 0,
      xz + wy, yz - wx, 1 - (xx + yy), 0,
      0, 0, 0, 1
    ])
  }

  toEuler(): Vec3f {
    const x = this.x, y = this.y, z = this.z, w = this.w

    const sinr_cosp = 2 * (w * x + y * z)
    const cosr_cosp = 1 - 2 * (x * x + y * y)
    const roll = Math.atan2(sinr_cosp, cosr_cosp)

    const sinp = 2 * (w * y - z * x)
    let pitch: number
    if (Math.abs(sinp) >= 1) {
      pitch = Math.sign(sinp) * Math.PI / 2
    } else {
      pitch = Math.asin(sinp)
    }

    const siny_cosp = 2 * (w * z + x * y)
    const cosy_cosp = 1 - 2 * (y * y + z * z)
    const yaw = Math.atan2(siny_cosp, cosy_cosp)

    return new Vec3f(roll, pitch, yaw)
  }

  getAxis(): Vec3f {
    const s = Math.sqrt(1 - this.w * this.w)
    if (s < 0.0001) {
      return new Vec3f(1, 0, 0)
    }
    return new Vec3f(this.x / s, this.y / s, this.z / s)
  }

  getAngle(): number {
    return 2 * Math.acos(this.w)
  }

  clone(): Quatf {
    return new Quatf(this.x, this.y, this.z, this.w)
  }

  equals(q: Quatf, epsilon: number = 0.0001): boolean {
    return (
      Math.abs(this.x - q.x) < epsilon &&
      Math.abs(this.y - q.y) < epsilon &&
      Math.abs(this.z - q.z) < epsilon &&
      Math.abs(this.w - q.w) < epsilon
    )
  }

  toString(): string {
    return `Quatf(${this.x}, ${this.y}, ${this.z}, ${this.w})`
  }

  static identity(): Quatf {
    return new Quatf(0, 0, 0, 1)
  }

  static fromAxisAngle(axis: Vec3f, angle: number): Quatf {
    const halfAngle = angle / 2
    const s = Math.sin(halfAngle)
    const normalizedAxis = axis.normalize()
    return new Quatf(
      normalizedAxis.x * s,
      normalizedAxis.y * s,
      normalizedAxis.z * s,
      Math.cos(halfAngle)
    )
  }

  static fromEuler(x: number, y: number, z: number): Quatf {
    const c1 = Math.cos(x / 2)
    const c2 = Math.cos(y / 2)
    const c3 = Math.cos(z / 2)
    const s1 = Math.sin(x / 2)
    const s2 = Math.sin(y / 2)
    const s3 = Math.sin(z / 2)

    return new Quatf(
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 + s1 * s2 * c3,
      c1 * c2 * c3 - s1 * s2 * s3
    )
  }

  static fromMat4(m: Mat4x4f): Quatf {
    const trace = m.get(0, 0) + m.get(1, 1) + m.get(2, 2)

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0)
      return new Quatf(
        (m.get(1, 2) - m.get(2, 1)) * s,
        (m.get(2, 0) - m.get(0, 2)) * s,
        (m.get(0, 1) - m.get(1, 0)) * s,
        0.25 / s
      )
    } else if (m.get(0, 0) > m.get(1, 1) && m.get(0, 0) > m.get(2, 2)) {
      const s = 2.0 * Math.sqrt(1.0 + m.get(0, 0) - m.get(1, 1) - m.get(2, 2))
      return new Quatf(
        0.25 * s,
        (m.get(1, 0) + m.get(0, 1)) / s,
        (m.get(2, 0) + m.get(0, 2)) / s,
        (m.get(2, 1) - m.get(1, 2)) / s
      )
    } else if (m.get(1, 1) > m.get(2, 2)) {
      const s = 2.0 * Math.sqrt(1.0 + m.get(1, 1) - m.get(0, 0) - m.get(2, 2))
      return new Quatf(
        (m.get(1, 0) + m.get(0, 1)) / s,
        0.25 * s,
        (m.get(2, 1) + m.get(1, 2)) / s,
        (m.get(2, 0) - m.get(0, 2)) / s
      )
    } else {
      const s = 2.0 * Math.sqrt(1.0 + m.get(2, 2) - m.get(0, 0) - m.get(1, 1))
      return new Quatf(
        (m.get(2, 0) + m.get(0, 2)) / s,
        (m.get(2, 1) + m.get(1, 2)) / s,
        0.25 * s,
        (m.get(1, 0) - m.get(0, 1)) / s
      )
    }
  }

  static fromBetweenVectors(u: Vec3f, v: Vec3f): Quatf {
    const dot = u.dot(v)
    const cross = u.cross(v)

    if (dot < -0.999999) {
      const orthogonal = Math.abs(u.x) > Math.abs(u.z)
        ? new Vec3f(-u.y, u.x, 0)
        : new Vec3f(0, -u.z, u.y)
      const normalizedOrtho = orthogonal.normalize()
      return new Quatf(normalizedOrtho.x, normalizedOrtho.y, normalizedOrtho.z, 0)
    }

    const w = Math.sqrt((1 + dot) * 2)
    const s = 1 / w

    return new Quatf(
      cross.x * s,
      cross.y * s,
      cross.z * s,
      w * 0.5
    ).normalize()
  }

  static lookRotation(forward: Vec3f, up: Vec3f): Quatf {
    const f = forward.normalize()
    const r = up.cross(f).normalize()
    const u = f.cross(r)

    const trace = r.x + u.y + f.z

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0)
      return new Quatf(
        (u.z - f.y) * s,
        (f.x - r.z) * s,
        (r.y - u.x) * s,
        0.25 / s
      )
    } else if (r.x > u.y && r.x > f.z) {
      const s = 2.0 * Math.sqrt(1.0 + r.x - u.y - f.z)
      return new Quatf(
        0.25 * s,
        (u.x + r.y) / s,
        (f.x + r.z) / s,
        (u.z - f.y) / s
      )
    } else if (u.y > f.z) {
      const s = 2.0 * Math.sqrt(1.0 + u.y - r.x - f.z)
      return new Quatf(
        (u.x + r.y) / s,
        0.25 * s,
        (f.y + u.z) / s,
        (f.x - r.z) / s
      )
    } else {
      const s = 2.0 * Math.sqrt(1.0 + f.z - r.x - u.y)
      return new Quatf(
        (f.x + r.z) / s,
        (f.y + u.z) / s,
        0.25 * s,
        (r.y - u.x) / s
      )
    }
  }

  static fromArray(arr: number[] | Float32Array): Quatf {
    return new Quatf(arr[0], arr[1], arr[2], arr[3])
  }
}

export function quatf(x: number = 0, y: number = 0, z: number = 0, w: number = 1): Quatf {
  return new Quatf(x, y, z, w)
}

export function add(a: Quatf, b: Quatf): Quatf {
  return a.add(b)
}

export function subtract(a: Quatf, b: Quatf): Quatf {
  return a.subtract(b)
}

export function multiply(a: Quatf, b: Quatf): Quatf {
  return a.multiply(b)
}

export function dot(a: Quatf, b: Quatf): number {
  return a.dot(b)
}

export function length(v: Quatf): number {
  return v.length()
}

export function lengthSquared(v: Quatf): number {
  return v.lengthSquared()
}

export function normalize(v: Quatf): Quatf {
  return v.normalize()
}

export function conjugate(v: Quatf): Quatf {
  return v.conjugate()
}

export function inverse(v: Quatf): Quatf {
  return v.invert()
}

export function lerp(a: Quatf, b: Quatf, t: number): Quatf {
  return a.lerp(b, t)
}

export function slerp(a: Quatf, b: Quatf, t: number): Quatf {
  return a.slerp(b, t)
}
