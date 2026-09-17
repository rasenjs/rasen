/**
 * 帧步进 —— 驱动一个动画循环，并保证「时间」只出现在每个动画自己的闭包里。
 *
 * 帧源契约本身在 `@rasenjs/core`（`FrameSchedule` / `rafSchedule`）：那是一份
 * 宿主的 rAF 包装，渲染器和动画共用同一个形状，宿主可以把同一份帧源交给两者。
 * 本文件只做两件事：
 *
 * 1. 每帧求 `dt` —— "上一帧时间" 关在 `runFrames` 的闭包里，动画只关心"推进多少"，
 *    不关心时间从哪来、上一帧是什么时候；
 * 2. 续期 —— 帧源是**一次性**契约，每跑完一帧自己再订阅一次。何时停只有一个答案：
 *    **调用方自己退订**（驱动器在跑完 / 暂停 / 被 stop 时本来就要退订，否则它自己的
 *    帧回调也会漏），所以不需要额外的"是否继续"判据，也不需要 advance 返回协议。
 *
 * ⚠️ 没有模块级共享循环：那需要模块级活跃集与单例注入点，换来的只是"少几次
 * rAF 注册"这个未被测量支撑的收益 —— 不值，而且会让"两个画布各用不同帧源"
 * 无法表达。真要共用，把同一个 `FrameSchedule` 传给多个动画即可，控制权在宿主手里。
 */

import { rafSchedule, type FrameSchedule } from '@rasenjs/core'

// 帧源类型与默认实现由 core 提供；这里原样转出，保持本包既有导入路径可用。
export { rafSchedule }
export type { FrameSchedule }

/** 单帧推进上限（ms）：切标签页、断点调试之后的一次大间隔不该把动画一次跳完。 */
const MAX_DT = 100

/**
 * 用帧源持续驱动一个循环，返回退订函数（幂等）。
 *
 * 两件事都关在**每个动画自己的**闭包里：
 * 1. `last` —— 每帧先求出 dt 再交给 advance，所以动画只关心"推进多少"；
 * 2. `cancel` —— 帧源是**一次性**契约（"下次绘制前叫我一次"，rAF 就是如此，
 *    渲染器也自己续期），所以每跑完一帧要自己再订阅一次。
 *
 * 何时停就只有一个答案：**调用方自己退订**。驱动器在跑完 / 暂停 / 被 stop 时
 * 本来就要退订（否则它自己的 rAF 也会漏），所以这里不需要额外的"是否继续"
 * 判据，也不需要给 advance 加返回值协议 —— 少一个参数，少一处要维护的同步。
 *
 * 没有模块级单例：多个动画互不影响，测试也不需要任何全局重置。
 */
export function runFrames(
  schedule: FrameSchedule,
  advance: (dt: number) => void
): () => void {
  let last: number | null = null
  let cancel: (() => void) | null = null
  let stopped = false

  const frame = (now: number) => {
    cancel = null
    // `null` 而不是 0 当哨兵：0 是合法时间戳（测试里的手动帧源就从 0 起）。
    const dt = last === null || now < last ? 0 : Math.min(now - last, MAX_DT)
    last = now
    advance(dt)

    // advance 里可能已经退订（跑完 / 暂停 / stop）—— 那就不要续期。
    if (!stopped) cancel = schedule(frame)
  }

  cancel = schedule(frame)
  return () => {
    stopped = true
    cancel?.()
    cancel = null
  }
}

let warnedNoSchedule = false

/**
 * 没有任何可用帧源时提示一次。
 *
 * 这是本包**唯一**一处模块状态，只为避免每个动画各刷一条同样的警告。
 * 不静默失败，也不退化成微任务（微任务里再排微任务是自我续期的链条，
 * 会让事件循环永不归还）。
 */
export function warnNoSchedule(): void {
  if (warnedNoSchedule) return
  warnedNoSchedule = true
  console.warn(
    '[Rasen Animation] 没有可用帧源（宿主无 requestAnimationFrame，也未在 options 里给 schedule）：' +
      '动画不会推进。测试或非浏览器环境请显式传入帧源。'
  )
}
