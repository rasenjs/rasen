/**
 * @rasenjs/react-native example — App component (TSX)
 *
 * JSX syntax via automatic runtime. Babel compiles to `import { jsx } from 'react/jsx-runtime'`,
 * which Metro resolves to `@rasenjs/react-native/jsx-runtime` via extraNodeModules.
 */

import { View, Text, TouchableOpacity, Pressable, Button, FlatList, each, when } from '@rasenjs/react-native'
import { ref, computed } from '@vue/reactivity'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'

useReactiveRuntime()

const counter = ref(0)
const isDark = ref(false)

const todos = ref([
  { id: 1, text: 'Learn Rasen', done: true },
  { id: 2, text: 'Build an app', done: false },
  { id: 3, text: 'Ship to production', done: false },
])

const feed = ref([
  { id: 1, title: 'Pressable with pressed state', body: 'Style as a function of { pressed }' },
  { id: 2, title: 'Button component', body: 'Native-style button with title' },
  { id: 3, title: 'FlatList', body: 'Reactive scrollable list' },
  { id: 4, title: 'KeyboardAvoidingView', body: 'Avoids the on-screen keyboard' },
])

const theme = computed(() => ({
  bg: isDark.value ? '#1a1a2e' : '#f5f5f7',
  surface: isDark.value ? '#2a2a3e' : '#ffffff',
  text: isDark.value ? '#e0e0ee' : '#1a1a2e',
  accent: isDark.value ? '#16c79a' : '#0a8c6a',
}))

const todoStats = computed(() => {
  const total = todos.value.length
  const done = todos.value.filter(t => t.done).length
  return done + '/' + total + ' done'
})

const toggleTodo = (id: number) => {
  todos.value = todos.value.map(t =>
    t.id === id ? { ...t, done: !t.done } : t
  )
}

const CounterSection = () => (
  <View style={() => ({
    backgroundColor: theme.value.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  })}>
    <Text style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>
      REACTIVE COUNTER
    </Text>
    <Text style={() => ({
      fontSize: 48,
      fontWeight: 'bold',
      color: theme.value.accent,
      marginVertical: 12,
    })}>
      {counter}
    </Text>
    <View style={{ flexDirection: 'row' }}>
      <TouchableOpacity
        style={{ backgroundColor: '#16c79a', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginRight: 12 }}
        onTouchEnd={() => { counter.value++ }}
      >
        <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>+</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={{ backgroundColor: '#e74c3c', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
        onTouchEnd={() => { counter.value-- }}
      >
        <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{'\u2212'}</Text>
      </TouchableOpacity>
    </View>
  </View>
)

const TodoSection = () => (
  <View style={() => ({
    backgroundColor: theme.value.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  })}>
    <Text style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>TODO LIST</Text>
    <Text style={() => ({ fontSize: 12, color: theme.value.accent, marginBottom: 12 })}>
      {todoStats}
    </Text>
    {each(todos, (todo) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
        <TouchableOpacity
          onPress={() => toggleTodo(todo.id)}
          style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: todo.done ? '#4CAF50' : '#ccc', backgroundColor: todo.done ? '#4CAF50' : 'transparent', marginRight: 12, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>
            {todo.done ? '\u2713' : ''}
          </Text>
        </TouchableOpacity>
        <Text style={() => ({ flex: 1, fontSize: 16, color: todo.done ? '#999' : theme.value.text, textDecorationLine: todo.done ? 'line-through' : 'none' })}>
          {todo.text}
        </Text>
      </View>
    ))}
  </View>
)

const ConditionalSection = () => (
  <View style={{ marginBottom: 16 }}>
    {when({
      condition: () => counter.value > 0,
      then: () => (
        <View style={() => ({ backgroundColor: theme.value.surface, borderRadius: 12, padding: 20, alignItems: 'center' })}>
          {when({
            condition: () => counter.value > 5,
            then: () => <Text style={{ fontSize: 16, color: '#e74c3c', fontWeight: 'bold' }}>{'\u26A0\uFE0F Counter is high!'}</Text>,
            else: () => <Text style={() => ({ fontSize: 16, color: theme.value.accent })}>Counter is {counter.value}</Text>,
          })}
        </View>
      ),
    })}
  </View>
)

const ThemeToggle = () => (
  <Button
    title={isDark.value ? '\u2600\uFE0F Light Mode' : '\uD83C\uDF19 Dark Mode'}
    color={theme.value.accent}
    onPress={() => { isDark.value = !isDark.value }}
    style={{ marginBottom: 16 }}
  />
)

const PressableSection = () => (
  <View style={{ marginBottom: 16 }}>
    <Text style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>PRESSABLE</Text>
    <Pressable
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.value.accent : theme.value.surface,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
      onPress={() => { counter.value += 10 }}
    >
      <Text style={() => ({ color: theme.value.text, fontSize: 16, fontWeight: 'bold' })}>
        {() => `Pressable (+10) — counter: ${counter.value}`}
      </Text>
    </Pressable>
  </View>
)

const FeedSection = () => (
  <View style={{ marginBottom: 16 }}>
    <Text style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>FLATLIST</Text>
    <FlatList
      data={feed}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.value.text }}>{item.title}</Text>
          <Text style={{ fontSize: 13, color: '#888' }}>{item.body}</Text>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
      ListEmptyComponent={() => <Text style={{ color: '#888' }}>No items</Text>}
    />
  </View>
)

export const App = () => (
  <View style={() => ({ flex: 1, backgroundColor: theme.value.bg, paddingTop: 60, paddingHorizontal: 20 })}>
    <Text style={() => ({ fontSize: 28, fontWeight: 'bold', color: theme.value.text, marginBottom: 20 })}>
      {'\u26A1 Rasen RN'}
    </Text>
    <CounterSection />
    <TodoSection />
    <ConditionalSection />
    <PressableSection />
    <FeedSection />
    <ThemeToggle />
  </View>
)
