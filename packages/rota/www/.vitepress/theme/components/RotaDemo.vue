<script setup lang="ts">
/**
 * Mounts one live demo into a stage element.
 *
 * The demos are plain rasen mountables, so this component is the only bridge
 * between the site (Vue/VitePress) and the library: set the reactive runtime,
 * mount on the client, unmount with the component.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { mount } from '@rasenjs/dom'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { demos } from '../../../demos/registry'

const props = defineProps<{ name: string }>()

const host = ref<HTMLElement | null>(null)
let unmount: (() => void) | undefined

const demo = demos[props.name]

onMounted(() => {
  useReactiveRuntime()
  if (!demo || !host.value) return
  unmount = mount(demo.build(), host.value)
})

onBeforeUnmount(() => unmount?.())
</script>

<template>
  <div class="rota-demo">
    <div v-if="demo" class="rota-demo__head">
      <span class="rota-demo__title">{{ demo.title }}</span>
      <span class="rota-demo__desc">{{ demo.description }}</span>
    </div>
    <div ref="host" class="rota-demo__stage" />
  </div>
</template>
