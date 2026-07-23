<script setup lang="ts">
interface TodoProps {
  todo: { id: number; label: string; done: boolean }
  onToggle: () => void
  onRemove: () => void
}
defineProps<TodoProps>()
</script>

<template>
  <View class="flex-row items-center mb-2" :style="[{ backgroundColor: '#1a1a2e', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16 }, todo.done ? { opacity: 0.4 } : {}]">
    <View :style="{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#16c79a', marginRight: 12, justifyContent: 'center', alignItems: 'center' }" @touchEnd="onToggle">
      <Text v-if="todo.done" class="font-bold" :style="{ fontSize: 16, color: '#16c79a' }">✓</Text>
    </View>
    <Text class="flex-1" :style="{ fontSize: 16, color: '#e0e0ee' }">{{ todo.label }}</Text>
    <View :style="{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#2a2a3e', justifyContent: 'center', alignItems: 'center', marginLeft: 8 }" @touchEnd="onRemove">
      <Text :style="{ fontSize: 14, color: '#e94560' }">✕</Text>
    </View>
  </View>
</template>
