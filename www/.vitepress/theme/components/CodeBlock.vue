<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    code: string
    language?: string
    title?: string
    showLineNumbers?: boolean
  }>(),
  {
    language: 'typescript',
    showLineNumbers: true
  }
)

// Clean up the code - remove trailing newlines
const cleanCode = computed(() => props.code.trim())
</script>

<template>
  <div class="code-block">
    <div v-if="title" class="code-block-title">{{ title }}</div>
    <div class="language-typescript vp-adaptive-theme">
      <button title="Copy Code" class="copy"></button>
      <span class="lang">{{ language }}</span>
      <pre
        class="shiki shiki-themes github-light github-dark vp-code"
        :class="{ 'line-numbers-mode': showLineNumbers }"
      ><code>{{ cleanCode }}</code></pre>
    </div>
  </div>
</template>

<style scoped>
.code-block {
  margin: 16px 0;
}

.code-block-title {
  background: var(--vp-code-tab-bg);
  border-radius: 8px 8px 0 0;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-code-tab-text-color);
  border-bottom: 1px solid var(--vp-c-divider);
}

.code-block-title + div[class*='language-'] {
  border-radius: 0 0 8px 8px;
}
</style>
