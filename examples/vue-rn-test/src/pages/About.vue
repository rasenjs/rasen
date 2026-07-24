<script setup lang="ts">
</script>

<template>
  <View class="flex-1" :style="{ padding: 16 }">
    <Text :style="{ fontSize: 24, color: '#e0e0ee', fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }">About</Text>
    <View :style="{ backgroundColor: '#1a1a2e', borderRadius: 10, padding: 16 }">
      <Text :style="{ fontSize: 16, color: '#b0b0c0', lineHeight: 24 }">
        This is a demo of @rasenjs/vue-rn with vue-router support.
      </Text>
      <Text :style="{ fontSize: 16, color: '#b0b0c0', lineHeight: 24, marginTop: 12 }">
        Built with Vue 3 + TypeScript + Tailwind CSS + HMR 🔥
      </Text>
    </View>
  </View>
</template>
