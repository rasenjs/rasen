<script setup lang="ts">
import { RouterView } from 'vue-router'
import { RouterLink } from '@rasenjs/vue-rn/router'
</script>

<template>
  <View class="flex-1" :style="{ backgroundColor: '#0f0f1a' }">
    <!-- Navigation bar — custom slot for active state styling -->
    <View :style="{ paddingTop: 60, paddingHorizontal: 16, backgroundColor: '#16162a', paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }">
      <RouterLink v-slot="{ isActive, navigate }" to="/" custom>
        <View :style="{ marginRight: 24 }" @touchEnd="navigate">
          <Text :style="{ color: isActive ? '#16c79a' : '#e0e0ee', fontSize: 18, fontWeight: 'bold' }">Home</Text>
          <View v-if="isActive" :style="{ height: 2, backgroundColor: '#16c79a', borderRadius: 1, marginTop: 4 }" />
        </View>
      </RouterLink>
      <RouterLink v-slot="{ isActive, navigate }" to="/about" custom>
        <View @touchEnd="navigate">
          <Text :style="{ color: isActive ? '#16c79a' : '#e0e0ee', fontSize: 18, fontWeight: 'bold' }">About</Text>
          <View v-if="isActive" :style="{ height: 2, backgroundColor: '#16c79a', borderRadius: 1, marginTop: 4 }" />
        </View>
      </RouterLink>
    </View>

    <!-- Basic text link — text auto-wrapped in <Text> by RouterLink -->
    <View class="pt-8 px-4">
      <RouterLink to="/about">Go to About</RouterLink>
    </View>

    <!-- Page content -->
    <RouterView />
  </View>
</template>
