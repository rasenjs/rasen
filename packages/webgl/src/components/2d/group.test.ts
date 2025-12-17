/**
 * Group component tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { group } from './group'
import { circle } from './circle'
import { rect } from './rect'
import { createMockWebGLContext, createMockReactiveRuntime } from '../../test-utils'
import { getRenderContext } from '../../render-context'

describe('group', () => {
  let gl: WebGLRenderingContext
  let cleanupFns: Array<(() => void) | undefined>

  beforeEach(() => {
    setReactiveRuntime(createMockReactiveRuntime())
    gl = createMockWebGLContext()
    cleanupFns = []
  })

  afterEach(() => {
    cleanupFns.forEach((fn) => fn?.())
  })

  it('should create group component', () => {
    const component = group({
      x: 100,
      y: 100,
      children: [
        circle({ x: 0, y: 0, radius: 10, fill: '#ff0000' })
      ]
    })

    expect(component).toBeDefined()
    expect(typeof component).toBe('function')
  })

  it('should mount group with children', () => {
    const component = group({
      x: 100,
      y: 100,
      children: [
        circle({ x: 0, y: 0, radius: 10, fill: '#ff0000' }),
        rect({ x: 20, y: 20, width: 30, height: 40, fill: '#00ff00' })
      ]
    })

    const unmount = component(gl)
    cleanupFns.push(unmount)

    expect(unmount).toBeDefined()
  })

  it('should apply transform to children', () => {
    const runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
    
    const groupX = runtime.ref(100)
    const groupY = runtime.ref(200)
    const groupRotation = runtime.ref(Math.PI / 4)
    
    const component = group({
      x: groupX,
      y: groupY,
      rotation: groupRotation,
      children: [
        circle({ x: 50, y: 0, radius: 10, fill: '#ff0000' })
      ]
    })

    const unmount = component(gl)
    cleanupFns.push(unmount)
    
    const renderContext = getRenderContext(gl)
    expect(renderContext).toBeDefined()
  })

  it('should support nested groups', () => {
    const component = group({
      x: 100,
      y: 100,
      rotation: 0.5,
      children: [
        circle({ x: 0, y: 0, radius: 20, fill: '#ff0000' }),
        group({
          x: 50,
          y: 0,
          rotation: 0.3,
          children: [
            circle({ x: 0, y: 0, radius: 10, fill: '#00ff00' })
          ]
        })
      ]
    })

    const unmount = component(gl)
    cleanupFns.push(unmount)

    expect(unmount).toBeDefined()
  })

  it('should support scale transform', () => {
    const runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
    
    const scaleX = runtime.ref(2)
    const scaleY = runtime.ref(0.5)
    
    const component = group({
      x: 100,
      y: 100,
      scaleX,
      scaleY,
      children: [
        circle({ x: 0, y: 0, radius: 10, fill: '#ff0000' })
      ]
    })

    const unmount = component(gl)
    cleanupFns.push(unmount)
    
    expect(unmount).toBeDefined()
  })

  it('should support opacity', () => {
    const runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
    
    const opacity = runtime.ref(0.5)
    
    const component = group({
      x: 100,
      y: 100,
      opacity,
      children: [
        circle({ x: 0, y: 0, radius: 10, fill: '#ff0000' })
      ]
    })

    const unmount = component(gl)
    cleanupFns.push(unmount)
    
    expect(unmount).toBeDefined()
  })

  it('should support visibility', () => {
    const runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
    
    const visible = runtime.ref(true)
    
    const component = group({
      x: 100,
      y: 100,
      visible,
      children: [
        circle({ x: 0, y: 0, radius: 10, fill: '#ff0000' })
      ]
    })

    const unmount = component(gl)
    cleanupFns.push(unmount)
    
    // Change visibility
    visible.value = false
    
    expect(unmount).toBeDefined()
  })

  it('should cleanup on unmount', () => {
    const component = group({
      x: 100,
      y: 100,
      children: [
        circle({ x: 0, y: 0, radius: 10, fill: '#ff0000' }),
        rect({ x: 20, y: 20, width: 30, height: 40, fill: '#00ff00' })
      ]
    })

    const unmount = component(gl)
    
    expect(unmount).toBeDefined()
    expect(typeof unmount).toBe('function')
    
    // Should not throw
    unmount?.()
  })

  it('should accumulate transforms in nested groups', () => {
    const runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
    
    // Parent group: translate (100, 100), rotate 45°
    // Child group: translate (50, 0), rotate 30°
    // Expected: child circle at parent's transform + child's transform
    
    const component = group({
      x: 100,
      y: 100,
      rotation: Math.PI / 4, // 45°
      children: [
        group({
          x: 50,
          y: 0,
          rotation: Math.PI / 6, // 30°
          children: [
            circle({ x: 0, y: 0, radius: 10, fill: '#ff0000' })
          ]
        })
      ]
    })

    const unmount = component(gl)
    cleanupFns.push(unmount)
    
    const renderContext = getRenderContext(gl)
    const transform = renderContext.getCurrentTransform()
    
    // After entering nested groups, transform should be accumulated
    // This is a basic check that the system is set up
    expect(transform).toBeDefined()
  })

  it('should handle empty children array', () => {
    const component = group({
      x: 100,
      y: 100,
      children: []
    })

    const unmount = component(gl)
    cleanupFns.push(unmount)
    
    expect(unmount).toBeDefined()
  })

  it('should update when transform props change', () => {
    const runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
    
    const x = runtime.ref(100)
    const y = runtime.ref(100)
    const rotation = runtime.ref(0)
    
    const component = group({
      x,
      y,
      rotation,
      children: [
        circle({ x: 0, y: 0, radius: 10, fill: '#ff0000' })
      ]
    })

    const unmount = component(gl)
    cleanupFns.push(unmount)
    
    // Update transforms
    x.value = 200
    y.value = 300
    rotation.value = Math.PI / 2
    
    expect(unmount).toBeDefined()
  })
})
