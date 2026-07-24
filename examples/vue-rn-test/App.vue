<script setup lang="ts">
import { ref } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { RouterLink } from '@rasenjs/vue-rn/router'

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
      <!-- Home -->
      <RouterLink v-slot="{ navigate }" to="/" custom>
        <View :style="{ marginRight: 24 }" @touchEnd="navigate">
          <Text :style="{ color: currentPath === '/' ? '#16c79a' : '#e0e0ee', fontSize: 18, fontWeight: 'bold' }">Home</Text>
          <View v-if="currentPath === '/'" :style="{ height: 2, backgroundColor: '#16c79a', borderRadius: 1, marginTop: 4 }" />
        </View>
      </RouterLink>
      <!-- About -->
      <RouterLink v-slot="{ navigate }" to="/about" custom>
        <View @touchEnd="navigate">
          <Text :style="{ color: currentPath === '/about' ? '#16c79a' : '#e0e0ee', fontSize: 18, fontWeight: 'bold' }">About</Text>
          <View v-if="currentPath === '/about'" :style="{ height: 2, backgroundColor: '#16c79a', borderRadius: 1, marginTop: 4 }" />
        </View>
      </RouterLink>
    </View>

    <!-- Go to About link — bare RouterLink (style forwarded to inner Text) -->
    <RouterLink to="/about" :style="{ color: '#888899', fontSize: 16, paddingTop: 16, paddingHorizontal: 16 }">
      Go to About → 
    </RouterLink>

    <!-- Page content -->
    <RouterView />
  </View>
</template>
