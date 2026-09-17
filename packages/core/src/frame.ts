/**
 * 帧源（调度）—— 「何时推进一帧」的契约与默认实现。
 *
 * 刻意只有**一个类型 + 一个实现**。因为这是一个契约，不是一套调度框架：
 *
 * - 契约只回答"何时叫我一帧"。它**不表达"一帧内做什么、按什么顺序"** ——
 *   顺序属于拥有这一帧的人（宿主 / 应用）。库若替它决定，就得引入全局单例，
 *   还会让"两个画布各用不同帧源"变得无法表达。
 * - 默认实现优先用宿主的 rAF，**没有 rAF 就用 setTimeout 兜底** —— 因此它永远
 *   返回一个可用的帧源，调用方不需要、也不应该再写降级分支。这不是新概念：
 *   `dom/canvas.ts` 一直在注入同样的几行，渲染器与 animation 又各自 fallback
 *   了一份，共四处。
 *
 * ## 形状为什么带时间戳
 *
 * rAF 的真实签名本来就是 `(time: DOMHighResTimeStamp) => void`；渲染器那侧的
 * 选项声明把它藏了起来（`(cb: () => void) => () => void`）。这里声明成带时间戳的，
 * 于是**同一份帧源可以同时交给渲染器和动画** —— 宽签名可赋给窄签名、反之不行，
 * 所以渲染器那侧的选项类型不需要任何改动。
 *
 * 时间戳只用于表现层（动画推进、插值相位）。模拟时间必须由步号派生。
 */

export type Cancel = () => void

/**
 * 帧源：注册一次性回调，返回取消函数（幂等）。
 *
 * **一次性**是 rAF 的语义（"下次绘制前叫我一次"），所以消费者每跑完一帧都要
 * 自己再订阅一次，直到它主动退订。渲染器的 `scheduleDraw` / `continuousRender`
 * 与动画的 `runFrames` 都是这么做的。
 */
export type FrameSchedule = (cb: (now: number) => void) => Cancel

interface HostFrameApi {
  requestAnimationFrame?: (cb: (now: number) => void) => number
  cancelAnimationFrame?: (id: number) => void
}

/** 兜底帧间隔（ms）：约 60Hz。只在宿主没有 rAF 时用。 */
const FALLBACK_FRAME_MS = 16

function nowMs(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance
  return perf ? perf.now() : Date.now()
}

/**
 * 宿主帧源。有 `requestAnimationFrame` 就用它（与合成器对齐，页面不可见时会
 * 自动暂停）；没有就用 `setTimeout` 按 ~60Hz 兜底（Node / SSR / 某些嵌入宿主）。
 *
 * **保证返回可用帧源**：两者都是"每帧重新订阅"的一次性契约，取消也都真能停下，
 * 所以拿到的永远是可连续驱动的帧源，调用方不必判断环境。
 * 不 import 任何 DOM 类型，在 Node / SSR 下也能安全加载。
 */
export function rafSchedule(): FrameSchedule {
  const host = globalThis as unknown as HostFrameApi
  const raf = host.requestAnimationFrame
  if (typeof raf === 'function') {
    return (cb) => {
      const id = raf(cb)
      return () => host.cancelAnimationFrame?.(id)
    }
  }
  return (cb) => {
    const id = setTimeout(() => cb(nowMs()), FALLBACK_FRAME_MS)
    return () => clearTimeout(id)
  }
}
