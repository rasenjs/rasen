import { Vec3f } from './vec3'
import { Vec4f } from './vec4'

export class Mat4x4f {
  readonly source: Float32Array

  constructor(values?: number[] | Float32Array) {
    if (values) {
      this.source = new Float32Array(values)
    } else {
      this.source = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ])
    }
  }

  get(row: number, col: number): number {
    return this.source[col * 4 + row]
  }

  set(row: number, col: number, value: number): Mat4x4f {
    const result = this.clone()
    result.source[col * 4 + row] = value
    return result
  }

  multiply(m: Mat4x4f): Mat4x4f {
    const a = this.source
    const b = m.source
    const result = new Float32Array(16)

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[j * 4 + i] =
          a[0 * 4 + i] * b[j * 4 + 0] +
          a[1 * 4 + i] * b[j * 4 + 1] +
          a[2 * 4 + i] * b[j * 4 + 2] +
          a[3 * 4 + i] * b[j * 4 + 3]
      }
    }

    return new Mat4x4f(result)
  }

  multiplyVec4(v: Vec4f): Vec4f {
    const m = this.source
    return new Vec4f(
      m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12] * v.w,
      m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13] * v.w,
      m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14] * v.w,
      m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15] * v.w
    )
  }

  multiplyVec3(v: Vec3f, w: number = 1): Vec3f {
    const m = this.source
    const result = new Vec4f(
      m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12] * w,
      m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13] * w,
      m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14] * w,
      m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15] * w
    )
    return result.toVec3()
  }

  transformPoint(v: Vec3f): Vec3f {
    return this.multiplyVec3(v, 1)
  }

  transformDirection(v: Vec3f): Vec3f {
    return this.multiplyVec3(v, 0)
  }

  transpose(): Mat4x4f {
    const m = this.source
    return new Mat4x4f([
      m[0], m[4], m[8], m[12],
      m[1], m[5], m[9], m[13],
      m[2], m[6], m[10], m[14],
      m[3], m[7], m[11], m[15]
    ])
  }

  determinant(): number {
    const m = this.source

    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3]
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7]
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11]
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15]

    const b00 = a00 * a11 - a01 * a10
    const b01 = a00 * a12 - a02 * a10
    const b02 = a00 * a13 - a03 * a10
    const b03 = a01 * a12 - a02 * a11
    const b04 = a01 * a13 - a03 * a11
    const b05 = a02 * a13 - a03 * a12
    const b06 = a20 * a31 - a21 * a30
    const b07 = a20 * a32 - a22 * a30
    const b08 = a20 * a33 - a23 * a30
    const b09 = a21 * a32 - a22 * a31
    const b10 = a21 * a33 - a23 * a31
    const b11 = a22 * a33 - a23 * a32

    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  }

  invert(): Mat4x4f {
    const m = this.source

    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3]
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7]
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11]
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15]

    const b00 = a00 * a11 - a01 * a10
    const b01 = a00 * a12 - a02 * a10
    const b02 = a00 * a13 - a03 * a10
    const b03 = a01 * a12 - a02 * a11
    const b04 = a01 * a13 - a03 * a11
    const b05 = a02 * a13 - a03 * a12
    const b06 = a20 * a31 - a21 * a30
    const b07 = a20 * a32 - a22 * a30
    const b08 = a20 * a33 - a23 * a30
    const b09 = a21 * a32 - a22 * a31
    const b10 = a21 * a33 - a23 * a31
    const b11 = a22 * a33 - a23 * a32

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06

    if (Math.abs(det) < 0.0001) {
      return new Mat4x4f()
    }

    det = 1.0 / det

    return new Mat4x4f([
      (a11 * b11 - a12 * b10 + a13 * b09) * det,
      (a02 * b10 - a01 * b11 - a03 * b09) * det,
      (a31 * b05 - a32 * b04 + a33 * b03) * det,
      (a22 * b04 - a21 * b05 - a23 * b03) * det,
      (a12 * b08 - a10 * b11 - a13 * b07) * det,
      (a00 * b11 - a02 * b08 + a03 * b07) * det,
      (a32 * b02 - a30 * b05 - a33 * b01) * det,
      (a20 * b05 - a22 * b02 + a23 * b01) * det,
      (a10 * b10 - a11 * b08 + a13 * b06) * det,
      (a01 * b08 - a00 * b10 - a03 * b06) * det,
      (a30 * b04 - a31 * b02 + a33 * b00) * det,
      (a21 * b02 - a20 * b04 - a23 * b00) * det,
      (a11 * b07 - a10 * b09 - a12 * b06) * det,
      (a00 * b09 - a01 * b07 + a02 * b06) * det,
      (a31 * b01 - a30 * b03 - a32 * b00) * det,
      (a20 * b03 - a21 * b01 + a22 * b00) * det
    ])
  }

  clone(): Mat4x4f {
    return new Mat4x4f(this.source)
  }

  equals(m: Mat4x4f, epsilon: number = 0.0001): boolean {
    for (let i = 0; i < 16; i++) {
      if (Math.abs(this.source[i] - m.source[i]) >= epsilon) {
        return false
      }
    }
    return true
  }

  toString(): string {
    const m = this.source
    return `Mat4x4f(\n  ${m[0]}, ${m[4]}, ${m[8]}, ${m[12]},\n  ${m[1]}, ${m[5]}, ${m[9]}, ${m[13]},\n  ${m[2]}, ${m[6]}, ${m[10]}, ${m[14]},\n  ${m[3]}, ${m[7]}, ${m[11]}, ${m[15]}\n)`
  }

  static identity(): Mat4x4f {
    return new Mat4x4f()
  }

  static zero(): Mat4x4f {
    return new Mat4x4f(new Float32Array(16))
  }

  static translate(x: number, y: number, z: number): Mat4x4f {
    return new Mat4x4f([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      x, y, z, 1
    ])
  }

  static scale(x: number, y: number, z: number): Mat4x4f {
    return new Mat4x4f([
      x, 0, 0, 0,
      0, y, 0, 0,
      0, 0, z, 0,
      0, 0, 0, 1
    ])
  }

  static rotateX(angle: number): Mat4x4f {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return new Mat4x4f([
      1, 0, 0, 0,
      0, c, s, 0,
      0, -s, c, 0,
      0, 0, 0, 1
    ])
  }

  static rotateY(angle: number): Mat4x4f {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return new Mat4x4f([
      c, 0, -s, 0,
      0, 1, 0, 0,
      s, 0, c, 0,
      0, 0, 0, 1
    ])
  }

  static rotateZ(angle: number): Mat4x4f {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return new Mat4x4f([
      c, s, 0, 0,
      -s, c, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ])
  }

  static rotateAxis(axis: Vec3f, angle: number): Mat4x4f {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const t = 1 - c
    const x = axis.x
    const y = axis.y
    const z = axis.z

    return new Mat4x4f([
      t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
      t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
      t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
      0, 0, 0, 1
    ])
  }

  static perspective(fov: number, aspect: number, near: number, far: number): Mat4x4f {
    const f = 1.0 / Math.tan(fov / 2)
    const nf = 1 / (near - far)

    return new Mat4x4f([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ])
  }

  static perspectiveOffCenter(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number
  ): Mat4x4f {
    return new Mat4x4f([
      (2 * near) / (right - left), 0, 0, 0,
      0, (2 * near) / (top - bottom), 0, 0,
      (right + left) / (right - left), (top + bottom) / (top - bottom), -(far + near) / (far - near), -1,
      0, 0, -(2 * far * near) / (far - near), 0
    ])
  }

  static ortho(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number
  ): Mat4x4f {
    return new Mat4x4f([
      2 / (right - left), 0, 0, 0,
      0, 2 / (top - bottom), 0, 0,
      0, 0, -2 / (far - near), 0,
      -(right + left) / (right - left), -(top + bottom) / (top - bottom), -(far + near) / (far - near), 1
    ])
  }

  static lookAt(eye: Vec3f, target: Vec3f, up: Vec3f): Mat4x4f {
    const zAxis = eye.subtract(target).normalize()
    const xAxis = up.cross(zAxis).normalize()
    const yAxis = zAxis.cross(xAxis)

    return new Mat4x4f([
      xAxis.x, yAxis.x, zAxis.x, 0,
      xAxis.y, yAxis.y, zAxis.y, 0,
      xAxis.z, yAxis.z, zAxis.z, 0,
      -xAxis.dot(eye), -yAxis.dot(eye), -zAxis.dot(eye), 1
    ])
  }

  static fromTranslation(x: number, y: number, z: number): Mat4x4f {
    return Mat4x4f.translate(x, y, z)
  }

  static fromScaling(x: number, y: number, z: number): Mat4x4f {
    return Mat4x4f.scale(x, y, z)
  }

  static fromXRotation(angle: number): Mat4x4f {
    return Mat4x4f.rotateX(angle)
  }

  static fromYRotation(angle: number): Mat4x4f {
    return Mat4x4f.rotateY(angle)
  }

  static fromZRotation(angle: number): Mat4x4f {
    return Mat4x4f.rotateZ(angle)
  }

  static fromAxisRotation(axis: Vec3f, angle: number): Mat4x4f {
    return Mat4x4f.rotateAxis(axis, angle)
  }

  static fromArray(arr: number[] | Float32Array): Mat4x4f {
    return new Mat4x4f(arr)
  }
}

export function mat4x4f(values?: number[] | Float32Array): Mat4x4f {
  return new Mat4x4f(values)
}

export function multiply(a: Mat4x4f, b: Mat4x4f): Mat4x4f {
  return a.multiply(b)
}

export function transpose(m: Mat4x4f): Mat4x4f {
  return m.transpose()
}

export function determinant(m: Mat4x4f): number {
  return m.determinant()
}

export function inverse(m: Mat4x4f): Mat4x4f {
  return m.invert()
}
