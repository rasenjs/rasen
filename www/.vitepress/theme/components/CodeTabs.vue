<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    examples: Record<string, { label: string; code: string; language?: string }>
  }>(),
  {}
)

const tabs = computed(() =>
  Object.entries(props.examples).map(([key, value]) => ({
    key,
    label: value.label,
    code: value.code.trim(),
    language: value.language || 'typescript'
  }))
)

const activeTab = ref(tabs.value[0]?.key || '')
const activeExample = computed(() => {
  const example = props.examples[activeTab.value]
  return example ? { ...example, code: example.code.trim() } : null
})
</script>

<template>
  <div class="code-tabs">
    <!-- Tab buttons -->
    <div class="tab-buttons">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['tab-button', { active: activeTab === tab.key }]"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Code content -->
    <div v-if="activeExample" class="code-content">
      <div :class="`language-${activeExample.language} vp-adaptive-theme`">
        <button title="Copy Code" class="copy"></button>
        <span class="lang">{{ activeExample.language }}</span>
        <pre
          class="shiki shiki-themes github-light github-dark vp-code"
        ><code>{{ activeExample.code }}</code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.code-tabs {
  margin: 16px 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
}

.tab-buttons {
  display: flex;
  gap: 0;
  background: var(--vp-code-tab-bg);
  border-bottom: 1px solid var(--vp-c-divider);
  overflow-x: auto;
}

.tab-button {
  padding: 10px 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--vp-c-text-2);
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
}

.tab-button:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}

.tab-button.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
}

.code-content :deep(div[class*='language-']) {
  margin: 0;
  border-radius: 0;
}
</style>
