import { setReactiveRuntime, getReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, h1, h2, p, button, canvas, mount } from '@rasenjs/dom'
import { group, circle, rect } from '@rasenjs/webgl'

setReactiveRuntime(createReactiveRuntime())

// Example 1: Simple rotating group (animation disabled for debugging)
function simpleGroup() {
  const runtime = getReactiveRuntime()
  const groupRotation = runtime.ref(Math.PI / 6) // Static 30 degrees
  
  // Animation disabled for debugging
  // const animate = () => {
  //   groupRotation.value += 0.01
  //   requestAnimationFrame(animate)
  // }
  // animate()
  
  return div({
    children: [
      h2({ children: ['Simple Group (static)'] }),
      canvas({
        width: 400,
        height: 300,
        contextType: 'webgl',
        children: [
          group({
            x: 200,
            y: 150,
            rotation: groupRotation,
            children: [
              circle({ x: 0, y: 0, radius: 30, fill: '#ff6b6b' }),
              circle({ x: 50, y: 0, radius: 20, fill: '#4ecdc4' }),
              circle({ x: -50, y: 0, radius: 20, fill: '#ffe66d' })
            ]
          })
        ]
      })
    ]
  })
}

// Example 2: Tank with turret (simplified - just circles for now)
function tankExample() {
  const runtime = getReactiveRuntime()
  const tankX = runtime.ref(200)
  const tankY = runtime.ref(150)
  const tankAngle = runtime.ref(0)
  const turretAngle = runtime.ref(0)
  
  const handleKeyDown = (e: KeyboardEvent) => {
    const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D'].includes(e.key)
    if (handled) {
      e.preventDefault()
    }
    
    switch(e.key) {
      case 'ArrowLeft':
        tankAngle.value -= 0.1
        break
      case 'ArrowRight':
        tankAngle.value += 0.1
        break
      case 'ArrowUp':
        tankX.value += Math.cos(tankAngle.value) * 5
        tankY.value += Math.sin(tankAngle.value) * 5
        break
      case 'ArrowDown':
        tankX.value -= Math.cos(tankAngle.value) * 5
        tankY.value -= Math.sin(tankAngle.value) * 5
        break
      case 'a':
      case 'A':
        turretAngle.value -= 0.1
        break
      case 'd':
      case 'D':
        turretAngle.value += 0.1
        break
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  
  return div({
    children: [
      h2({ children: ['Tank (Interactive)'] }),
      canvas({
        width: 400,
        height: 300,
        contextType: 'webgl',
        children: [
          group({
            x: tankX,
            y: tankY,
            rotation: tankAngle,
            children: [
              // Tank body - larger circle
              circle({ x: 0, y: 0, radius: 25, fill: '#4a4a4a' }),
              // Direction indicator on body
              circle({ x: 30, y: 0, radius: 5, fill: '#ffe66d' }),
              // Turret
              group({
                rotation: turretAngle,
                children: [
                  circle({ x: 0, y: 0, radius: 12, fill: '#ff6b6b' }),
                  circle({ x: 25, y: 0, radius: 6, fill: '#00ff00' }) // Gun barrel - green
                ]
              })
            ]
          })
        ]
      }),
      p({ 
        style: { marginTop: '10px', fontSize: '14px', color: '#aaa' },
        children: ['↑↓ = move forward/back | ←→ = rotate tank body (yellow dot shows direction) | A/D = rotate turret (green dot is gun)'] 
      })
    ]
  })
}

// Example 3: Solar system (animation disabled for debugging)
function solarSystem() {
  const runtime = getReactiveRuntime()
  const earthOrbit = runtime.ref(Math.PI / 4) // Static angle
  const moonOrbit = runtime.ref(0)
  
  // Animation disabled for debugging
  const animate = () => {
    earthOrbit.value += 0.01
    moonOrbit.value += 0.05
    requestAnimationFrame(animate)
  }
  animate()
  
  return div({
    children: [
      h2({ children: ['Solar System (static)'] }),
      canvas({
        width: 400,
        height: 300,
        contextType: 'webgl',
        children: [
          group({
            x: 200,
            y: 150,
            children: [
              circle({ x: 0, y: 0, radius: 20, fill: '#ffd700' }),
              group({
                rotation: earthOrbit,
                children: [
                  circle({ x: 100, y: 0, radius: 10, fill: '#4ecdc4' }),
                  group({
                    x: 100,
                    rotation: moonOrbit,
                    children: [
                      circle({ x: 20, y: 0, radius: 3, fill: '#aaa' })
                    ]
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  })
}

// Example 4: Layered scene
function layeredScene() {
  return div({
    children: [
      h2({ children: ['Layered Scene'] }),
      canvas({
        width: 400,
        height: 300,
        contextType: 'webgl',
        children: [
          group({
            x: 200,
            y: 150,
            scaleX: 0.5,
            scaleY: 0.5,
            opacity: 0.3,
            children: [
              circle({ x: -50, y: -50, radius: 40, fill: '#ddd' }),
              circle({ x: 50, y: 50, radius: 40, fill: '#ddd' })
            ]
          }),
          group({
            x: 200,
            y: 150,
            children: [
              rect({ x: -40, y: -40, width: 80, height: 80, fill: '#ff6b6b' })
            ]
          }),
          group({
            x: 200,
            y: 150,
            scaleX: 1.5,
            scaleY: 1.5,
            children: [
              circle({ x: 80, y: 80, radius: 15, fill: '#4ecdc4' })
            ]
          })
        ]
      })
    ]
  })
}

// Debug: test basic circle without group
function debugBasic() {
  return div({
    children: [
      h2({ children: ['Debug: Basic Circle (no group)'] }),
      canvas({
        width: 400,
        height: 300,
        contextType: 'webgl',
        children: [
          circle({ x: 200, y: 150, radius: 50, fill: '#ff0000' })
        ]
      })
    ]
  })
}

const app = div({
  style: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: '#1a1a2e',
    color: '#eee',
    padding: '2rem',
    minHeight: '100vh'
  },
  children: [
    div({
      style: { maxWidth: '1200px', margin: '0 auto' },
      children: [
        h1({ children: ['🎯 Group Hierarchy'] }),
        p({ 
          style: { color: '#aaa', marginBottom: '2rem' },
          children: ['Hierarchical transforms with nested groups. Parent transforms affect all children.'] 
        }),
        
        debugBasic(),
        
        div({
          style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '2rem', marginTop: '2rem' },
          children: [
            simpleGroup(),
            tankExample(),
            solarSystem(),
            layeredScene()
          ]
        })
      ]
    })
  ]
})

mount(app, document.getElementById('app')!)
