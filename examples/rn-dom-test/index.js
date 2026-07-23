const { AppRegistry } = require('react-native')
const { RNDocument } = require('@rasenjs/rn-dom')
const { name: appName } = require('./app.json')

// Bring every native component this app uses into Fabric's view config
// registry. Each line below uses one of two RN-standard side effects:
//
//   • `require('react-native').<X>` — touches the public getter, which
//     side-effect-imports the underlying NativeComponent module. Used
//     when the high-level React component module is reachable from
//     the public package (View, Image, Pressable, …).
//
//   • `require('react-native/Libraries/.../XNativeComponent')` — the
//     direct path, used when the high-level module defers its import
//     to inside a render body (metro inline-require never fires for us
//     since we never mount <Text>/<ScrollView>/<…>). Add lines below
//     for every native component this app creates.
//
//   • `requireNativeComponent('RCTX')` from 'react-native' is the
//     third option. It is functionally equivalent to the direct path
//     above but routes through the public API.
require('react-native').View        // → RCTView
require('react-native/Libraries/Text/TextNativeComponent')   // → RCTText
require('react-native/Libraries/Image/ImageViewNativeComponent')   // → RCTImageView

if (typeof window === 'undefined') global.window = global
if (typeof performance === 'undefined') global.performance = { now: () => Date.now() }

AppRegistry.registerRunnable(appName, ({ rootTag }) => {
  const doc = RNDocument.getOrCreate(rootTag)
  const body = doc.body

  // ---------------------------------------------------------------------------
  // Theme — switches between two palettes
  // ---------------------------------------------------------------------------
  const THEMES = {
    dark: {
      bg: '#0f0f1a',
      surface: '#1a1a2e',
      surfaceAlt: '#2a2a3e',
      text: '#e0e0ee',
      textMuted: '#888899',
      textDim: '#666688',
      accent: '#16c79a',
      danger: '#e94560',
      border: '#3a3a4e',
    },
    light: {
      bg: '#f5f5f7',
      surface: '#ffffff',
      surfaceAlt: '#eeeeef',
      text: '#1a1a2e',
      textMuted: '#666677',
      textDim: '#999999',
      accent: '#0a8c6a',
      danger: '#c8253a',
      border: '#d0d0d5',
    },
  }
  let themeName = 'dark'
  const t = () => THEMES[themeName]

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const state = {
    activeTab: 'home',          // 'home' | 'list' | 'settings'
    items: [],                  // { id, label, done }
    nextId: 1,
    counter: 0,
  }

  // ---------------------------------------------------------------------------
  // Root layout
  // ---------------------------------------------------------------------------
  const root = doc.createElement('View')
  root.setAttribute('style', ({
    flex: 1,
    backgroundColor: t().bg,
    paddingTop: 60,
    paddingHorizontal: 20,
  }))

  // Header
  const header = doc.createElement('View')
  header.setAttribute('style', { marginBottom: 24 })
  const headerTitle = doc.createElement('Text')
  headerTitle.setAttribute('style', ({
    fontSize: 28, color: t().text, fontWeight: 'bold', marginBottom: 4,
  }))
  headerTitle.appendChild(doc.createTextNode('rn-dom Complex Demo'))
  const headerSub = doc.createElement('Text')
  headerSub.setAttribute('style', ({
    fontSize: 13, color: t().textMuted,
  }))
  headerSub.appendChild(doc.createTextNode('Tabs · List · Theme — no React, no JSX'))
  header.appendChild(headerTitle)
  header.appendChild(headerSub)
  root.appendChild(header)

  // ---------------------------------------------------------------------------
  // Tab bar — 3 tabs
  // ---------------------------------------------------------------------------
  const TABS = [
    { id: 'home',     label: 'Home' },
    { id: 'list',     label: 'List' },
    { id: 'settings', label: 'Settings' },
  ]
  const tabBar = doc.createElement('View')
  tabBar.setAttribute('style', ({
    flexDirection: 'row',
    backgroundColor: t().surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: t().border,
  }))
  const tabNodes = {}
  TABS.forEach((tab) => {
    const tabNode = doc.createElement('View', {
      onTouchEnd: () => {
        if (state.activeTab === tab.id) return
        console.log('[demo] switch tab ->', tab.id)
        state.activeTab = tab.id
        renderTabs()
        renderContent()
        body.completeFabric()
      },
    })
    tabNode.setAttribute('style', ({
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 8,
      backgroundColor: state.activeTab === tab.id ? t().accent : 'transparent',
    }))
    const tabLabel = doc.createElement('Text')
    tabLabel.setAttribute('style', ({
      fontSize: 14,
      fontWeight: 'bold',
      color: state.activeTab === tab.id ? '#ffffff' : t().textMuted,
    }))
    tabLabel.appendChild(doc.createTextNode(tab.label))
    tabNode.appendChild(tabLabel)
    tabBar.appendChild(tabNode)
    tabNodes[tab.id] = { container: tabNode, label: tabLabel }
  })
  function renderTabs() {
    TABS.forEach((tab) => {
      const isActive = state.activeTab === tab.id
      tabNodes[tab.id].container.setAttribute('style', ({
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
        backgroundColor: isActive ? t().accent : 'transparent',
      }))
      tabNodes[tab.id].label.setAttribute('style', ({
        fontSize: 14,
        fontWeight: 'bold',
        color: isActive ? '#ffffff' : t().textMuted,
      }))
    })
  }
  root.appendChild(tabBar)

  // ---------------------------------------------------------------------------
  // Content area — swapped based on activeTab
  // ---------------------------------------------------------------------------
  const contentArea = doc.createElement('View')
  contentArea.setAttribute('style', ({ flex: 1, width: '100%' }))
  root.appendChild(contentArea)

  // ===========================================================================
  // HOME TAB
  // ===========================================================================
  const homeView = doc.createElement('View', {
    style: { flex: 1 },
  })

  const homeCard = doc.createElement('View')
  homeCard.setAttribute('style', ({
    backgroundColor: t().surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: t().border,
  }))
  const homeTitle = doc.createElement('Text')
  homeTitle.setAttribute('style', ({
    fontSize: 18, fontWeight: 'bold', color: t().text, marginBottom: 8,
  }))
  homeTitle.appendChild(doc.createTextNode('Welcome 👋'))
  const homeBody = doc.createElement('Text')
  homeBody.setAttribute('style', ({ fontSize: 14, color: t().textMuted, lineHeight: 20 }))
  homeBody.appendChild(doc.createTextNode(
    'This UI is built directly against Fabric, without React. Every node is ' +
    'a DOM-like element created via doc.createElement, every event handler is ' +
    'attached as a prop, and updates flush through body.completeFabric().'
  ))
  homeCard.appendChild(homeTitle)
  homeCard.appendChild(homeBody)
  homeView.appendChild(homeCard)

  // Counter card
  const counterCard = doc.createElement('View')
  counterCard.setAttribute('style', ({
    backgroundColor: t().surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: t().border,
    alignItems: 'center',
  }))
  const counterLabel = doc.createElement('Text')
  counterLabel.setAttribute('style', ({
    fontSize: 13, color: t().textMuted, marginBottom: 8,
  }))
  counterLabel.appendChild(doc.createTextNode('Counter'))
  const counterValue = doc.createElement('Text')
  counterValue.setAttribute('style', ({
    fontSize: 48, fontWeight: 'bold', color: t().accent, marginBottom: 12,
  }))
  counterValue.appendChild(doc.createTextNode('0'))
  const counterRow = doc.createElement('View')
  counterRow.setAttribute('style', { flexDirection: 'row', gap: 8 })
  const mkBtn = (label, onPress, color) => {
    // Pass style in the initial props so the first createNode payload
    // already has backgroundColor — otherwise a later cloneNodeWithNewProps
    // routes the (already processColor-rotated) int through Fabric's
    // processColor again, which shifts the bytes and the color lands as
    // transparent.
    const b = doc.createElement('View', {
      onTouchEnd: onPress,
      style: {
        backgroundColor: color,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        minWidth: 60,
        alignItems: 'center',
      },
    })
    const tx = doc.createElement('Text')
    tx.setAttribute('style', { color: '#ffffff', fontWeight: 'bold', fontSize: 16 })
    tx.appendChild(doc.createTextNode(label))
    b.appendChild(tx)
    return b
  }
  counterRow.appendChild(mkBtn('−', () => {
    state.counter--
    refreshCounter()
    body.completeFabric()
  }, t().danger))
  counterRow.appendChild(mkBtn('+', () => {
    state.counter++
    refreshCounter()
    body.completeFabric()
  }, t().accent))
  counterRow.appendChild(mkBtn('0', () => {
    state.counter = 0
    refreshCounter()
    body.completeFabric()
  }, t().textDim))
  function refreshCounter() {
    counterValue.removeChild(counterValue.childNodes[0])
    counterValue.appendChild(doc.createTextNode(String(state.counter)))
  }
  counterCard.appendChild(counterLabel)
  counterCard.appendChild(counterValue)
  counterCard.appendChild(counterRow)
  homeView.appendChild(counterCard)

  // ===========================================================================
  // LIST TAB
  // ===========================================================================
  const listView = doc.createElement('View')

  const listHeader = doc.createElement('View')
  listHeader.setAttribute('style', ({
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  }))
  const listTitle = doc.createElement('Text')
  listTitle.setAttribute('style', ({
    fontSize: 16, fontWeight: 'bold', color: t().text,
  }))
  listTitle.appendChild(doc.createTextNode('Items'))
  const listCount = doc.createElement('Text')
  listCount.setAttribute('style', ({ fontSize: 13, color: t().textMuted }))
  listCount.appendChild(doc.createTextNode('0 items'))
  listHeader.appendChild(listTitle)
  listHeader.appendChild(listCount)
  listView.appendChild(listHeader)

  // Input row — taps add a new item with a generated label
  const addRow = doc.createElement('View', {
    onTouchEnd: () => {
      const id = state.nextId++
      state.items.push({ id, label: `Task #${id}`, done: false })
      renderItems()
      body.completeFabric()
    },
  })
  addRow.setAttribute('style', ({
    backgroundColor: t().accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  }))
  const addRowText = doc.createElement('Text')
  addRowText.setAttribute('style', { color: '#ffffff', fontWeight: 'bold', fontSize: 15 })
  addRowText.appendChild(doc.createTextNode('+ Add task'))
  addRow.appendChild(addRowText)
  listView.appendChild(addRow)

  // Item list container (children are individual rows)
  const itemList = doc.createElement('View')
  itemList.setAttribute('style', ({ width: '100%' }))
  listView.appendChild(itemList)

  const emptyList = doc.createElement('Text')
  emptyList.setAttribute('style', ({
    fontSize: 14, color: t().textDim, textAlign: 'center', paddingTop: 24,
  }))
  emptyList.appendChild(doc.createTextNode('No tasks yet — tap "Add task" above.'))

  // We track DOM nodes per item so updates are surgical.
  const itemNodes = new Map()  // id -> { row, checkbox, label, remove }

  function renderItems() {
    // Drop nodes for items that no longer exist
    for (const id of itemNodes.keys()) {
      if (!state.items.find((it) => it.id === id)) {
        const n = itemNodes.get(id)
        itemList.removeChild(n.row)
        itemNodes.delete(id)
      }
    }
    // Update existing items and append new ones in state order. We iterate
    // state.items in order and append only when the DOM hasn't seen this id
    // yet — appending an already-appended node is a no-op in the DOM but
    // was previously triggering "view already has a parent" in Fabric's
    // mount layer. Removal + re-appending on reorder isn't needed because
    // state.order already drives append order.
    state.items.forEach((it) => {
      if (!itemNodes.has(it.id)) {
        itemNodes.set(it.id, createItemNode(it))
        itemList.appendChild(itemNodes.get(it.id).row)
      } else {
        updateItemNode(itemNodes.get(it.id), it)
      }
    })
    // Show or hide the empty placeholder
    if (state.items.length === 0) {
      if (!itemList.childNodes.includes(emptyList)) itemList.appendChild(emptyList)
    } else {
      if (itemList.childNodes.includes(emptyList)) itemList.removeChild(emptyList)
    }
    // Update header count
    listCount.removeChild(listCount.childNodes[0])
    listCount.appendChild(doc.createTextNode(
      `${state.items.length} item${state.items.length === 1 ? '' : 's'}` +
      ` · ${state.items.filter((i) => i.done).length} done`
    ))
  }

  function createItemNode(it) {
    const row = doc.createElement('View')
    row.setAttribute('style', ({
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t().surface,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: t().border,
    }))

    // Checkbox
    const checkbox = doc.createElement('View', {
      onTouchEnd: () => {
        it.done = !it.done
        renderItems()
        body.completeFabric()
      },
    })
    checkbox.setAttribute('style', ({
      width: 24, height: 24, borderRadius: 6,
      borderWidth: 2,
      borderColor: it.done ? t().accent : t().border,
      backgroundColor: it.done ? t().accent : 'transparent',
      alignItems: 'center', justifyContent: 'center',
      marginRight: 12,
    }))
    const check = doc.createElement('Text')
    check.setAttribute('style', ({ color: '#ffffff', fontSize: 14, fontWeight: 'bold' }))
    check.appendChild(doc.createTextNode(it.done ? '✓' : ''))
    checkbox.appendChild(check)
    row.appendChild(checkbox)
    // Hold a reference to the check Text so we can update its content later
    checkbox._checkText = check

    // Label
    const label = doc.createElement('Text')
    label.setAttribute('style', ({
      flex: 1, fontSize: 15,
      color: it.done ? t().textDim : t().text,
      textDecorationLine: it.done ? 'line-through' : 'none',
    }))
    label.appendChild(doc.createTextNode(it.label))
    row.appendChild(label)

    // Remove
    const remove = doc.createElement('View', {
      onTouchEnd: () => {
        const i = state.items.findIndex((x) => x.id === it.id)
        if (i >= 0) state.items.splice(i, 1)
        renderItems()
        body.completeFabric()
      },
    })
    remove.setAttribute('style', ({
      backgroundColor: t().danger,
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 6,
    }))
    const removeTx = doc.createElement('Text')
    removeTx.setAttribute('style', { color: '#ffffff', fontWeight: 'bold', fontSize: 12 })
    removeTx.appendChild(doc.createTextNode('×'))
    remove.appendChild(removeTx)
    row.appendChild(remove)

    return { row, checkbox, label, remove, checkText: check }
  }

  function updateItemNode(n, it) {
    n.checkbox.setAttribute('style', ({
      width: 24, height: 24, borderRadius: 6,
      borderWidth: 2,
      borderColor: it.done ? t().accent : t().border,
      backgroundColor: it.done ? t().accent : 'transparent',
      alignItems: 'center', justifyContent: 'center',
      marginRight: 12,
    }))
    n.checkbox._checkText.removeChild(n.checkbox._checkText.childNodes[0])
    n.checkbox._checkText.appendChild(doc.createTextNode(it.done ? '✓' : ''))
    n.label.setAttribute('style', ({
      flex: 1, fontSize: 15,
      color: it.done ? t().textDim : t().text,
      textDecorationLine: it.done ? 'line-through' : 'none',
    }))
  }

  // ===========================================================================
  // SETTINGS TAB
  // ===========================================================================
  const settingsView = doc.createElement('View')

  const settingsCard = doc.createElement('View')
  settingsCard.setAttribute('style', ({
    backgroundColor: t().surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: t().border,
  }))
  const settingsTitle = doc.createElement('Text')
  settingsTitle.setAttribute('style', ({
    fontSize: 18, fontWeight: 'bold', color: t().text, marginBottom: 12,
  }))
  settingsTitle.appendChild(doc.createTextNode('Appearance'))
  settingsCard.appendChild(settingsTitle)

  // Theme switcher
  const themeRow = doc.createElement('View')
  themeRow.setAttribute('style', ({
    flexDirection: 'row',
    backgroundColor: t().surfaceAlt,
    borderRadius: 10,
    padding: 4,
  }))
  const themeNodes = {}
  Object.keys(THEMES).forEach((name) => {
    const tn = doc.createElement('View', {
      onTouchEnd: () => {
        if (themeName === name) return
        themeName = name
        // Update the visible accent on the theme row
        Object.keys(THEMES).forEach((n) => {
          const isActive = n === themeName
          themeNodes[n].setAttribute('style', ({
            flex: 1,
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: 6,
            backgroundColor: isActive ? t().accent : 'transparent',
          }))
          themeNodes[n].childNodes[0].setAttribute('style', ({
            fontSize: 14, fontWeight: 'bold',
            color: isActive ? '#ffffff' : t().textMuted,
          }))
        })
        // Repaint theme-dependent style across the whole tree by re-running
        // the per-section refreshers and reapplying root/content backgrounds.
        root.setAttribute('style', ({
          flex: 1,
          backgroundColor: t().bg,
          paddingTop: 60,
          paddingHorizontal: 20,
        }))
        renderTabs()
        renderItems()
        body.completeFabric()
      },
    })
    const isActive = name === themeName
    tn.setAttribute('style', ({
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 6,
      backgroundColor: isActive ? t().accent : 'transparent',
    }))
    const tx = doc.createElement('Text')
    tx.setAttribute('style', ({
      fontSize: 14, fontWeight: 'bold',
      color: isActive ? '#ffffff' : t().textMuted,
    }))
    tx.appendChild(doc.createTextNode(name === 'dark' ? 'Dark' : 'Light'))
    tn.appendChild(tx)
    themeNodes[name] = tn
    themeRow.appendChild(tn)
  })
  settingsCard.appendChild(themeRow)
  settingsView.appendChild(settingsCard)

  // Info card
  const infoCard = doc.createElement('View')
  infoCard.setAttribute('style', ({
    backgroundColor: t().surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: t().border,
  }))
  const infoTitle = doc.createElement('Text')
  infoTitle.setAttribute('style', ({
    fontSize: 16, fontWeight: 'bold', color: t().text, marginBottom: 8,
  }))
  infoTitle.appendChild(doc.createTextNode('About'))
  const infoBody = doc.createElement('Text')
  infoBody.setAttribute('style', ({ fontSize: 13, color: t().textMuted, lineHeight: 18 }))
  infoBody.appendChild(doc.createTextNode(
    'Every visible element here is a DOM-like node created with ' +
    'doc.createElement. Updates use setAttribute to flip style and text, ' +
    'and removeChild/insertBefore for reordering. There is no virtual DOM, ' +
    'no JSX, no React — just direct Fabric mounting.'
  ))
  infoCard.appendChild(infoTitle)
  infoCard.appendChild(infoBody)
  settingsView.appendChild(infoCard)

  // ---------------------------------------------------------------------------
  // Tab switching — swap which sub-tree is in the content area
  // ---------------------------------------------------------------------------
  function renderContent() {
    while (contentArea.childNodes.length > 0) {
      contentArea.removeChild(contentArea.childNodes[0])
    }
    if (state.activeTab === 'home') contentArea.appendChild(homeView)
    else if (state.activeTab === 'list') {
      contentArea.appendChild(listView)
      renderItems()
    } else contentArea.appendChild(settingsView)
  }

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------
  body.appendChild(root)
  body.completeFabric()
  renderContent()
  body.completeFabric()
  console.log('[demo] Ready — interact with tabs, list, and theme switcher!')
})
