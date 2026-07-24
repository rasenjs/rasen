<script setup lang="ts">
import { RouterView } from 'vue-router'
import { RouterLink } from '@rasenjs/vue-rn-router-components'
</script>

<template>
  <View class="flex-1" :style="{ backgroundColor: '#0f0f1a' }">
    <!-- Navigation bar -->
    <View :style="{ paddingTop: 60, paddingHorizontal: 16, backgroundColor: '#16162a', paddingBottom: 12, flexDirection: 'row' }">
      <RouterLink to="/">
        <Text :style="{ color: '#e0e0ee', fontSize: 18, fontWeight: 'bold', marginRight: 24 }">Home</Text>
      </RouterLink>
      <RouterLink to="/about">
        <Text :style="{ color: '#e0e0ee', fontSize: 18, fontWeight: 'bold' }">About</Text>
      </RouterLink>
    </View>

    <!-- Page content -->
    <RouterView />
  </View>
</template>
