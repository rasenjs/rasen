/**
 * 帧驱动与驱动器的**行为**测试。
 *
 * 之前的用例只断言同步标志（isAnimating / isPlaying），从不驱动任何一帧，
 * 于是三个 bug 一直活着：弹簧把每帧写死成 16ms（速度随刷新率变）、
 * frame 暂停跨帧后 play() 永远订阅不上、tween 延迟窗口内 stop() 取消不掉。
 *
 * 这里给每个动画注入一个手动帧源，逐帧推进时间后断言真实状态。
 * 帧源是**每个动画各自持有的**（构造选项），所以没有跨用例的全局状态，
 * 也不需要任何"重置"步骤。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { tween, spring, frame, type FrameSchedule } from './index'

/** 手动帧源：帧由测试显式喂，时间完全受控。 */
function manualSchedule() {
  let pending: ((now: number) => void) | null = null
  let clock = 0
  const schedule: FrameSchedule = (cb) => {
    pending = cb
    return () => {
      if (pending === cb) pending = null
    }
  }
  /** 推进一帧，dt = 距上一帧的毫秒数。 */
  const step = (ms: number) => {
    clock += ms
    const cb = pending
    pending = null
    cb?.(clock)
  }
  const steps = (n: number, ms: number) => {
    for (let i = 0; i < n; i++) step(ms)
  }
  /** 建立首帧基准（与 rAF 首帧一致：没有上一帧，dt = 0）。 */
  const prime = () => {
    const cb = pending
    pending = null
    cb?.(clock)
  }
  return {
    schedule,
    step,
    steps,
    prime,
    get pendingFrame() {
      return pending !== null
    }
  }
}

describe('animation 帧驱动', () => {
  beforeEach(() => {
    useReactiveRuntime()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('tween', () => {
    it('按 dt 推进，到时后停在目标值', () => {
      const src = manualSchedule()
      const x = tween(0, { schedule: src.schedule })
      x.to(100, { duration: 100 })

      src.prime()
      src.steps(5, 20) // 5 × 20ms = 100ms

      expect(x.value).toBe(100)
      expect(x.isAnimating).toBe(false)
      expect(src.pendingFrame).toBe(false) // 结束后不再排帧
    })

    it('中途推进量与 dt 成正比', () => {
      const src = manualSchedule()
      const x = tween(0, { schedule: src.schedule })
      x.to(100, { duration: 100 })

      src.prime()
      src.steps(2, 25) // 50 / 100 → linear → 50

      expect(x.value).toBeCloseTo(50)
      expect(x.isAnimating).toBe(true)
    })

    it('单帧 dt 有上限：跨大间隔不会把动画一次跳完', () => {
      const src = manualSchedule()
      const x = tween(0, { schedule: src.schedule })
      x.to(100, { duration: 1000 })

      src.prime()
      src.step(5000) // 5s 间隔 → 钳到 100ms

      expect(x.value).toBeCloseTo(10) // 100 / 1000
      expect(x.isAnimating).toBe(true)
    })

    it('delay 窗口内 stop() 后不会再启动（回归）', () => {
      vi.useFakeTimers()
      const src = manualSchedule()
      const x = tween(0, { schedule: src.schedule })
      x.to(100, { duration: 100, delay: 50 })
      x.stop()

      vi.advanceTimersByTime(200) // 让延迟定时器到点

      src.prime()
      src.steps(10, 20)

      expect(x.value).toBe(0) // 旧实现会开始动并冲到 100
      expect(x.isAnimating).toBe(false)
    })
  })

  describe('spring', () => {
    it('同样的模拟时长、不同的帧长，结果一致（帧率无关，回归）', () => {
      const fineSrc = manualSchedule()
      const coarseSrc = manualSchedule()
      const fine = spring(0, { schedule: fineSrc.schedule })
      const coarse = spring(0, { schedule: coarseSrc.schedule })
      fine.to(100)
      coarse.to(100)
      fineSrc.prime()
      coarseSrc.prime()

      // 两者都推进 120ms：一个 12×10ms，一个 6×20ms
      for (let i = 0; i < 6; i++) {
        fineSrc.step(10)
        fineSrc.step(10)
        coarseSrc.step(20)
      }

      expect(fine.value).toBeGreaterThan(0)
      // 允许浮点余量累积带来的微小差异（<2%）；旧实现是 2× 量级的偏差
      expect(Math.abs(coarse.value - fine.value) / fine.value).toBeLessThan(
        0.02
      )
    })

    it('最终收敛到目标值', () => {
      const src = manualSchedule()
      const y = spring(0, { schedule: src.schedule })
      y.to(100)
      src.prime()
      src.steps(240, 16) // ~3.8s，足够收敛

      expect(y.isSettled).toBe(true)
      expect(y.value).toBe(100)
      expect(y.velocity).toBe(0)
      expect(src.pendingFrame).toBe(false)
    })
  })

  describe('frame', () => {
    it('按帧率切帧，不循环时播完停在末帧', () => {
      const src = manualSchedule()
      const f = frame({
        frames: [0, 1, 2, 3],
        frameRate: 50,
        loop: false,
        schedule: src.schedule
      })
      f.play()

      src.prime()
      src.steps(1, 20) // frameTime = 20ms
      expect(f.value).toBe(1)

      src.steps(2, 20)
      expect(f.value).toBe(3)
      expect(f.isPlaying).toBe(true)

      src.steps(1, 20) // 越过末帧 → 停
      expect(f.value).toBe(3)
      expect(f.isPlaying).toBe(false)
    })

    it('pause 跨过多帧后 play 仍能恢复（回归）', () => {
      const src = manualSchedule()
      const f = frame({
        frames: [0, 1, 2, 3],
        frameRate: 50,
        loop: false,
        schedule: src.schedule
      })
      f.play()

      src.prime()
      src.steps(1, 20)
      const before = f.value
      expect(before).toBe(1)

      f.pause()
      src.steps(3, 20) // 暂停期间跨过多帧
      expect(f.value).toBe(before)
      expect(f.isAnimating).toBe(false)

      f.play()
      src.prime() // 恢复后重新建立基准：暂停期间的时间不该补进来
      src.steps(2, 20)
      expect(f.value).toBe(3) // 旧实现这里永远停在 before
    })

    it('stop 重置到首帧并退订', () => {
      const src = manualSchedule()
      const f = frame({
        frames: [0, 1, 2, 3],
        frameRate: 50,
        schedule: src.schedule
      })
      f.play()
      src.prime()
      src.steps(2, 20)
      expect(f.value).toBe(2)

      f.stop()
      expect(f.value).toBe(0)
      expect(f.isPlaying).toBe(false)
      expect(src.pendingFrame).toBe(false)
    })
  })
})
