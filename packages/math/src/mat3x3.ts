import { Vec2f } from './vec2'
import { Vec3f } from './vec3'

export class Mat3x3f {
  readonly source: Float32Array

  constructor(values?: number[] | Float32Array) {
    if (values) {
      this.source = new Float32Array(values)
    } else {
      this.source = new Float32Array([
        1, 0, 0,
        0, 1, 0,
        0, 0, 1
      ])
    }
  }

  get(row: number, col: number): number {
    return this.source[col * 3 + row]
  }

  set(row: number, col: number, value: number): Mat3x3f {
    const result = this.clone()
    result.source[col * 3 + row] = value
    return result
  }

  multiply(m: Mat3x3f): Mat3x3f {
    const a = this.source
    const b = m.source
    const result = new Float32Array(9)

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        result[j * 3 + i] =
          a[0 * 3 + i] * b[j * 3 + 0] +
          a[1 * 3 + i] * b[j * 3 + 1] +
          a[2 * 3 + i] * b[j * 3 + 2]
      }
    }

    return new Mat3x3f(result)
  }

  multiplyVec3(v: Vec3f): Vec3f {
    const m = this.source
    return new Vec3f(
      m[0] * v.x + m[3] * v.y + m[6] * v.z,
      m[1] * v.x + m[4] * v.y + m[7] * v.z,
      m[2] * v.x + m[5] * v.y + m[8] * v.z
    )
  }

  multiplyVec2(v: Vec2f): Vec2f {
    const m = this.source
    const x = m[0] * v.x + m[3] * v.y + m[6]
    const y = m[1] * v.x + m[4] * v.y + m[7]
    return new Vec2f(x, y)
  }

  transpose(): Mat3x3f {
    const m = this.source
    return new Mat3x3f([
      m[0], m[3], m[6],
      m[1], m[4], m[7],
      m[2], m[5], m[8]
    ])
  }

  determinant(): number {
    const m = this.source
    return (
      m[0] * (m[4] * m[8] - m[5] * m[7]) -
      m[3] * (m[1] * m[8] - m[2] * m[7]) +
      m[6] * (m[1] * m[5] - m[2] * m[4])
    )
  }

  invert(): Mat3x3f {
    const m = this.source
    const det = this.determinant()

    if (Math.abs(det) < 0.0001) {
      return new Mat3x3f()
    }

    const invDet = 1 / det

    return new Mat3x3f([
      (m[4] * m[8] - m[5] * m[7]) * invDet,
      (m[2] * m[7] - m[1] * m[8]) * invDet,
      (m[1] * m[5] - m[2] * m[4]) * invDet,
      (m[5] * m[6] - m[3] * m[8]) * invDet,
      (m[0] * m[8] - m[2] * m[6]) * invDet,
      (m[2] * m[3] - m[0] * m[5]) * invDet,
      (m[3] * m[7] - m[4] * m[6]) * invDet,
      (m[1] * m[6] - m[0] * m[7]) * invDet,
      (m[0] * m[4] - m[1] * m[3]) * invDet
    ])
  }

  clone(): Mat3x3f {
    return new Mat3x3f(this.source)
  }

  equals(m: Mat3x3f, epsilon: number = 0.0001): boolean {
    for (let i = 0; i < 9; i++) {
      if (Math.abs(this.source[i] - m.source[i]) >= epsilon) {
        return false
      }
    }
    return true
  }

  toString(): string {
    const m = this.source
    return `Mat3x3f(\n  ${m[0]}, ${m[3]}, ${m[6]},\n  ${m[1]}, ${m[4]}, ${m[7]},\n  ${m[2]}, ${m[5]}, ${m[8]}\n)`
  }

  static identity(): Mat3x3f {
    return new Mat3x3f()
  }

  static zero(): Mat3x3f {
    return new Mat3x3f([0, 0, 0, 0, 0, 0, 0, 0, 0])
  }

  static translate(x: number, y: number): Mat3x3f {
    return new Mat3x3f([
      1, 0, 0,
      0, 1, 0,
      x, y, 1
    ])
  }

  static scale(x: number, y: number): Mat3x3f {
    return new Mat3x3f([
      x, 0, 0,
      0, y, 0,
      0, 0, 1
    ])
  }

  static rotate(angle: number): Mat3x3f {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return new Mat3x3f([
      c, s, 0,
      -s, c, 0,
      0, 0, 1
    ])
  }

  static fromTranslation(x: number, y: number): Mat3x3f {
    return Mat3x3f.translate(x, y)
  }

  static fromScaling(x: number, y: number): Mat3x3f {
    return Mat3x3f.scale(x, y)
  }

  static fromRotation(angle: number): Mat3x3f {
    return Mat3x3f.rotate(angle)
  }

  static ortho(left: number, right: number, bottom: number, top: number): Mat3x3f {
    return new Mat3x3f([
      2 / (right - left), 0, 0,
      0, 2 / (top - bottom), 0,
      -(right + left) / (right - left), -(top + bottom) / (top - bottom), 1
    ])
  }

  static fromArray(arr: number[] | Float32Array): Mat3x3f {
    return new Mat3x3f(arr)
  }
}

export function mat3x3f(values?: number[] | Float32Array): Mat3x3f {
  return new Mat3x3f(values)
}

export function multiply(a: Mat3x3f, b: Mat3x3f): Mat3x3f {
  return a.multiply(b)
}

export function transpose(m: Mat3x3f): Mat3x3f {
  return m.transpose()
}

export function determinant(m: Mat3x3f): number {
  return m.determinant()
}

export function inverse(m: Mat3x3f): Mat3x3f {
  return m.invert()
}
