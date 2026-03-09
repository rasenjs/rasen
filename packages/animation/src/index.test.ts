/**
 * @rasenjs/animation 模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { getReactiveRuntime } from '@rasenjs/core'
import { tween, spring, frame, all, getEasing, linear, easeOutBounce } from '../src/index'

describe('animation', () => {
  beforeEach(() => {
    useReactiveRuntime()
  })

  describe('tween', () => {
    it('应该创建带有初始值的 tween', () => {
      const x = tween(0)
      expect(x.value).toBe(0)
      expect(x.isAnimating).toBe(false)
    })

    it('set 应该立即设置值', () => {
      const x = tween(0)
      x.set(100)
      expect(x.value).toBe(100)
      expect(x.isAnimating).toBe(false)
    })

    it('stop 应该停止动画', () => {
      const x = tween(0)
      x.to(100, { duration: 1000 })
      
      expect(x.isAnimating).toBe(true)
      x.stop()
      expect(x.isAnimating).toBe(false)
    })

    it('to 应该开始动画', () => {
      const x = tween(0)
      x.to(100, { duration: 100 })
      expect(x.isAnimating).toBe(true)
      x.stop()
    })

    it('中途改变目标应该重新开始动画', () => {
      const x = tween(0)
      x.to(100, { duration: 100 })
      expect(x.isAnimating).toBe(true)
      
      x.to(200, { duration: 100 })
      expect(x.isAnimating).toBe(true)
      
      x.stop()
    })

    it('应该支持自定义缓动函数', () => {
      const customEasing = (t: number) => t
      const x = tween(0)
      x.to(100, { duration: 100, easing: customEasing })
      expect(x.isAnimating).toBe(true)
      x.stop()
    })

    it('应该支持缓动名称', () => {
      const x = tween(0)
      x.to(100, { duration: 100, easing: 'easeOutBounce' })
      expect(x.isAnimating).toBe(true)
      x.stop()
    })

    it('应该支持 delay 选项', () => {
      const x = tween(0)
      x.to(100, { duration: 100, delay: 50 })
      expect(x.isAnimating).toBe(true)
      x.stop()
    })
  })

  describe('spring', () => {
    it('应该创建带有初始值的 spring', () => {
      const x = spring(0)
      expect(x.value).toBe(0)
      expect(x.velocity).toBe(0)
      expect(x.isAnimating).toBe(false)
      expect(x.isSettled).toBe(true)
    })

    it('应该支持自定义参数', () => {
      const x = spring(0, { stiffness: 200, damping: 20, mass: 2 })
      expect(x.value).toBe(0)
    })

    it('set 应该立即设置值并重置速度', () => {
      const x = spring(0)
      x.set(100)
      expect(x.value).toBe(100)
      expect(x.velocity).toBe(0)
      expect(x.isSettled).toBe(true)
    })

    it('setWithVelocity 应该设置值和速度', () => {
      const x = spring(0)
      x.setWithVelocity(100, 50)
      expect(x.value).toBe(100)
      expect(x.velocity).toBe(50)
    })

    it('stop 应该停止动画', () => {
      const x = spring(0)
      x.to(100)
      
      expect(x.isAnimating).toBe(true)
      x.stop()
      expect(x.isAnimating).toBe(false)
    })

    it('to 应该开始动画', () => {
      const x = spring(0)
      x.to(100)
      
      expect(x.isAnimating).toBe(true)
      expect(x.isSettled).toBe(false)
      
      x.stop()
    })

    it('可以动态修改弹簧参数', () => {
      const x = spring(0)
      x.to(100, { stiffness: 1000, damping: 50 })
      
      expect(x.isAnimating).toBe(true)
      
      x.stop()
    })

    it('中途改变目标应该自然过渡', () => {
      const x = spring(0)
      x.to(100)
      expect(x.isAnimating).toBe(true)
      
      x.to(200)
      expect(x.isAnimating).toBe(true)
      
      x.stop()
    })
  })

  describe('frame', () => {
    it('应该创建带有初始帧的 frame', () => {
      const f = frame({ frames: [0, 1, 2, 3] })
      expect(f.value).toBe(0)
      expect(f.isPlaying).toBe(false)
      expect(f.isPaused).toBe(false)
      expect(f.isAnimating).toBe(false)
    })

    it('play 应该开始播放', () => {
      const f = frame({ frames: [0, 1, 2, 3], frameRate: 60 })
      f.play()
      
      expect(f.isPlaying).toBe(true)
      expect(f.isPaused).toBe(false)
      expect(f.isAnimating).toBe(true)
      
      f.stop()
    })

    it('pause 应该暂停播放', () => {
      const f = frame({ frames: [0, 1, 2, 3] })
      f.play()
      expect(f.isPlaying).toBe(true)
      
      f.pause()
      expect(f.isPlaying).toBe(true)
      expect(f.isPaused).toBe(true)
      expect(f.isAnimating).toBe(false)
      
      f.stop()
    })

    it('stop 应该停止并重置到第一帧', () => {
      const f = frame({ frames: [0, 1, 2, 3] })
      f.play()
      
      f.stop()
      expect(f.isPlaying).toBe(false)
      expect(f.isPaused).toBe(false)
      expect(f.value).toBe(0)
    })

    it('应该支持自定义帧率', () => {
      const f = frame({ frames: [0, 1, 2, 3], frameRate: 12 })
      f.play()
      expect(f.isPlaying).toBe(true)
      f.stop()
    })

    it('应该支持非循环模式', () => {
      const f = frame({ frames: [0, 1, 2, 3], loop: false })
      f.play()
      expect(f.isPlaying).toBe(true)
      f.stop()
    })

    it('speed 应该控制播放速度', () => {
      const f = frame({ frames: [0, 1, 2, 3] })
      expect(f.speed).toBe(1)
      
      f.speed = 2
      expect(f.speed).toBe(2)
      
      f.stop()
    })

    it('setFrames 应该更新帧序列', () => {
      const f = frame({ frames: [0, 1, 2, 3] })
      expect(f.value).toBe(0)
      
      f.setFrames([4, 5, 6])
      expect(f.value).toBe(4)
      
      f.stop()
    })

    it('setFrames 应该支持更新选项', () => {
      const f = frame({ frames: [0, 1, 2, 3], frameRate: 60 })
      
      f.setFrames([4, 5, 6], { frameRate: 12, loop: false })
      expect(f.value).toBe(4)
      
      f.stop()
    })
  })

  describe('all', () => {
    it('应该同时执行多个动画', () => {
      const x = tween(0)
      const y = spring(0)
      
      all([
        [x, 100, { duration: 100 }],
        [y, 200]
      ])
      
      expect(x.isAnimating).toBe(true)
      expect(y.isAnimating).toBe(true)
      
      x.stop()
      y.stop()
    })
  })

  describe('easing', () => {
    it('getEasing 应该返回对应的缓动函数', () => {
      expect(getEasing('linear')).toBe(linear)
      expect(getEasing('easeOutBounce')).toBe(easeOutBounce)
    })

    it('getEasing 应该接受函数', () => {
      const customEasing = (t: number) => t * 2
      expect(getEasing(customEasing)).toBe(customEasing)
    })

    it('getEasing 应该对未知名称返回 linear', () => {
      expect(getEasing('unknown' as any)).toBe(linear)
    })

    it('所有缓动函数应该在 0 和 1 之间', () => {
      const easings = [
        linear,
        getEasing('easeInQuad'),
        getEasing('easeOutQuad'),
        getEasing('easeInOutCubic'),
        getEasing('easeOutBounce'),
        getEasing('easeOutElastic')
      ]
      
      easings.forEach(easing => {
        expect(easing(0)).toBeCloseTo(0, 5)
        expect(easing(1)).toBeCloseTo(1, 5)
        expect(easing(0.5)).toBeGreaterThanOrEqual(0)
        expect(easing(0.5)).toBeLessThanOrEqual(2)
      })
    })
  })

  describe('响应式', () => {
    it('tween 值变化应该触发响应式更新', () => {
      const x = tween(0)
      let callCount = 0
      
      const runtime = getReactiveRuntime()
      runtime.watch(() => x.value, () => {
        callCount++
      })
      
      x.set(100)
      expect(callCount).toBeGreaterThan(0)
    })

    it('spring 值变化应该触发响应式更新', () => {
      const x = spring(0)
      let callCount = 0
      
      const runtime = getReactiveRuntime()
      runtime.watch(() => x.value, () => {
        callCount++
      })
      
      x.set(100)
      expect(callCount).toBeGreaterThan(0)
    })

    it('frame 值变化应该触发响应式更新', () => {
      const f = frame({ frames: [0, 1, 2, 3] })
      let callCount = 0
      
      const runtime = getReactiveRuntime()
      runtime.watch(() => f.value, () => {
        callCount++
      })
      
      f.setFrames([4, 5, 6])
      expect(callCount).toBeGreaterThan(0)
    })
  })
})
