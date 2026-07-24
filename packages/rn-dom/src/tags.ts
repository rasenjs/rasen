/**
 * @rasenjs/rn-dom — React Native Built-in Component Registry
 *
 * Provides a complete catalog of React Native core components for Fabric,
 * along with their native names, categories, and TypeScript prop types.
 *
 * Categories:
 *   - container   – layout containers (View, SafeAreaView, etc.)
 *   - text        – text wrapper (Text)
 *   - image       – image renderer (Image)
 *   - input       – text input (TextInput, AndroidTextInput)
 *   - scroll      – scrolling containers (ScrollView)
 *   - indicator   – activity / progress indicators
 *   - switch      – toggle controls
 *   - refresh     – pull-to-refresh
 *   - modal       – modal overlay
 *   - android     – Android-only components
 *   - debug       – dev/debug overlays
 */

// ============================================================================
// Tag entry
// ============================================================================

export interface RNComponentTag {
  /** JSX / template tag name, e.g. 'View', 'Text', 'ScrollView' */
  tag: string
  /** Fabric native view name, e.g. 'RCTView', 'RCTText' */
  nativeName: string
  /** Component category for tooling / filtering */
  category: RNComponentCategory
  /** Platforms this component is available on */
  platforms: ('ios' | 'android')[]
  /** Brief description */
  description: string
}

export type RNComponentCategory =
  | 'container'
  | 'text'
  | 'image'
  | 'input'
  | 'scroll'
  | 'indicator'
  | 'switch'
  | 'refresh'
  | 'modal'
  | 'android'
  | 'debug'

// ============================================================================
// Complete tag registry
// ============================================================================

export const RN_COMPONENT_TAGS: RNComponentTag[] = [
  // ── Container ─────────────────────────────────────────────────────────────
  {
    tag: 'View',
    nativeName: 'RCTView',
    category: 'container',
    platforms: ['ios', 'android'],
    description: 'The most fundamental component for building UI',
  },
  {
    tag: 'SafeAreaView',
    nativeName: 'SafeAreaView',
    category: 'container',
    platforms: ['ios'],
    description: 'Renders content within the safe area boundaries (iOS, falls back to View on Android)',
  },

  // ── Text ─────────────────────────────────────────────────────────────────
  {
    tag: 'Text',
    nativeName: 'RCTText',
    category: 'text',
    platforms: ['ios', 'android'],
    description: 'A component for displaying text',
  },

  // ── Image ────────────────────────────────────────────────────────────────
  {
    tag: 'Image',
    nativeName: 'RCTImageView',
    category: 'image',
    platforms: ['ios', 'android'],
    description: 'A component for displaying different types of images',
  },

  // ── TextInput ────────────────────────────────────────────────────────────
  {
    tag: 'TextInput',
    nativeName: 'RCTSinglelineTextInputView',
    category: 'input',
    platforms: ['ios'],
    description: 'A foundational component for inputting text (iOS single-line)',
  },
  {
    tag: 'TextInput',
    nativeName: 'RCTMultilineTextInputView',
    category: 'input',
    platforms: ['ios'],
    description: 'A foundational component for inputting text (iOS multi-line)',
  },
  {
    tag: 'AndroidTextInput',
    nativeName: 'AndroidTextInput',
    category: 'input',
    platforms: ['android'],
    description: 'TextInput for Android (Fabric name: AndroidTextInput)',
  },

  // ── Scroll ───────────────────────────────────────────────────────────────
  {
    tag: 'ScrollView',
    nativeName: 'RCTScrollView',
    category: 'scroll',
    platforms: ['ios', 'android'],
    description: 'A component for scrolling content',
  },
  {
    tag: 'AndroidHorizontalScrollView',
    nativeName: 'AndroidHorizontalScrollView',
    category: 'scroll',
    platforms: ['android'],
    description: 'Horizontal scroll view for Android',
  },

  // ── Indicator ────────────────────────────────────────────────────────────
  {
    tag: 'ActivityIndicator',
    nativeName: 'ActivityIndicatorView',
    category: 'indicator',
    platforms: ['ios', 'android'],
    description: 'Displays a circular loading indicator',
  },
  {
    tag: 'ProgressBarAndroid',
    nativeName: 'AndroidProgressBar',
    category: 'indicator',
    platforms: ['android'],
    description: 'ProgressBar for Android',
  },

  // ── Switch ───────────────────────────────────────────────────────────────
  {
    tag: 'Switch',
    nativeName: 'Switch',
    category: 'switch',
    platforms: ['ios'],
    description: 'A boolean toggle component (iOS)',
  },
  {
    tag: 'AndroidSwitch',
    nativeName: 'AndroidSwitch',
    category: 'switch',
    platforms: ['android'],
    description: 'Switch component for Android',
  },

  // ── Refresh ──────────────────────────────────────────────────────────────
  {
    tag: 'RefreshControl',
    nativeName: 'PullToRefreshView',
    category: 'refresh',
    platforms: ['ios'],
    description: 'A pull-to-refresh control (iOS)',
  },
  {
    tag: 'AndroidSwipeRefreshLayout',
    nativeName: 'AndroidSwipeRefreshLayout',
    category: 'refresh',
    platforms: ['android'],
    description: 'SwipeRefreshLayout for Android',
  },

  // ── Modal ────────────────────────────────────────────────────────────────
  {
    tag: 'Modal',
    nativeName: 'ModalHostView',
    category: 'modal',
    platforms: ['ios', 'android'],
    description: 'A component for presenting content on top of the app',
  },

  // ── Android-only ─────────────────────────────────────────────────────────
  {
    tag: 'DrawerLayoutAndroid',
    nativeName: 'AndroidDrawerLayout',
    category: 'android',
    platforms: ['android'],
    description: 'React Native wrapper for Android DrawerLayout',
  },

  // ── Debug ────────────────────────────────────────────────────────────────
  {
    tag: 'DebuggingOverlay',
    nativeName: 'DebuggingOverlay',
    category: 'debug',
    platforms: ['ios', 'android'],
    description: 'Dev debugging overlay',
  },
]

// ============================================================================
// Lookup helpers
// ============================================================================

/** Map of tag → nativeName for quick lookup. Tags with multiple native names
 *  (e.g. TextInput → RCTSinglelineTextInputView / RCTMultilineTextInputView)
 *  will use the first entry in the registry. */
const TAG_TO_NATIVE: Record<string, string> = {}
const NATIVE_TO_TAG: Record<string, string> = {}
const TAG_SET = new Set<string>()

for (const entry of RN_COMPONENT_TAGS) {
  if (!(entry.tag in TAG_TO_NATIVE)) {
    TAG_TO_NATIVE[entry.tag] = entry.nativeName
  }
  NATIVE_TO_TAG[entry.nativeName] = entry.tag
  TAG_SET.add(entry.tag)
}

/**
 * Check if a tag name is a known React Native built-in component.
 */
export function isRNBuiltIn(tag: string): boolean {
  return TAG_SET.has(tag)
}

/**
 * Get the Fabric native name for a given JS tag.
 * Falls back to `RCT${tag}` if not found.
 */
export function getNativeName(tag: string): string {
  return TAG_TO_NATIVE[tag] ?? `RCT${tag}`
}

/**
 * Get the JS tag name from a Fabric native name.
 */
export function getTagFromNative(nativeName: string): string | undefined {
  return NATIVE_TO_TAG[nativeName]
}

/**
 * Get all registered JS tag names.
 */
export function getAllTags(): string[] {
  return [...TAG_SET]
}
