<script setup lang="ts">
import { ref } from 'vue'
import { RouterView, useRouter } from 'vue-router'

const router = useRouter()
const currentPath = ref('/')

router.afterEach((to) => {
  currentPath.value = to.path
})
</script>

<template>
  <View class="flex-1" :style="{ backgroundColor: '#0f0f1a' }">
    <!-- Navigation bar -->
    <View :style="{ paddingTop: 60, paddingHorizontal: 16, backgroundColor: '#16162a', paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }">
      <!-- Home link -->
      <View :style="{ marginRight: 24 }" @touchEnd="router.push('/')">
        <Text :style="{ color: currentPath === '/' ? '#16c79a' : '#e0e0ee', fontSize: 18, fontWeight: 'bold' }">Home</Text>
        <View v-if="currentPath === '/'" :style="{ height: 2, backgroundColor: '#16c79a', borderRadius: 1, marginTop: 4 }" />
      </View>
      <!-- About link -->
      <View @touchEnd="router.push('/about')">
        <Text :style="{ color: currentPath === '/about' ? '#16c79a' : '#e0e0ee', fontSize: 18, fontWeight: 'bold' }">About</Text>
        <View v-if="currentPath === '/about'" :style="{ height: 2, backgroundColor: '#16c79a', borderRadius: 1, marginTop: 4 }" />
      </View>
    </View>

    <!-- Page content -->
    <RouterView />
  </View>
</template>
