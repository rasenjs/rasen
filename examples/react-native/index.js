/**
 * Rasen React Native Example - Complex Todo App
 * 展示: computed, each, touchableOpacity, scrollView, 响应式状态
 */

import { registerApp, view, text, each, touchableOpacity } from '@rasenjs/react-native';
import { ref, computed } from '@vue/reactivity';
import { useReactiveRuntime } from '@rasenjs/reactive-vue';

// 初始化响应式运行时
useReactiveRuntime();

// ============================================================================
// 响应式状态
// ============================================================================

const todos = ref([
  { id: 1, text: '学习 Rasen 框架', done: true, priority: 'high' },
  { id: 2, text: '实现 React Native 绑定', done: true, priority: 'high' },
  { id: 3, text: '测试 Fabric 渲染', done: false, priority: 'medium' },
  { id: 4, text: '接入响应式系统', done: false, priority: 'low' },
  { id: 5, text: '优化列表渲染性能', done: false, priority: 'medium' },
])

const nextId = ref(6)
const newTodoText = ref('')
const filter = ref('all') // 'all' | 'active' | 'completed'

// ============================================================================
// 计算属性
// ============================================================================

const filteredTodos = computed(() => {
  const list = todos.value
  if (filter.value === 'active') {
    return list.filter(t => !t.done)
  }
  if (filter.value === 'completed') {
    return list.filter(t => t.done)
  }
  return list
})

const todoStats = computed(() => {
  const total = todos.value.length
  const completed = todos.value.filter(t => t.done).length
  const active = total - completed
  return { total, completed, active }
})

const progress = computed(() => {
  if (todoStats.value.total === 0) return 0
  return Math.round((todoStats.value.completed / todoStats.value.total) * 100)
})

const priorityColor = (priority) => {
  if (priority === 'high') return '#e74c3c'
  if (priority === 'medium') return '#f39c12'
  return '#2ecc71'
}

// ============================================================================
// 操作函数
// ============================================================================

const toggleTodo = (id) => {
  todos.value = todos.value.map(todo =>
    todo.id === id ? { ...todo, done: !todo.done } : todo
  )
}

const deleteTodo = (id) => {
  todos.value = todos.value.filter(todo => todo.id !== id)
}

const addTodo = () => {
  if (!newTodoText.value.trim()) return
  todos.value = [
    ...todos.value,
    {
      id: nextId.value,
      text: newTodoText.value.trim(),
      done: false,
      priority: 'medium'
    }
  ]
  nextId.value++
  newTodoText.value = ''
}

const setFilter = (newFilter) => {
  filter.value = newFilter
}

// ============================================================================
// 组件定义
// ============================================================================

// Filter Tab 组件
const FilterTab = ({ label, activeFilter, currentFilter, onPress }) => {
  const isActive = computed(() => activeFilter === currentFilter)
  
  return touchableOpacity({
    onPress,
    style: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: computed(() => isActive.value ? '#2196F3' : 'transparent'),
      marginHorizontal: 4,
    },
    children: text({
      style: {
        fontSize: 14,
        fontWeight: computed(() => isActive.value ? 'bold' : 'normal'),
        color: computed(() => isActive.value ? 'white' : '#666'),
      },
      children: label,
    }),
  })
}

// Todo Item 组件
const TodoItem = ({ todo }) => {
  const isDone = computed(() => todo.done)
  
  return touchableOpacity({
    onPress: () => toggleTodo(todo.id),
    style: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
      backgroundColor: 'white',
    },
    children: [
      // Checkbox
      view({
        style: {
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 2,
          borderColor: computed(() => isDone.value ? '#4CAF50' : '#ccc'),
          backgroundColor: computed(() => isDone.value ? '#4CAF50' : 'transparent'),
          marginRight: 14,
          justifyContent: 'center',
          alignItems: 'center',
        },
        children: text({
          style: {
            color: 'white',
            fontSize: 16,
            fontWeight: 'bold',
          },
          children: computed(() => isDone.value ? '✓' : ''),
        }),
      }),
      
      // Priority indicator
      view({
        style: {
          width: 4,
          height: 40,
          borderRadius: 2,
          backgroundColor: priorityColor(todo.priority),
          marginRight: 12,
        },
      }),
      
      // Text content
      view({
        style: { flex: 1 },
        children: text({
          style: {
            fontSize: 16,
            color: computed(() => isDone.value ? '#999' : '#333'),
            textDecorationLine: computed(() => isDone.value ? 'line-through' : 'none'),
          },
          children: todo.text,
        }),
      }),
      
      // Delete button
      touchableOpacity({
        onPress: () => deleteTodo(todo.id),
        style: {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: '#fee',
          justifyContent: 'center',
          alignItems: 'center',
        },
        children: text({
          style: {
            fontSize: 18,
            color: '#e74c3c',
          },
          children: '×',
        }),
      }),
    ],
  })
}

// Progress Bar 组件
const ProgressBar = ({ progress }) => {
  return view({
    style: {
      height: 8,
      backgroundColor: '#eee',
      borderRadius: 4,
      marginTop: 12,
      overflow: 'hidden',
    },
    children: view({
      style: {
        width: computed(() => `${progress.value}%`),
        height: 8,
        backgroundColor: computed(() => progress.value >= 100 ? '#4CAF50' : '#2196F3'),
        borderRadius: 4,
      },
    }),
  })
}

// Main App
const App = () => view({
  style: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  children: [
    // Header
    view({
      style: {
        backgroundColor: '#2196F3',
        paddingTop: 50,
        paddingBottom: 20,
        paddingHorizontal: 20,
      },
      children: [
        text({
          style: {
            fontSize: 28,
            fontWeight: 'bold',
            color: 'white',
          },
          children: '📝 My Tasks',
        }),
        
        // Stats
        view({
          style: {
            flexDirection: 'row',
            marginTop: 8,
          },
          children: [
            text({
              style: {
                fontSize: 14,
                color: 'rgba(255,255,255,0.9)',
              },
              children: computed(() => `${todoStats.value.completed}/${todoStats.value.total} completed`),
            }),
            text({
              style: {
                fontSize: 14,
                color: 'rgba(255,255,255,0.7)',
                marginLeft: 12,
              },
              children: computed(() => `${todoStats.value.active} remaining`),
            }),
          ],
        }),
        
        // Progress bar
        ProgressBar({ progress }),
      ],
    }),
    
    // Filter tabs
    view({
      style: {
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
      },
      children: [
        FilterTab({ label: 'All', activeFilter: filter, currentFilter: 'all', onPress: () => setFilter('all') }),
        FilterTab({ label: 'Active', activeFilter: filter, currentFilter: 'active', onPress: () => setFilter('active') }),
        FilterTab({ label: 'Done', activeFilter: filter, currentFilter: 'completed', onPress: () => setFilter('completed') }),
      ],
    }),
    
    // Todo List
    view({
      style: {
        flex: 1,
        backgroundColor: 'white',
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 10,
        overflow: 'hidden',
      },
      children: each(filteredTodos, (todo) => TodoItem({ todo })),
    }),
    
    // Footer with count
    view({
      style: {
        paddingVertical: 16,
        paddingHorizontal: 20,
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: '#eee',
      },
      children: text({
        style: {
          fontSize: 12,
          color: '#999',
          textAlign: 'center',
        },
        children: computed(() => {
          if (progress.value >= 100) return '🎉 All tasks completed!'
          return 'Keep going!'
        }),
      }),
    }),
  ],
})

// 注册应用
registerApp('RasenExample', App)
