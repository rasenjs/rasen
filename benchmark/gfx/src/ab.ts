/**
 * A/B micro-benchmark — validate each WebGL2 refactor technique BEFORE
 * touching the real BatchRenderer. Only techniques proven faster here get
 * adopted ("有效才采纳").
 *
 * Methodology:
 *   - Raw WebGL2 calls, degenerate triangles (zero fragments) → measures pure
 *     CPU/driver call overhead, which is exactly what VAO/UBO/batching target.
 *   - Each experiment runs OLD and NEW arms on the SAME workload, alternating
 *     reps to cancel thermal/frequency drift; median of reps decides.
 *   - Verdict: new < old × 0.95 → ADOPT · within ±5% → NEUTRAL · else REJECT.
 *
 * Experiments map to the refactor plan:
 *   E1 VAO attrib state      → batch-1 (VAO)
 *   E2 bufferSubData upload  → batch-1 (bufferSubData)
 *   E3 UBO frame uniforms    → batch-1 (UBO, requires #version 300 es)
 *   E4 multi-texture merge   → batch-2 (sampler array + per-vertex tex index)
 *   E5 combined old pipeline → combined new pipeline (aggregate)
 */

const GROUPS = 1200
const VERTS_PER_GROUP = 6
const REPS = 12
const WARMUP = 3

const canvas = document.getElementById('ab') as HTMLCanvasElement
const gl = canvas.getContext('webgl2') as WebGL2RenderingContext
if (!gl) throw new Error('WebGL2 unavailable — A/B validation requires it')

// ---------------------------------------------------------------------------
// GL helpers
// ---------------------------------------------------------------------------

function compile(type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader compile failed: ' + gl.getShaderInfoLog(s))
  }
  return s
}

function program(vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('program link failed: ' + gl.getProgramInfoLog(p))
  }
  return p
}

/** Degenerate quad data (all verts at origin → zero rasterization). */
function degenerate(nVerts: number): { pos: Float32Array; color: Float32Array; uv: Float32Array; tex: Float32Array } {
  return {
    pos: new Float32Array(nVerts * 3),
    color: new Float32Array(nVerts * 4),
    uv: new Float32Array(nVerts * 2),
    tex: new Float32Array(nVerts)
  }
}

const textures: WebGLTexture[] = []
for (let i = 0; i < 4; i++) {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  textures.push(t)
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const VS_ES1 = `
attribute vec3 a_pos; attribute vec4 a_color; attribute vec2 a_uv;
uniform mat4 u_view; uniform mat4 u_proj;
void main() { gl_Position = u_proj * u_view * vec4(a_pos, 1.0); }`
const FS_ES1 = `
precision mediump float;
void main() { gl_FragColor = vec4(1.0); }`

const VS_ES3_TEX = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 a_color;
layout(location=2) in vec2 a_uv;
layout(location=3) in float a_tex;
layout(std140) uniform Frame { mat4 u_view; mat4 u_proj; };
out vec4 v_color; out vec2 v_uv; flat out int v_texIdx;
void main() {
  gl_Position = u_proj * u_view * vec4(a_pos, 1.0);
  v_color = a_color; v_uv = a_uv; v_texIdx = int(a_tex);
}`
const FS_ES3_TEX = `#version 300 es
precision mediump float;
in vec4 v_color; in vec2 v_uv; flat in int v_texIdx;
uniform sampler2D u_tex[4];
out vec4 outColor;
void main() {
  // GLSL ES forbids dynamic sampler-array indexing (ANGLE rejects even
  // loop-index forms) — fully unrolled constant-index chain.
  vec4 c;
  if (v_texIdx == 0) { c = texture(u_tex[0], v_uv); }
  else if (v_texIdx == 1) { c = texture(u_tex[1], v_uv); }
  else if (v_texIdx == 2) { c = texture(u_tex[2], v_uv); }
  else { c = texture(u_tex[3], v_uv); }
  outColor = c * v_color;
}`

const VS_ES3_UBO = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(std140) uniform Frame { mat4 u_view; mat4 u_proj; };
void main() { gl_Position = u_proj * u_view * vec4(a_pos, 1.0); }`
const FS_ES3_PLAIN = `#version 300 es
precision mediump float;
out vec4 outColor;
void main() { outColor = vec4(1.0); }`

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Run one arm's per-frame loop `iters` times; returns ms. */
function time(arm: () => void, iters: number): number {
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) arm()
  const t1 = performance.now()
  return t1 - t0
}

interface ExpResult { name: string; mapsTo: string; oldMs: number; newMs: number; verdict: 'ADOPT' | 'NEUTRAL' | 'REJECT' }

function decide(name: string, mapsTo: string, oldMs: number, newMs: number): ExpResult {
  const verdict = newMs < oldMs * 0.95 ? 'ADOPT' : newMs > oldMs * 1.05 ? 'REJECT' : 'NEUTRAL'
  return { name, mapsTo, oldMs: +oldMs.toFixed(3), newMs: +newMs.toFixed(3), verdict }
}

/** Alternate old/new reps (drift control), return medians. */
function abTest(name: string, mapsTo: string, oldArm: () => void, newArm: () => void): ExpResult {
  for (let i = 0; i < WARMUP; i++) { oldArm(); newArm() }
  const olds: number[] = []
  const news: number[] = []
  for (let i = 0; i < REPS; i++) {
    olds.push(time(oldArm, 1))
    news.push(time(newArm, 1))
  }
  return decide(name, mapsTo, median(olds), median(news))
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

const results: ExpResult[] = []

// Shared dummy matrices (same content both arms).
const viewM = new Float32Array(16)
const projM = new Float32Array(16)
viewM[0] = projM[5] = viewM[15] = projM[15] = 1

// --- E1: VAO attrib state ---------------------------------------------------
{
  const prog = program(VS_ES1, FS_ES1)
  gl.useProgram(prog)
  const loc = {
    pos: gl.getAttribLocation(prog, 'a_pos'),
    color: gl.getAttribLocation(prog, 'a_color'),
    uv: gl.getAttribLocation(prog, 'a_uv'),
    view: gl.getUniformLocation(prog, 'u_view')!,
    proj: gl.getUniformLocation(prog, 'u_proj')!
  }
  const data = degenerate(VERTS_PER_GROUP)
  const bufs = [gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!]
  const datas = [data.pos, data.color, data.uv]
  const sizes = [3, 4, 2]
  const vao = gl.createVertexArray()!

  const oldArm = (): void => {
    gl.uniformMatrix4fv(loc.view, false, viewM)
    gl.uniformMatrix4fv(loc.proj, false, projM)
    for (let g = 0; g < GROUPS; g++) {
      for (let b = 0; b < 3; b++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs[b])
        gl.bufferData(gl.ARRAY_BUFFER, datas[b], gl.DYNAMIC_DRAW)
        gl.enableVertexAttribArray(loc.pos + b)
        gl.vertexAttribPointer(loc.pos + b, sizes[b], gl.FLOAT, false, 0, 0)
      }
      gl.drawArrays(gl.TRIANGLES, 0, VERTS_PER_GROUP)
    }
  }
  const newArm = (): void => {
    // Configure attrib pointers ONCE inside the VAO.
    gl.bindVertexArray(vao)
    for (let b = 0; b < 3; b++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[b])
      gl.bufferData(gl.ARRAY_BUFFER, datas[b], gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(loc.pos + b)
      gl.vertexAttribPointer(loc.pos + b, sizes[b], gl.FLOAT, false, 0, 0)
    }
    gl.bindVertexArray(null)
    gl.uniformMatrix4fv(loc.view, false, viewM)
    gl.uniformMatrix4fv(loc.proj, false, projM)
    for (let g = 0; g < GROUPS; g++) {
      gl.bindVertexArray(vao)
      for (let b = 0; b < 3; b++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs[b])
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, datas[b])
      }
      gl.drawArrays(gl.TRIANGLES, 0, VERTS_PER_GROUP)
    }
    gl.bindVertexArray(null)
  }
  results.push(abTest('E1 VAO attrib state', 'batch-1: VAO', oldArm, newArm))
}

// --- E2: bufferSubData vs bufferData (VAO in both arms) ----------------------
{
  const prog = program(VS_ES1, FS_ES1)
  gl.useProgram(prog)
  const loc = {
    pos: gl.getAttribLocation(prog, 'a_pos'),
    color: gl.getAttribLocation(prog, 'a_color'),
    uv: gl.getAttribLocation(prog, 'a_uv')
  }
  const data = degenerate(VERTS_PER_GROUP)
  const bufs = [gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!]
  const datas = [data.pos, data.color, data.uv]
  const sizes = [3, 4, 2]
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  for (let b = 0; b < 3; b++) {
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[b])
    gl.bufferData(gl.ARRAY_BUFFER, datas[b], gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(loc.pos + b)
    gl.vertexAttribPointer(loc.pos + b, sizes[b], gl.FLOAT, false, 0, 0)
  }
  gl.bindVertexArray(null)

  const oldArm = (): void => {
    for (let g = 0; g < GROUPS; g++) {
      for (let b = 0; b < 3; b++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs[b])
        gl.bufferData(gl.ARRAY_BUFFER, datas[b], gl.DYNAMIC_DRAW)
      }
      gl.drawArrays(gl.TRIANGLES, 0, VERTS_PER_GROUP)
    }
  }
  const newArm = (): void => {
    for (let g = 0; g < GROUPS; g++) {
      gl.bindVertexArray(vao)
      for (let b = 0; b < 3; b++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs[b])
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, datas[b])
      }
      gl.drawArrays(gl.TRIANGLES, 0, VERTS_PER_GROUP)
    }
  }
  results.push(abTest('E2 bufferSubData upload', 'batch-1: bufferSubData', oldArm, newArm))
}

// --- E3: UBO frame uniforms (requires ES 3.00) -------------------------------
{
  const progOld = program(VS_ES1, FS_ES1)
  const locOld = {
    pos: gl.getAttribLocation(progOld, 'a_pos'),
    view: gl.getUniformLocation(progOld, 'u_view')!,
    proj: gl.getUniformLocation(progOld, 'u_proj')!
  }
  const progNew = program(VS_ES3_UBO, FS_ES3_PLAIN)
  const blockIndex = gl.getUniformBlockIndex(progNew, 'Frame')
  const data = degenerate(VERTS_PER_GROUP)
  const buf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, data.pos, gl.DYNAMIC_DRAW)
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  // UBO holds view+proj (128 bytes) — set ONCE per frame in the new arm.
  const ubo = gl.createBuffer()!
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
  gl.bufferData(gl.UNIFORM_BUFFER, 128, gl.DYNAMIC_DRAW)
  const uboData = new Float32Array(32)
  uboData.set(viewM, 0)
  uboData.set(projM, 16)
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo)
  gl.uniformBlockBinding(progNew, blockIndex, 0)

  const oldArm = (): void => {
    gl.useProgram(progOld)
    for (let g = 0; g < GROUPS; g++) {
      gl.uniformMatrix4fv(locOld.view, false, viewM)
      gl.uniformMatrix4fv(locOld.proj, false, projM)
      gl.drawArrays(gl.TRIANGLES, 0, VERTS_PER_GROUP)
    }
  }
  const newArm = (): void => {
    gl.useProgram(progNew)
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, uboData) // once per frame
    gl.bindVertexArray(vao)
    for (let g = 0; g < GROUPS; g++) {
      gl.drawArrays(gl.TRIANGLES, 0, VERTS_PER_GROUP)
    }
  }
  results.push(abTest('E3 UBO frame uniforms', 'batch-1: UBO (+ES 3.00)', oldArm, newArm))
}

// --- E4: multi-texture merge (sampler array + per-vertex tex index) ----------
{
  const data = degenerate(VERTS_PER_GROUP)
  // OLD arm: one group per quad, texture switched every group (worst case =
  // current renderer with alternating textures), VAO + bufferSubData (post
  // batch-1 state).
  const progOld = program(VS_ES1, FS_ES1)
  const locOld = {
    pos: gl.getAttribLocation(progOld, 'a_pos'),
    color: gl.getAttribLocation(progOld, 'a_color'),
    uv: gl.getAttribLocation(progOld, 'a_uv'),
    view: gl.getUniformLocation(progOld, 'u_view')!,
    proj: gl.getUniformLocation(progOld, 'u_proj')!,
    tex: gl.getUniformLocation(progOld, 'u_tex')
  }
  // FS_ES1 has no sampler — add one via a tiny dedicated pair instead.
  const progOldTex = program(
    `attribute vec3 a_pos; uniform mat4 u_view; uniform mat4 u_proj;
     void main() { gl_Position = u_proj * u_view * vec4(a_pos, 1.0); }`,
    `precision mediump float; uniform sampler2D u_tex;
     void main() { gl_FragColor = texture2D(u_tex, vec2(0.5)); }`
  )
  void progOld; void locOld
  const locT = {
    pos: gl.getAttribLocation(progOldTex, 'a_pos'),
    view: gl.getUniformLocation(progOldTex, 'u_view')!,
    proj: gl.getUniformLocation(progOldTex, 'u_proj')!,
    tex: gl.getUniformLocation(progOldTex, 'u_tex')!
  }
  const bufOld = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, bufOld)
  gl.bufferData(gl.ARRAY_BUFFER, data.pos, gl.DYNAMIC_DRAW)
  const vaoOld = gl.createVertexArray()!
  gl.bindVertexArray(vaoOld)
  gl.enableVertexAttribArray(locT.pos)
  gl.vertexAttribPointer(locT.pos, 3, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  // NEW arm: 4 textures on units 0..3, ONE merged draw with per-vertex tex index.
  const progNew = program(VS_ES3_TEX, FS_ES3_TEX)
  const blockIndex = gl.getUniformBlockIndex(progNew, 'Frame')
  gl.uniformBlockBinding(progNew, blockIndex, 0)
  const merged = degenerate(GROUPS * VERTS_PER_GROUP)
  for (let g = 0; g < GROUPS; g++) {
    for (let v = 0; v < VERTS_PER_GROUP; v++) {
      merged.tex[g * VERTS_PER_GROUP + v] = g % 4
    }
  }
  const bufsNew = [gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!]
  const datasNew = [merged.pos, merged.color, merged.uv, merged.tex]
  const compsNew = [3, 4, 2, 1]
  const vaoNew = gl.createVertexArray()!
  gl.bindVertexArray(vaoNew)
  for (let b = 0; b < 4; b++) {
    gl.bindBuffer(gl.ARRAY_BUFFER, bufsNew[b])
    gl.bufferData(gl.ARRAY_BUFFER, datasNew[b], gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(b)
    gl.vertexAttribPointer(b, compsNew[b], gl.FLOAT, false, 0, 0)
  }
  gl.bindVertexArray(null)
  for (let u = 0; u < 4; u++) {
    gl.activeTexture(gl.TEXTURE0 + u)
    gl.bindTexture(gl.TEXTURE_2D, textures[u])
  }
  gl.useProgram(progNew)
  gl.uniform1iv(gl.getUniformLocation(progNew, 'u_tex')!, [0, 1, 2, 3])

  const oldArm = (): void => {
    gl.useProgram(progOldTex)
    gl.uniformMatrix4fv(locT.view, false, viewM)
    gl.uniformMatrix4fv(locT.proj, false, projM)
    gl.uniform1i(locT.tex, 0)
    for (let g = 0; g < GROUPS; g++) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, textures[g % 4])
      gl.bindVertexArray(vaoOld)
      gl.bindBuffer(gl.ARRAY_BUFFER, bufOld)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.pos)
      gl.drawArrays(gl.TRIANGLES, 0, VERTS_PER_GROUP)
    }
  }
  const newArm = (): void => {
    gl.useProgram(progNew)
    gl.bindVertexArray(vaoNew)
    gl.drawArrays(gl.TRIANGLES, 0, GROUPS * VERTS_PER_GROUP)
  }
  results.push(abTest('E4 multi-texture merge', 'batch-2: sampler array (+ES 3.00)', oldArm, newArm))
}

// --- E5: combined pipeline ----------------------------------------------------
{
  // OLD: current renderer worst case — per group: 3×bufferData + 3×(enable+
  // pointer) + 2×uniformMatrix4fv + 5×uniform1i + bindTexture + draw.
  const progOld = program(VS_ES1, FS_ES1)
  const loc = {
    pos: gl.getAttribLocation(progOld, 'a_pos'),
    color: gl.getAttribLocation(progOld, 'a_color'),
    uv: gl.getAttribLocation(progOld, 'a_uv'),
    view: gl.getUniformLocation(progOld, 'u_view')!,
    proj: gl.getUniformLocation(progOld, 'u_proj')!
  }
  const data = degenerate(VERTS_PER_GROUP)
  const bufs = [gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!]
  const datas = [data.pos, data.color, data.uv]
  const sizes = [3, 4, 2]
  const flags = [0, 1, 0, 1, 0]
  const flagLocs = [0, 1, 2, 3, 4].map(() => gl.getUniformLocation(progOld, 'u_view')!) // dummy locs

  const oldArm = (): void => {
    gl.useProgram(progOld)
    for (let g = 0; g < GROUPS; g++) {
      gl.uniformMatrix4fv(loc.view, false, viewM)
      gl.uniformMatrix4fv(loc.proj, false, projM)
      for (let b = 0; b < 3; b++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs[b])
        gl.bufferData(gl.ARRAY_BUFFER, datas[b], gl.DYNAMIC_DRAW)
        gl.enableVertexAttribArray(loc.pos + b)
        gl.vertexAttribPointer(loc.pos + b, sizes[b], gl.FLOAT, false, 0, 0)
      }
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, textures[g % 4])
      gl.drawArrays(gl.TRIANGLES, 0, VERTS_PER_GROUP)
    }
  }
  // NEW: VAO + bufferSubData + UBO + merged multi-texture draw.
  const progNew = program(VS_ES3_TEX, FS_ES3_TEX)
  const blockIndex = gl.getUniformBlockIndex(progNew, 'Frame')
  gl.uniformBlockBinding(progNew, blockIndex, 0)
  const merged = degenerate(GROUPS * VERTS_PER_GROUP)
  for (let g = 0; g < GROUPS; g++) {
    for (let v = 0; v < VERTS_PER_GROUP; v++) merged.tex[g * VERTS_PER_GROUP + v] = g % 4
  }
  const bufsNew = [gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!]
  const datasNew = [merged.pos, merged.color, merged.uv, merged.tex]
  const compsNew = [3, 4, 2, 1]
  const vaoNew = gl.createVertexArray()!
  gl.bindVertexArray(vaoNew)
  for (let b = 0; b < 4; b++) {
    gl.bindBuffer(gl.ARRAY_BUFFER, bufsNew[b])
    gl.bufferData(gl.ARRAY_BUFFER, datasNew[b], gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(b)
    gl.vertexAttribPointer(b, compsNew[b], gl.FLOAT, false, 0, 0)
  }
  gl.bindVertexArray(null)
  const ubo = gl.createBuffer()!
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
  gl.bufferData(gl.UNIFORM_BUFFER, 128, gl.DYNAMIC_DRAW)
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo)
  const uboData = new Float32Array(32)
  uboData.set(viewM, 0)
  uboData.set(projM, 16)

  const newArm = (): void => {
    gl.useProgram(progNew)
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, uboData)
    gl.bindVertexArray(vaoNew)
    for (let b = 0; b < 4; b++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufsNew[b])
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, datasNew[b])
    }
    gl.drawArrays(gl.TRIANGLES, 0, GROUPS * VERTS_PER_GROUP)
  }
  results.push(abTest('E5 combined pipeline', 'aggregate', oldArm, newArm))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

;(window as unknown as Record<string, unknown>).__ab = {
  run: async () => results,
  gl
}
;(window as unknown as Record<string, unknown>).__abReady = true
