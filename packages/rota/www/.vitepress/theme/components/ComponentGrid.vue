<script setup lang="ts">
/**
 * Landing-page grid of component links.
 *
 * Reads the demo registry so a new demo shows up here without editing markup;
 * entries without a page yet are still listed, they just point at the index.
 */
import { demos } from '../../../demos/registry'

const skip = new Set(['sign-in-form'])
const entries = Object.entries(demos)
  .filter(([id]) => !skip.has(id))
  .map(([id, demo]) => ({ id, title: demo.title }))
</script>

<template>
  <div class="rota-grid">
    <a v-for="entry in entries" :key="entry.id" class="rota-grid__item" :href="`/components/${entry.id}`">
      {{ entry.title }}
    </a>
  </div>
</template>

<style scoped>
.rota-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.6rem;
  margin: 1.5rem 0;
}

.rota-grid__item {
  display: block;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1) !important;
  font-size: 0.9rem;
  font-weight: 500;
  text-decoration: none !important;
  transition: border-color 120ms ease, transform 120ms ease;
}

.rota-grid__item:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
}
</style>
