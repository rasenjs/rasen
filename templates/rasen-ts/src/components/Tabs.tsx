/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { computed } from '@rasenjs/reactive-signals'
import type { Ref } from '@rasenjs/core'
import { each } from '@rasenjs/core'

interface Tab {
  id: string
  label: string
}

interface TabsProps {
  tabs: Tab[]
  activeTab: Ref<string>
}

export const Tabs = (props: TabsProps) => {
  const { tabs, activeTab } = props

  return (
    <div class="tabs">
      {each(() => tabs, (tab) => (
        <button
          class={computed(() => `tab ${activeTab.value === tab.id ? 'active' : ''}`)}
          onClick={() => activeTab.value = tab.id}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
