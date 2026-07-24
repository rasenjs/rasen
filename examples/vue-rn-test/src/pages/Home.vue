<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useCssModule } from '@rasenjs/vue-rn'
import TodoItem from '../../TodoItem.vue'

const draft = ref('')
const nextId = ref(1)
type TodoItem_t = { id: number; label: string; done: boolean }
const todos: TodoItem_t[] = reactive([])

const total = computed(() => todos.length)
const completed = computed(() => todos.filter(t => t.done).length)
const remaining = computed(() => total.value - completed.value)

// Test useCssModule() — the $style object is a Record<string, style-object>
const cssStyle = useCssModule()
const cardBg = computed(() => cssStyle?.card?.backgroundColor ?? '#1a1a2e')

function onInputChange(e: any) {
  draft.value = e?.text ?? e ?? ''
}

function addTodo() {
  const text = draft.value.trim()
  if (!text) return
  todos.push({ id: nextId.value++, label: text, done: false })
  draft.value = ''
}

function toggle(todo: TodoItem_t) { todo.done = !todo.done }

function remove(todo: TodoItem_t) {
  const idx = todos.findIndex(t => t.id === todo.id)
  if (idx !== -1) todos.splice(idx, 1)
}

function clearDone() {
  for (let i = todos.length - 1; i >= 0; i--)
    if (todos[i].done) todos.splice(i, 1)
}
</script>

<template>
  <View :style="{ flex: 1, paddingHorizontal: 16 }">
    <Text :style="$style.title">Vue RN Todos ✨ (style module)</Text>

    <!-- Test useCssModule() — cardBg is read from the script, not $style -->
    <View :style="{ backgroundColor: cardBg, borderRadius: 10, padding: 16, marginBottom: 16 }">
      <Text :style="{ fontSize: 14, color: '#b0b0c0', textAlign: 'center' }">useCssModule() ✅ — card bg from script</Text>
    </View>

    <!-- Input row -->
    <View class="flex-row mb-4">
      <TextInput
        class="flex-1"
        :style="{ backgroundColor: '#1a1a2e', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#e0e0ee', height: 48 }"
        :text="draft"
        placeholder="Add todo..."
        placeholderTextColor="#666"
        :editable="true"
        @change="onInputChange"
      />
      <View class="justify-center" :style="{ backgroundColor: '#16c79a', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, height: 48, marginLeft: 8 }" @touchEnd="addTodo">
        <Text class="font-bold" :style="{ fontSize: 16, color: '#ffffff' }">Add</Text>
      </View>
    </View>

    <!-- Stats -->
    <View class="flex-row justify-between items-center mb-4">
      <Text :style="{ fontSize: 14, color: '#888899' }">{{ remaining }} of {{ todos.length }} remaining</Text>
      <View v-if="completed > 0" :style="{ backgroundColor: '#2a2a3e', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 6 }" @touchEnd="clearDone">
        <Text :style="{ fontSize: 13, color: '#e94560' }">Clear done</Text>
      </View>
    </View>

    <!-- List -->
    <Text v-if="todos.length === 0" class="pt-16" :style="{ fontSize: 16, color: '#555566', textAlign: 'center' }">No todos yet. Add one above!</Text>
    <View v-else class="flex-1">
      <TodoItem
        v-for="todo in todos"
        :key="todo.id"
        :todo="todo"
        :onToggle="() => toggle(todo)"
        :onRemove="() => remove(todo)"
      />
    </View>
  </View>
</template>

<style module>
.title {
  color: #16c79a;
  font-size: 22;
  font-weight: bold;
  text-align: center;
  padding-top: 16;
  margin-bottom: 20;
}
.card {
  background-color: #1a1a2e;
  border-radius: 10;
  padding: 16;
}
</style>
