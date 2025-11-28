/**
 * Rasen React Native Example App
 *
 * This demonstrates using Rasen's reactive rendering with React Native's
 * Fabric architecture, bypassing React's reconciler.
 */

import { setReactiveRuntime } from '@rasenjs/core';
import { createVueRuntime } from '@rasenjs/reactive-vue';
import { ref, type Ref } from 'vue';
import {
  view,
  text,
  textInput,
  touchableOpacity,
  scrollView,
  mount,
  type RNMountFunction
} from '@rasenjs/react-native';

// Create and set Vue reactive runtime
setReactiveRuntime(createVueRuntime());

// Type alias for Todo item
interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

/**
 * Counter Example Component
 */
function CounterExample(): RNMountFunction {
  const count: Ref<number> = ref(0);

  return view({
    style: {
      padding: 20,
      backgroundColor: '#f5f5f5',
      borderRadius: 10,
      marginBottom: 20,
    },
    children: [
      text({
        style: {
          fontSize: 24,
          fontWeight: 'bold',
          marginBottom: 10,
          color: '#333',
        },
        children: 'Counter Example',
      }),
      text({
        style: {
          fontSize: 48,
          textAlign: 'center',
          marginVertical: 20,
          color: '#2196F3',
        },
        children: () => `${count.value}`,
      }),
      view({
        style: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 10,
        },
        children: [
          touchableOpacity({
            onPress: () => count.value--,
            style: {
              backgroundColor: '#f44336',
              paddingHorizontal: 30,
              paddingVertical: 15,
              borderRadius: 8,
            },
            children: text({
              style: { color: 'white', fontSize: 24, fontWeight: 'bold' },
              children: '-',
            }),
          }),
          touchableOpacity({
            onPress: () => count.value++,
            style: {
              backgroundColor: '#4CAF50',
              paddingHorizontal: 30,
              paddingVertical: 15,
              borderRadius: 8,
            },
            children: text({
              style: { color: 'white', fontSize: 24, fontWeight: 'bold' },
              children: '+',
            }),
          }),
        ],
      }),
    ],
  });
}

/**
 * Todo List Example Component
 */
function TodoExample(): RNMountFunction {
  const todos: Ref<TodoItem[]> = ref([
    { id: 1, text: 'Learn Rasen', done: false },
    { id: 2, text: 'Build an app', done: false },
  ]);
  const inputText: Ref<string> = ref('');
  let nextId = 3;

  const addTodo = () => {
    if (inputText.value.trim()) {
      todos.value = [...todos.value, { id: nextId++, text: inputText.value, done: false }];
      inputText.value = '';
    }
  };

  const toggleTodo = (id: number) => {
    todos.value = todos.value.map((todo: TodoItem) =>
      todo.id === id ? { ...todo, done: !todo.done } : todo
    );
  };

  const removeTodo = (id: number) => {
    todos.value = todos.value.filter((todo: TodoItem) => todo.id !== id);
  };

  return view({
    style: {
      padding: 20,
      backgroundColor: '#e3f2fd',
      borderRadius: 10,
      marginBottom: 20,
    },
    children: [
      text({
        style: {
          fontSize: 24,
          fontWeight: 'bold',
          marginBottom: 10,
          color: '#1565C0',
        },
        children: 'Todo List',
      }),
      view({
        style: {
          flexDirection: 'row',
          marginBottom: 15,
        },
        children: [
          textInput({
            value: () => inputText.value,
            onChangeText: (newText: string) => {
              inputText.value = newText;
            },
            placeholder: 'Add a new todo...',
            style: {
              flex: 1,
              borderWidth: 1,
              borderColor: '#90CAF9',
              borderRadius: 8,
              paddingHorizontal: 15,
              paddingVertical: 10,
              fontSize: 16,
              backgroundColor: 'white',
            },
          }),
          touchableOpacity({
            onPress: addTodo,
            style: {
              backgroundColor: '#2196F3',
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 8,
              marginLeft: 10,
              justifyContent: 'center',
            },
            children: text({
              style: { color: 'white', fontSize: 16, fontWeight: 'bold' },
              children: 'Add',
            }),
          }),
        ],
      }),
      // Todo items - using reactive children
      view({
        style: { gap: 8 },
        children: () =>
          todos.value.map((todo: TodoItem) =>
            view({
              key: todo.id,
              style: {
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: 'white',
                padding: 15,
                borderRadius: 8,
                borderLeftWidth: 4,
                borderLeftColor: todo.done ? '#4CAF50' : '#FFC107',
              },
              children: [
                touchableOpacity({
                  onPress: () => toggleTodo(todo.id),
                  style: { flex: 1 },
                  children: text({
                    style: {
                      fontSize: 16,
                      textDecorationLine: todo.done ? 'line-through' : 'none',
                      color: todo.done ? '#9E9E9E' : '#333',
                    },
                    children: todo.text,
                  }),
                }),
                touchableOpacity({
                  onPress: () => removeTodo(todo.id),
                  style: {
                    backgroundColor: '#f44336',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 4,
                  },
                  children: text({
                    style: { color: 'white', fontSize: 14 },
                    children: '✕',
                  }),
                }),
              ],
            })
          ),
      }),
    ],
  });
}

/**
 * Main App Component
 */
function App(): RNMountFunction {
  return scrollView({
    style: { flex: 1, backgroundColor: '#fff' },
    contentContainerStyle: { padding: 20 },
    children: [
      // Header
      view({
        style: {
          marginBottom: 30,
          alignItems: 'center',
        },
        children: [
          text({
            style: {
              fontSize: 32,
              fontWeight: 'bold',
              color: '#1976D2',
            },
            children: '🌀 Rasen',
          }),
          text({
            style: {
              fontSize: 16,
              color: '#666',
              marginTop: 5,
            },
            children: 'React Native Example',
          }),
        ],
      }),

      // Counter Example
      CounterExample(),

      // Todo Example
      TodoExample(),

      // Info Section
      view({
        style: {
          padding: 20,
          backgroundColor: '#FFF3E0',
          borderRadius: 10,
        },
        children: [
          text({
            style: {
              fontSize: 18,
              fontWeight: 'bold',
              color: '#E65100',
              marginBottom: 10,
            },
            children: 'About This Example',
          }),
          text({
            style: {
              fontSize: 14,
              color: '#666',
              lineHeight: 22,
            },
            children:
              "This example demonstrates Rasen's reactive rendering system with React Native. " +
              "It uses Vue's reactivity system (@vue/reactivity) for state management and " +
              "directly interfaces with React Native's Fabric architecture.",
          }),
        ],
      }),
    ],
  });
}

/**
 * Entry point - mount the app to React Native root
 *
 * @param rootTag - The React Native root view tag
 * @returns Unmount function
 */
export function createApp(rootTag: number): () => void {
  return mount(App(), rootTag);
}

// Default export for React Native AppRegistry compatibility
export default App;
