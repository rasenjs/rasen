/**
 * @rasenjs/vue-rn/web — API wrappers
 *
 * Vue-compatible versions of common React Native APIs for web.
 */

// ── Alert ────────────────────────────────────────────────────────────

export const Alert = {
  alert(title: string, message?: string, buttons?: { text?: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]) {
    if (typeof window === 'undefined') return
    // Use native confirm if simple
    if (!buttons || buttons.length <= 1) {
      const result = window.confirm(`${title}\n${message ?? ''}`)
      if (result && buttons?.[0]?.onPress) buttons[0].onPress()
      return
    }
    // For multi-button: build a DOM dialog
    const dialog = document.createElement('div')
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999'
    const box = document.createElement('div')
    box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:320px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.15);font-family:system-ui,sans-serif'
    if (title) { const h = document.createElement('h3'); h.textContent = title; h.style.cssText = 'margin:0 0 8px;font-size:17px;font-weight:600'; box.appendChild(h) }
    if (message) { const p = document.createElement('p'); p.textContent = message; p.style.cssText = 'margin:0 0 20px;font-size:13px;color:#666'; box.appendChild(p) }
    for (const btn of buttons ?? []) {
      const b = document.createElement('button')
      b.textContent = btn.text ?? 'OK'
      b.style.cssText = `display:block;width:100%;padding:10px;margin-top:8px;border:none;border-radius:8px;font-size:15px;cursor:pointer;${btn.style === 'cancel' ? 'background:#f5f5f5;color:#666' : btn.style === 'destructive' ? 'background:#ff3b30;color:#fff' : 'background:#1976D2;color:#fff'}`
      b.onclick = () => { document.body.removeChild(dialog); btn.onPress?.() }
      box.appendChild(b)
    }
    dialog.appendChild(box)
    document.body.appendChild(dialog)
  },

  prompt(_title?: string, _message?: string, _callbackOrButtons?: any, _type?: any) {
    if (typeof window === 'undefined') return ''
    return window.prompt(_title ?? '', '') ?? ''
  },
}

// ── Platform ─────────────────────────────────────────────────────────

export const Platform = {
  OS: 'web',
  Version: navigator?.userAgent ?? '',
  select<T>(specifics: { web: T; native?: T; default?: T }): T {
    return specifics.web ?? specifics.default ?? ({} as T)
  },
  isTesting: false,
  isNative: false,
}

// ── Dimensions ───────────────────────────────────────────────────────

type DimensionListener = (dimensions: { window: { width: number; height: number }; screen: { width: number; height: number } }) => void

const _listeners = new Set<DimensionListener>()

function getWindow() {
  if (typeof window === 'undefined') return { width: 1024, height: 768, scale: 1, fontScale: 1 }
  return { width: window.innerWidth, height: window.innerHeight, scale: 1, fontScale: 1 }
}

function getScreen() {
  if (typeof window === 'undefined') return { width: 1024, height: 768, scale: 1, fontScale: 1 }
  return { width: window.screen.width, height: window.screen.height, scale: 1, fontScale: 1 }
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    const dims = { window: getWindow(), screen: getScreen() }
    _listeners.forEach(fn => fn(dims))
  })
}

export const Dimensions = {
  get(dim: 'window' | 'screen'): { width: number; height: number; scale: number; fontScale: number } {
    return dim === 'screen' ? getScreen() : getWindow()
  },
  addEventListener(type: 'change', handler: DimensionListener): { remove: () => void } {
    _listeners.add(handler)
    return { remove: () => _listeners.delete(handler) }
  },
  removeEventListener(_type: 'change', handler: DimensionListener): void {
    _listeners.delete(handler)
  },
}

// ── PixelRatio ───────────────────────────────────────────────────────

export const PixelRatio = {
  get(): number { return typeof window !== 'undefined' ? window.devicePixelRatio ?? 1 : 1 },
  getFontScale(): number { return 1 },
  getPixelSizeForLayoutSize(layoutSize: number): number { return Math.round(layoutSize * this.get()) },
  roundToNearestPixel(layoutSize: number): number { return Math.round(layoutSize * this.get()) / this.get() },
}

// ── Linking ──────────────────────────────────────────────────────────

export const Linking = {
  canOpenURL(_url: string): Promise<boolean> {
    return Promise.resolve(true)
  },
  openURL(url: string): Promise<void> {
    if (typeof window !== 'undefined') window.open(url, '_blank')
    return Promise.resolve()
  },
  addEventListener(_type: string, _handler: Function): { remove: () => void } {
    return { remove: () => {} }
  },
  removeEventListener(_type: string, _handler: Function): void {},
}

// ── Clipboard ────────────────────────────────────────────────────────

export const Clipboard = {
  getString(): Promise<string> {
    if (typeof navigator === 'undefined') return Promise.resolve('')
    return navigator.clipboard?.readText() ?? Promise.resolve('')
  },
  setString(text: string): void {
    if (typeof navigator === 'undefined') return
    navigator.clipboard?.writeText(text)
  },
}

// ── AppState ─────────────────────────────────────────────────────────

type AppStateListener = (state: string) => void
const appStateListeners = new Set<AppStateListener>()
let currentState = 'active'

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    currentState = document.hidden ? 'background' : 'active'
    appStateListeners.forEach(fn => fn(currentState))
  })
}

export const AppState = {
  currentState: 'active',
  addEventListener(_type: 'change' | 'focus' | 'blur', handler: AppStateListener): { remove: () => void } {
    appStateListeners.add(handler)
    return { remove: () => appStateListeners.delete(handler) }
  },
  removeEventListener(_type: 'change' | 'focus' | 'blur', handler: AppStateListener): void {
    appStateListeners.delete(handler)
  },
}

// ── Share ────────────────────────────────────────────────────────────

export const Share = {
  share(options: { message?: string; title?: string; url?: string }): Promise<{ action: string }> {
    if (typeof navigator !== 'undefined' && navigator.share) {
      return navigator.share({ title: options.title, text: options.message, url: options.url })
        .then(() => ({ action: 'shared.action' }))
        .catch(() => ({ action: 'dismissed.action' }))
    }
    // Fallback: copy to clipboard
    const text = [options.title, options.message, options.url].filter(Boolean).join('\n')
    Clipboard.setString(text)
    Alert.alert('Copied to clipboard', text)
    return Promise.resolve({ action: 'shared.action' })
  },
}

// ── Hooks ────────────────────────────────────────────────────────────

export function useWindowDimensions(): { width: number; height: number; scale: number; fontScale: number } {
  // In Vue this should be used inside setup(). For simplicity we return
  // current values. For reactive updates, wrap in ref + onMounted.
  return Dimensions.get('window')
}

export function useColorScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useLocaleContext(): { direction: 'ltr' | 'rtl'; locale: string } {
  return { direction: 'ltr', locale: navigator?.language ?? 'en-US' }
}
