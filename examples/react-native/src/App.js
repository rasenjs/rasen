/**
 * @rasenjs/react-native example — App component
 *
 * Demonstrates:
 *   - Tag aliases: view(), text(), touchableOpacity()
 *   - Reactive state with @vue/reactivity
 *   - List rendering: each()
 *   - Conditional rendering: when()
 *   - Style binding (static & reactive getter)
 *   - Event handling (onTouchEnd)
 */

import { view, text, touchableOpacity, each, when } from '@rasenjs/react-native'
import { ref, computed } from '@vue/reactivity'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'

useReactiveRuntime()

// ── State ───────────────────────────────────────────────────────────────

const counter = ref(0)
const isDark = ref(false)

const todos = ref([
  { id: 1, text: 'Learn Rasen', done: true },
  { id: 2, text: 'Build an app', done: false },
  { id: 3, text: 'Ship to production', done: false },
])

// Reactive theme object — re-computed whenever isDark changes
const theme = computed(() => ({
  bg: isDark.value ? '#1a1a2e' : '#f5f5f7',
  surface: isDark.value ? '#2a2a3e' : '#ffffff',
  text: isDark.value ? '#e0e0ee' : '#1a1a2e',
  accent: isDark.value ? '#16c79a' : '#0a8c6a',
}))

// ── Reactive helpers ───────────────────────────────────────────────────

const todoStats = computed(() => {
  const total = todos.value.length
  const done = todos.value.filter(function (t) { return t.done }).length
  return done + '/' + total + ' done'
})

const toggleTodo = function (id) {
  todos.value = todos.value.map(function (t) {
    return t.id === id ? { id: t.id, text: t.text, done: !t.done } : t
  })
}

// ── Counter Section ─────────────────────────────────────────────────────

var CounterSection = function () {
  return view({
    style: function () { return {
      backgroundColor: theme.value.surface,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      alignItems: 'center',
    } },
    children: [
      text({
        style: { fontSize: 14, color: '#888', marginBottom: 4 },
        children: 'REACTIVE COUNTER',
      }),
      text({
        style: function () { return {
          fontSize: 48,
          fontWeight: 'bold',
          color: theme.value.accent,
          marginVertical: 12,
        } },
        children: counter,
      }),
      view({
        style: { flexDirection: 'row' },
        children: [
          touchableOpacity({
            style: {
              backgroundColor: '#16c79a',
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
              marginRight: 12,
            },
            onTouchEnd: function () { counter.value++ },
            children: text({
              style: { color: 'white', fontSize: 18, fontWeight: 'bold' },
              children: '+',
            }),
          }),
          touchableOpacity({
            style: {
              backgroundColor: '#e74c3c',
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
            },
            onTouchEnd: function () { counter.value-- },
            children: text({
              style: { color: 'white', fontSize: 18, fontWeight: 'bold' },
              children: '\u2212',
            }),
          }),
        ],
      }),
    ],
  })
}

// ── Todo Section ────────────────────────────────────────────────────────

var TodoSection = function () {
  return view({
    style: function () { return {
      backgroundColor: theme.value.surface,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
    } },
    children: [
      text({
        style: { fontSize: 14, color: '#888', marginBottom: 4 },
        children: 'TODO LIST',
      }),
      text({
        style: function () { return { fontSize: 12, color: theme.value.accent, marginBottom: 12 } },
        children: todoStats,
      }),
      each(todos, function (todo) {
        return view({
          style: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#eee',
          },
          children: [
            touchableOpacity({
              onPress: function () { toggleTodo(todo.id) },
              style: {
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: todo.done ? '#4CAF50' : '#ccc',
                backgroundColor: todo.done ? '#4CAF50' : 'transparent',
                marginRight: 12,
                justifyContent: 'center',
                alignItems: 'center',
              },
              children: text({
                style: { color: 'white', fontSize: 14, fontWeight: 'bold' },
                children: todo.done ? '\u2713' : '',
              }),
            }),
            text({
              style: function () { return {
                flex: 1,
                fontSize: 16,
                color: todo.done ? '#999' : theme.value.text,
                textDecorationLine: todo.done ? 'line-through' : 'none',
              } },
              children: todo.text,
            }),
          ],
        })
      }),
    ],
  })
}

// ── Conditional Section ────────────────────────────────────────────────

var ConditionalSection = function () {
  return view({
    style: { marginBottom: 16 },
    children: when({
      condition: counter,
      then: function () {
        return view({
          style: function () { return {
            backgroundColor: theme.value.surface,
            borderRadius: 12,
            padding: 20,
            alignItems: 'center',
          } },
          children: when({
            condition: function () { return counter.value > 5 },
            then: function () {
              return text({
                style: { fontSize: 16, color: '#e74c3c', fontWeight: 'bold' },
                children: '\u26A0\uFE0F Counter is high!',
              })
            },
            else: function () {
              return text({
                style: function () { return { fontSize: 16, color: theme.value.accent } },
                children: 'Counter is ' + counter.value,
              })
            },
          }),
        })
      },
    }),
  })
}

// ── Theme Toggle ───────────────────────────────────────────────────────

var ThemeToggle = function () {
  return view({
    children: [
      touchableOpacity({
        style: function () { return {
          backgroundColor: theme.value.accent,
          paddingVertical: 14,
          borderRadius: 8,
          alignItems: 'center',
          marginBottom: 16,
        } },
        onTouchEnd: function () { isDark.value = !isDark.value },
        children: text({
          style: { color: 'white', fontSize: 16, fontWeight: 'bold' },
          children: function () { return isDark.value ? '\u2600\uFE0F Light Mode' : '\uD83C\uDF19 Dark Mode' },
        }),
      }),
    ],
  })
}

// ── App ─────────────────────────────────────────────────────────────────

export var App = function () {
  return view({
    style: function () { return {
      flex: 1,
      backgroundColor: theme.value.bg,
      paddingTop: 60,
      paddingHorizontal: 20,
    } },
    children: [
      text({
        style: function () { return {
          fontSize: 28,
          fontWeight: 'bold',
          color: theme.value.text,
          marginBottom: 20,
        } },
        children: '\u26A1 Rasen RN',
      }),
      CounterSection(),
      TodoSection(),
      ConditionalSection(),
      ThemeToggle(),
    ],
  })
}
