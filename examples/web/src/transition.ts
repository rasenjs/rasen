import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { div, h1, h2, button, p, mount, transition, transitionGroup, span } from '@rasenjs/dom'

useReactiveRuntime()

const visible1 = ref(true)
const visible2 = ref(true)
const visible3 = ref(true)
const visible4 = ref(true)

const items = ref([
  { id: 1, text: 'Item 1', color: '#667eea' },
  { id: 2, text: 'Item 2', color: '#764ba2' },
  { id: 3, text: 'Item 3', color: '#f093fb' }
])

let nextId = 4

const addItem = () => {
  const colors = ['#f5576c', '#4facfe', '#00f2fe', '#fa709a', '#fee140']
  items.value = [
    ...items.value,
    { 
      id: nextId++, 
      text: `Item ${nextId - 1}`, 
      color: colors[Math.floor(Math.random() * colors.length)]
    }
  ]
}

const removeItem = (id: number) => {
  items.value = items.value.filter(item => item.id !== id)
}

const shuffleItems = () => {
  items.value = [...items.value].sort(() => Math.random() - 0.5)
}

const card = (title: string, content: string, style: Record<string, string>) => 
  div({
    style: {
      padding: '1.5rem',
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      ...style
    },
    children: [
      h2({ style: { margin: '0 0 0.5rem 0', color: '#333', fontSize: '1.1rem' } }, title),
      p({ style: { margin: 0, color: '#666', lineHeight: 1.6 } }, content)
    ]
  })

const app = div(
  { style: { 
    padding: '2rem', 
    maxWidth: '900px', 
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  } },
  
  h1({ style: { color: '#333', marginBottom: '0.5rem' } }, 'Transition Animations'),
  p({ style: { color: '#666', marginBottom: '2rem' } }, 
    'Click buttons to toggle different transition effects. Each card demonstrates a unique animation style.'),
  
  // Fade Transition
  div(
    { style: { marginBottom: '1.5rem' } },
    div(
      { style: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' } },
      h2({ style: { margin: 0, fontSize: '1.25rem', color: '#444' } }, 'Fade'),
      button(
        { 
          onClick: () => visible1.value = !visible1.value,
          style: {
            padding: '0.5rem 1rem',
            background: visible1.value ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            transition: 'background 0.2s'
          }
        },
        () => visible1.value ? 'Hide' : 'Show'
      )
    ),
    div(
      { style: { minHeight: '120px', background: '#f8f9fa', borderRadius: '8px', padding: '1rem' } },
      transition({
        when: visible1,
        name: 'fade',
        children: () => card('Fade Transition', 'Smooth opacity transition for subtle appearance/disappearance effects.', {
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white'
        })
      })
    )
  ),
  
  // Slide Transition
  div(
    { style: { marginBottom: '1.5rem' } },
    div(
      { style: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' } },
      h2({ style: { margin: 0, fontSize: '1.25rem', color: '#444' } }, 'Slide'),
      button(
        { 
          onClick: () => visible2.value = !visible2.value,
          style: {
            padding: '0.5rem 1rem',
            background: visible2.value ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            transition: 'background 0.2s'
          }
        },
        () => visible2.value ? 'Hide' : 'Show'
      )
    ),
    div(
      { style: { minHeight: '120px', background: '#f8f9fa', borderRadius: '8px', padding: '1rem', overflow: 'hidden' } },
      transition({
        when: visible2,
        name: 'slide',
        children: () => card('Slide Transition', 'Slides in from the right and out to the left. Great for navigation panels.', {
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          color: 'white'
        })
      })
    )
  ),
  
  // Scale Transition
  div(
    { style: { marginBottom: '1.5rem' } },
    div(
      { style: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' } },
      h2({ style: { margin: 0, fontSize: '1.25rem', color: '#444' } }, 'Scale'),
      button(
        { 
          onClick: () => visible3.value = !visible3.value,
          style: {
            padding: '0.5rem 1rem',
            background: visible3.value ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            transition: 'background 0.2s'
          }
        },
        () => visible3.value ? 'Hide' : 'Show'
      )
    ),
    div(
      { style: { minHeight: '120px', background: '#f8f9fa', borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center' } },
      transition({
        when: visible3,
        name: 'scale',
        children: () => card('Scale Transition', 'Scales up from zero with opacity. Perfect for modals and popups.', {
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          color: 'white'
        })
      })
    )
  ),
  
  // Bounce Transition (custom)
  div(
    { style: { marginBottom: '1.5rem' } },
    div(
      { style: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' } },
      h2({ style: { margin: 0, fontSize: '1.25rem', color: '#444' } }, 'Bounce (Custom)'),
      button(
        { 
          onClick: () => visible4.value = !visible4.value,
          style: {
            padding: '0.5rem 1rem',
            background: visible4.value ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            transition: 'background 0.2s'
          }
        },
        () => visible4.value ? 'Hide' : 'Show'
      )
    ),
    div(
      { style: { minHeight: '120px', background: '#f8f9fa', borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center' } },
      transition({
        when: visible4,
        name: 'bounce',
        children: () => card('Bounce Transition', 'Custom animation with spring-like bounce effect. Define your own creative transitions!', {
          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          color: 'white'
        })
      })
    )
  ),
  
  // Transition Group - List Animation
  div(
    { style: { marginBottom: '1.5rem' } },
    h2({ style: { margin: '0 0 1rem 0', fontSize: '1.25rem', color: '#444' } }, 'Transition Group (List Animation)'),
    p({ style: { margin: '0 0 1rem 0', color: '#666' } }, 
      'Items animate when added, removed, or moved. Notice the FLIP animation when shuffling!'),
    div(
      { style: { display: 'flex', gap: '0.5rem', marginBottom: '1rem' } },
      button(
        { 
          onClick: addItem,
          style: {
            padding: '0.5rem 1rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }
        },
        'Add Item'
      ),
      button(
        { 
          onClick: shuffleItems,
          style: {
            padding: '0.5rem 1rem',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }
        },
        'Shuffle'
      ),
      button(
        { 
          onClick: () => items.value = [],
          style: {
            padding: '0.5rem 1rem',
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }
        },
        'Clear All'
      )
    ),
    div(
      { style: { 
        minHeight: '100px', 
        background: '#f8f9fa', 
        borderRadius: '8px', 
        padding: '1rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem'
      } },
      transitionGroup({
        items,
        name: 'list',
        children: (item, index) => div({
          style: {
            padding: '0.75rem 1.25rem',
            background: item.color,
            color: 'white',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          },
          children: [
            span({ style: { fontWeight: '500' } }, item.text),
            button({
              onClick: () => removeItem(item.id),
              style: {
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                borderRadius: '4px',
                padding: '0.25rem 0.5rem',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }
            }, '×')
          ]
        })
      })
    )
  ),
  
  // Info section
  div(
    { style: { 
      marginTop: '2rem', 
      padding: '1.5rem', 
      background: '#e7f3ff', 
      borderRadius: '8px',
      border: '1px solid #b8daff'
    } },
    h2({ style: { margin: '0 0 1rem 0', color: '#004085', fontSize: '1.1rem' } }, 'How it works'),
    p({ style: { margin: '0 0 0.5rem 0', color: '#333' } }, 
      'The transition component uses CSS classes to animate elements:'),
    div({ style: { fontFamily: 'monospace', fontSize: '0.85rem', color: '#555', background: '#f0f0f0', padding: '0.75rem', borderRadius: '4px' } },
      `${name}-enter-from → ${name}-enter-active → ${name}-enter-to`),
    p({ style: { margin: '1rem 0 0.5rem 0', color: '#333' } }, 
      'The transition-group component animates list items with FLIP technique:'),
    div({ style: { fontFamily: 'monospace', fontSize: '0.85rem', color: '#555', background: '#f0f0f0', padding: '0.75rem', borderRadius: '4px', whiteSpace: 'pre-wrap' } },
      `transitionGroup({
  items: myItems,
  name: 'list',
  children: (item, index) => MyItem(item)
})`)
  )
)

mount(app, document.getElementById('app')!)
