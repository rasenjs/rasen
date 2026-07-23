/**
 * Rasen React Native Example - Todo App with Routing
 * 展示: 路由、match、响应式状态
 */

import { registerApp, view, text, each, touchableOpacity, when } from '@rasenjs/react-native';
import { createRouter, createMemoryHistory, route, template } from '@rasenjs/router';
import { createRouterView } from '@rasenjs/react-native-router';
import { z } from 'zod';
import { ref, computed } from '@vue/reactivity';
import { useReactiveRuntime } from '@rasenjs/reactive-vue';

useReactiveRuntime();

// ============================================================================
// 路由配置
// ============================================================================

const history = createMemoryHistory('/home')
const router = createRouter({
  home: route(),
  detail: route(template`/detail/${ { id: z.string() } }`),
  add: route('/add'),
}, { history })

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

// ============================================================================
// 计算属性
// ============================================================================

const todoStats = computed(() => {
  const total = todos.value.length
  const completed = todos.value.filter(t => t.done).length
  const active = total - completed
  return { total, completed, active }
})

const getTodoById = (id) => {
  return todos.value.find(t => t.id === parseInt(id))
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
  router.push(router.routes.home)
}

// ============================================================================
// 页面组件
// ============================================================================

// Home - Todo 列表
const HomePage = () => {
  return view({
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
          view({
            style: { flexDirection: 'row', marginTop: 8 },
            children: [
              text({
                style: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
                children: computed(() => `${todoStats.value.completed}/${todoStats.value.total} completed`),
              }),
            ],
          }),
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
        children: each(todos, (todo) =>
          view({
            style: {
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#eee',
            },
            children: [
              // Checkbox - 单独处理点击
              touchableOpacity({
                onPress: () => toggleTodo(todo.id),
                style: {
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: todo.done ? '#4CAF50' : '#ccc',
                  backgroundColor: todo.done ? '#4CAF50' : 'transparent',
                  marginRight: 14,
                  justifyContent: 'center',
                  alignItems: 'center',
                },
                children: text({
                  style: { color: 'white', fontSize: 16 },
                  children: todo.done ? '✓' : '',
                }),
              }),
              // Text - 点击进入详情
              touchableOpacity({
                onPress: () => router.push(router.routes.detail, { params: { id: todo.id.toString() } }),
                style: { flex: 1 },
                children: text({
                  style: {
                    fontSize: 16,
                    color: () => todo.done ? '#999' : '#333',
                    textDecorationLine: () => todo.done ? 'line-through' : 'none',
                  },
                  children: todo.text,
                }),
              }),
            ],
          })
        ),
      }),
      
      // Add button
      touchableOpacity({
        onPress: () => router.push(router.routes.add),
        style: {
          position: 'absolute',
          right: 20,
          bottom: 30,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#2196F3',
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
          elevation: 5,
        },
        children: text({
          style: { fontSize: 28, color: 'white', fontWeight: 'bold' },
          children: '+',
        }),
      }),
    ],
  })
}

// Detail - Todo 详情
const DetailPage = ({ params, router }) => {
  const todo = computed(() => getTodoById(params.id))
  
  return view({
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
          flexDirection: 'row',
          alignItems: 'center',
        },
        children: [
          touchableOpacity({
            onPress: () => router.back(),
            style: { padding: 8, marginRight: 8 },
            children: text({
              style: { fontSize: 24, color: 'white' },
              children: '←',
            }),
          }),
          text({
            style: { fontSize: 24, fontWeight: 'bold', color: 'white' },
            children: 'Task Detail',
          }),
        ],
      }),
      
      // Content
      view({
        style: {
          flex: 1,
          backgroundColor: 'white',
          margin: 16,
          borderRadius: 10,
          padding: 20,
        },
        children: when({
          condition: () => !!todo.value,
          then: () => view({
            style: { flex: 1 },
            children: [
              text({
                style: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 16 },
                children: todo.value.text,
              }),
              view({
                style: {
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 12,
                },
                children: [
                  text({
                    style: { fontSize: 14, color: '#666', marginRight: 8 },
                    children: 'Status:',
                  }),
                  when({
                    condition: () => todo.value?.done ?? false,
                    then: () => text({
                      style: { fontSize: 14, color: '#4CAF50', fontWeight: 'bold' },
                      children: 'Completed',
                    }),
                    else: () => text({
                      style: { fontSize: 14, color: '#f39c12', fontWeight: 'bold' },
                      children: 'Active',
                    }),
                  }),
                ],
              }),
              view({
                style: {
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 24,
                },
                children: [
                  text({
                    style: { fontSize: 14, color: '#666', marginRight: 8 },
                    children: 'Priority:',
                  }),
                  text({
                    style: { fontSize: 14, fontWeight: 'bold' },
                    children: todo.value.priority.toUpperCase(),
                  }),
                ],
              }),
              when({
                condition: () => todo.value?.done ?? false,
                then: () => touchableOpacity({
                  onPress: () => {
                    if (todo.value) toggleTodo(todo.value.id)
                  },
                  style: {
                    backgroundColor: '#f39c12',
                    paddingVertical: 14,
                    borderRadius: 8,
                    alignItems: 'center',
                  },
                  children: text({
                    style: { color: 'white', fontSize: 16, fontWeight: 'bold' },
                    children: 'Mark as Active',
                  }),
                }),
                else: () => touchableOpacity({
                  onPress: () => {
                    if (todo.value) toggleTodo(todo.value.id)
                  },
                  style: {
                    backgroundColor: '#4CAF50',
                    paddingVertical: 14,
                    borderRadius: 8,
                    alignItems: 'center',
                  },
                  children: text({
                    style: { color: 'white', fontSize: 16, fontWeight: 'bold' },
                    children: 'Mark as Done',
                  }),
                }),
              }),
              touchableOpacity({
                onPress: () => {
                  deleteTodo(todo.value.id)
                  router.back()
                },
                style: {
                  backgroundColor: '#e74c3c',
                  paddingVertical: 14,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginTop: 12,
                },
                children: text({
                  style: { color: 'white', fontSize: 16, fontWeight: 'bold' },
                  children: 'Delete Task',
                }),
              }),
            ],
          }),
          else: () => text({
            style: { fontSize: 18, color: '#999', textAlign: 'center', marginTop: 50 },
            children: 'Task not found',
          }),
        }),
      }),
    ],
  })
}

// Add - 添加新 Todo
const AddPage = () => {
  return view({
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
          flexDirection: 'row',
          alignItems: 'center',
        },
        children: [
          touchableOpacity({
            onPress: () => router.back(),
            style: { padding: 8, marginRight: 8 },
            children: text({
              style: { fontSize: 24, color: 'white' },
              children: '←',
            }),
          }),
          text({
            style: { fontSize: 24, fontWeight: 'bold', color: 'white' },
            children: 'Add Task',
          }),
        ],
      }),
      
      // Form
      view({
        style: {
          flex: 1,
          backgroundColor: 'white',
          margin: 16,
          borderRadius: 10,
          padding: 20,
        },
        children: [
          text({
            style: { fontSize: 16, color: '#666', marginBottom: 8 },
            children: 'Task Name',
          }),
          touchableOpacity({
            onPress: () => newTodoText.value = newTodoText.value + '1',
            style: {
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 14,
              marginBottom: 20,
            },
            children: text({
              style: { fontSize: 16, color: newTodoText.value ? '#333' : '#999' },
              children: newTodoText.value || 'Tap to add task...',
            }),
          }),
          touchableOpacity({
            onPress: addTodo,
            style: {
              backgroundColor: '#2196F3',
              paddingVertical: 16,
              borderRadius: 8,
              alignItems: 'center',
            },
            children: text({
              style: { color: 'white', fontSize: 18, fontWeight: 'bold' },
              children: 'Add Task',
            }),
          }),
        ],
      }),
    ],
  })
}

// ============================================================================
// RouterView
// ============================================================================

const RouterView = createRouterView(router, {
  home: () => HomePage(),
  detail: (params) => DetailPage({ params, router }),
  add: () => AddPage(),
}, {
  default: () => view({
    style: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    children: [
      text({ style: { fontSize: 18, color: '#f00' }, children: 'Page not found' }),
      text({ style: { fontSize: 14, color: '#666' }, children: `Current: ${router.current?.route?.fullPath || 'null'}` }),
      text({ style: { fontSize: 14, color: '#666' }, children: `History path: ${history.getPath()}` }),
    ],
  }),
})



// ============================================================================
// App
// ============================================================================

const App = () => view({
  style: { flex: 1 },
  children: RouterView(),
})

registerApp('RasenExample', App)
