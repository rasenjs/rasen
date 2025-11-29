/**
 * Rasen React Native Example - Reactive Todo App
 *
 * 使用 signal-polyfill + @rasenjs/reactive-signals 实现响应式 UI
 */

import { registerApp, view, text, touchable } from '@rasenjs/react-native';
import { createSignalsRuntime, ref, computed } from '@rasenjs/reactive-signals';
import { setReactiveRuntime } from '@rasenjs/core';

// 初始化响应式运行时
setReactiveRuntime(createSignalsRuntime());

// ============================================================================
// 响应式状态
// ============================================================================

const todos = ref([
  { id: 1, text: '学习 Rasen 框架', done: true },
  { id: 2, text: '实现 React Native 绑定', done: true },
  { id: 3, text: '测试 Fabric 渲染', done: true },
  { id: 4, text: '接入响应式系统', done: false },
]);

// 计算属性
const totalCount = computed(() => todos.value.length);
const doneCount = computed(() => todos.value.filter(t => t.done).length);
const pendingCount = computed(() => todos.value.filter(t => !t.done).length);

const toggleTodo = (id) => {
  todos.value = todos.value.map(todo =>
    todo.id === id ? { ...todo, done: !todo.done } : todo
  );
  console.log('[Rasen] Toggle todo:', id);
};

// ============================================================================
// 组件定义
// ============================================================================

// Todo Item 组件 - 使用 computed 追踪单个 todo 的 done 状态
const TodoItem = ({ todoId, todoText }) => {
  // 创建一个 computed 来追踪这个 todo 的 done 状态
  const isDone = computed(() => {
    const todo = todos.value.find(t => t.id === todoId);
    return todo ? todo.done : false;
  });
  
  // 响应式样式（通过 computed）
  const checkboxBorderColor = computed(() => isDone.value ? '#4CAF50' : '#ccc');
  const checkboxBgColor = computed(() => isDone.value ? '#4CAF50' : 'transparent');
  const textColor = computed(() => isDone.value ? '#999' : '#333');
  const textDecoration = computed(() => isDone.value ? 'line-through' : 'none');
  const checkMark = computed(() => isDone.value ? '✓' : '');

  return view({
    style: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
    },
    children: [
      // 可点击的 checkbox
      touchable({
        onPress: () => toggleTodo(todoId),
        children: [
          view({
            style: {
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: checkboxBorderColor,
              backgroundColor: checkboxBgColor,
              marginRight: 12,
              justifyContent: 'center',
              alignItems: 'center',
            },
            children: [
              text({
                style: { color: 'white', fontSize: 14, fontWeight: 'bold' },
                children: checkMark,
              }),
            ],
          }),
        ],
      }),
      // Todo 文本
      text({
        style: {
          fontSize: 16,
          color: textColor,
          textDecorationLine: textDecoration,
          flex: 1,
        },
        children: todoText,
      }),
    ],
  });
};

// Todo List 组件
const TodoList = () => view({
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
          children: '📝 Rasen Todo',
        }),
        text({
          style: {
            fontSize: 14,
            color: 'rgba(255,255,255,0.8)',
            marginTop: 4,
          },
          children: 'Reactive Fabric Rendering!',
        }),
      ],
    }),

    // Stats - 使用响应式计算属性
    view({
      style: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        padding: 16,
        backgroundColor: 'white',
        marginHorizontal: 16,
        marginTop: -10,
        borderRadius: 10,
        elevation: 3,
      },
      children: [
        view({
          style: { alignItems: 'center' },
          children: [
            text({
              style: { fontSize: 24, fontWeight: 'bold', color: '#2196F3' },
              children: totalCount,  // 响应式！
            }),
            text({
              style: { fontSize: 12, color: '#666' },
              children: 'Total',
            }),
          ],
        }),
        view({
          style: { alignItems: 'center' },
          children: [
            text({
              style: { fontSize: 24, fontWeight: 'bold', color: '#4CAF50' },
              children: doneCount,  // 响应式！
            }),
            text({
              style: { fontSize: 12, color: '#666' },
              children: 'Done',
            }),
          ],
        }),
        view({
          style: { alignItems: 'center' },
          children: [
            text({
              style: { fontSize: 24, fontWeight: 'bold', color: '#FF9800' },
              children: pendingCount,  // 响应式！
            }),
            text({
              style: { fontSize: 12, color: '#666' },
              children: 'Pending',
            }),
          ],
        }),
      ],
    }),

    // Todo Items
    view({
      style: {
        backgroundColor: 'white',
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 10,
        elevation: 2,
      },
      children: todos.value.map(todo => TodoItem({ todoId: todo.id, todoText: todo.text })),
    }),

    // Footer
    view({
      style: {
        padding: 20,
        alignItems: 'center',
      },
      children: [
        text({
          style: { fontSize: 12, color: '#999' },
          children: 'Powered by Rasen + Signals + Fabric',
        }),
      ],
    }),
  ],
});

// ============================================================================
// 应用入口
// ============================================================================

registerApp('RasenExample', TodoList);
