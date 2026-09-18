/**
 * Counts the per-frame GPU command load of each Rasen backend, and the CPU
 * time the renderer spends recording it.
 *
 * Why: after the separated-attribute-stream change the WebGPU backend was still
 * slower than the WebGL one, and the pose solve is identical on both (-10.5
 * ms/frame is removeable). So the difference is entirely in the record/upload
 * work. This probe attributes it: it wraps the device so every writeBuffer,
 * setVertexBuffer, setBindGroup, setPipeline and drawIndexed is counted, and it
 * times the total spent inside those calls.
 *
 * Both pages are driven through the same bench protocol, so the command counts
 * are comparable: same scene, same instance count, same frame count.
 *
 * Usage: node probe-gpu-commands.mjs [instances]
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

const N = Number(process.argv[2] || 200)
const PORT = Number(process.env.PORT || 5190)
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const args = [
  '--headless=new',
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,Metal',
  '--enable-dawn-features=allow_unsafe_apis',
  '--use-angle=metal'
]
const opts = { args, defaultViewport: { width: 1100, height: 1100 } }
if (fs.existsSync(chrome)) opts.executablePath = chrome

/**
 * Installed before any page script runs. Wraps the WebGPU device (and the GL
 * context) so the same counters work for both backends:
 *   - WebGPU: queue.writeBuffer + render-pass commands.
 *   - WebGL2: drawElements/drawArrays/bufferSubData on the context.
 */
function installCounters() {
  const w = window
  w.__counts = {
    writeBuffer: 0,
    setVertexBuffer: 0,
    setIndexBuffer: 0,
    setBindGroup: 0,
    setPipeline: 0,
    draw: 0,
    bufferSubData: 0,
    buffersSubDataBytes: 0,
    vertexAttribPointer: 0,
    timeInRecord: 0,
    timeInUpload: 0,
    frames: 0
  }
  const c = w.__counts

  // ---- WebGPU ----
  const patchDevice = (device) => {
    if (device.__patched) return device
    device.__patched = true
    const q = device.queue
    const rawWrite = q.writeBuffer.bind(q)
    q.writeBuffer = (...a) => {
      const t = performance.now()
      c.writeBuffer++
      const r = rawWrite(...a)
      c.timeInUpload += performance.now() - t
      return r
    }
    const rawEnc = device.createCommandEncoder.bind(device)
    device.createCommandEncoder = (...a) => {
      const enc = rawEnc(...a)
      const rawPass = enc.beginRenderPass.bind(enc)
      enc.beginRenderPass = (...b) => {
        const pass = rawPass(...b)
        for (const m of ['setVertexBuffer', 'setIndexBuffer', 'setBindGroup', 'setPipeline', 'drawIndexed', 'draw']) {
          if (typeof pass[m] !== 'function') continue
          const raw = pass[m].bind(pass)
          pass[m] = (...d) => {
            c[m]++
            return raw(...d)
          }
        }
        return pass
      }
      return enc
    }
    return device
  }
  const navGpu = navigator.gpu
  if (navGpu) {
    const proto = Object.getPrototypeOf(navGpu).constructor.prototype
    const rawReqAdapter = proto.requestAdapter
    proto.requestAdapter = async function (...a) {
      const adapter = await rawReqAdapter.apply(this, a)
      const rawReqDevice = adapter.requestDevice.bind(adapter)
      adapter.requestDevice = async (...b) => patchDevice(await rawReqDevice(...b))
      return adapter
    }
  }

  // ---- WebGL2 ----
  const proto = WebGL2RenderingContext.prototype
  for (const m of ['drawElements', 'drawArrays', 'bufferSubData', 'vertexAttribPointer']) {
    const raw = proto[m]
    proto[m] = function (...a) {
      c[m]++
      if (m === 'bufferSubData') c.buffersSubDataBytes += a[2]?.byteLength ?? 0
      return raw.apply(this, a)
    }
  }
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/index.html`)
      if (r.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server not ready')
}

let server
try {
  await waitReady()
} catch {
  server = spawn('node', ['../scripts/start-server.mjs'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  })
  await waitReady()
}

const browser = await puppeteer.launch(opts)
const out = {}
try {
  for (const [name, file] of [
    ['Rasen webgl', 'rasen-webgl.html'],
    ['Rasen webgpu', 'rasen-webgpu.html']
  ]) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1024, height: 1024 })
    await page.evaluateOnNewDocument(installCounters)
    try {
      await page.goto(`http://localhost:${PORT}/${file}?bench=1`, {
        waitUntil: 'networkidle0',
        timeout: 60000
      })
      await page.waitForFunction(() => !!window.__bench, { timeout: 20000 })
      await page.evaluate(() => window.__bench.load())
      await page.evaluate((n) => window.__bench.createInstances(n), N)
      // Warm up so pipelines/programs are compiled before counting.
      await page.evaluate((n) => window.__bench.animate(1000, n), N)
      const before = await page.evaluate(() => ({ ...window.__counts }))
      const anim = await page.evaluate((n) => window.__bench.animate(3000, n), N)
      const after = await page.evaluate(() => ({ ...window.__counts }))
      const d = {}
      for (const k of Object.keys(after)) d[k] = after[k] - before[k]
      const frames = anim.frames || Math.round(3000 / anim.avgFrameMs)
      d.frames = frames
      const per = (k) => d[k] / frames
      out[name] = { ...d, per }
      console.log(
        `[${name}] frames=${frames} ` +
          `draw=${per('draw').toFixed(1)} writeBuffer=${per('writeBuffer').toFixed(1)} ` +
          `setVB=${per('setVertexBuffer').toFixed(1)} setBG=${per('setBindGroup').toFixed(1)} ` +
          `setPipe=${per('setPipeline').toFixed(1)} bufferSubData=${per('bufferSubData').toFixed(1)} ` +
          `setVAP=${per('vertexAttribPointer').toFixed(1)} ` +
          `| upload=${(d.timeInUpload / frames).toFixed(3)}ms/frame ` +
          `avgFrame=${anim.avgFrameMs.toFixed(2)}ms`
      )
    } catch (e) {
      console.log(`[${name}] FAILED: ${String(e).slice(0, 160)}`)
      out[name] = { error: String(e).slice(0, 300) }
    }
    await page.close()
  }
} finally {
  await browser.close()
  server?.kill()
}
fs.writeFileSync('reports/gpu-commands.json', JSON.stringify({ N, out }, null, 2))
console.log('saved reports/gpu-commands.json')
