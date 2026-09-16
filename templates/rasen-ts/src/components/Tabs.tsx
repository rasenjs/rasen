import type { Signal } from 'signal-polyfill'
import { com, each } from '@rasenjs/core'

interface Tab {
  id: string
  label: string
}

interface TabsProps {
  tabs: Tab[]
  activeTab: Signal.State<string>
}

export const Tabs = com((props: TabsProps) => {
  const { tabs, activeTab } = props

  return (
    <div class="tabs">
      {each(tabs, (tab) => (
        <button
          class={() => `tab ${activeTab.get() === tab.id ? 'active' : ''}`}
          onClick={() => activeTab.set(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
})
