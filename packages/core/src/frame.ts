/**
 * 帧源（调度）—— 「何时推进一帧」的契约与默认实现。
 *
 * 刻意只有**一个类型 + 一个默认实现**（加一个只在非浏览器环境用的降级）。
 * 因为这是一个契约，不是一套调度框架：
 *
 * - 契约只回答"何时叫我一帧"。它**不表达"一帧内做什么、按什么顺序"** ——
 *   顺序属于拥有这一帧的人（宿主 / 应用）。库若替它决定，就得引入全局单例，
 *   还会让"两个画布各用不同帧源"变得无法表达。
 * - 默认实现只是把宿主的 rAF 包一层。这不是新概念：`dom/canvas.ts` 一直在
 *   注入同样的几行，渲染器与 animation 又各自 fallback 了一份，共四处。
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

/**
 * 宿主 rAF 帧源。环境没有 rAF 时返回 `null`（不 import 任何 DOM 类型，
 * 在 Node / SSR 下也能安全加载）。降级与否由调用方决定。
 */
export function rafSchedule(): FrameSchedule | null {
  const host = globalThis as unknown as HostFrameApi
  const raf = host.requestAnimationFrame
  if (typeof raf !== 'function') return null
  return (cb) => {
    const id = raf(cb)
    return () => host.cancelAnimationFrame?.(id)
  }
}

function nowMs(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance
  return perf ? perf.now() : Date.now()
}

/**
 * 微任务帧源 —— **只够"排一次刷新"**（测试 / SSR 里把一次重绘挪到当前任务之后）。
 *
 * ⚠️ 不能当**连续**帧源用：在微任务里再排微任务是自我续期的链条，事件循环会在
 * 归还之前被反复塞满、永不推进（页面卡死 / 进程挂住），而且它的 cancel 是空操作。
 * 连续渲染（`continuousRender`）必须先用 `rafSchedule()` 判断有没有真帧源。
 */
export function microtaskSchedule(): FrameSchedule {
  return (cb) => {
    queueMicrotask(() => cb(nowMs()))
    return () => {}
  }
}
