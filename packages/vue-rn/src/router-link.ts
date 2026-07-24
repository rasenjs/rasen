/**
 * @rasenjs/vue-rn — RouterLink component for vue-router
 *
 * RN-compatible navigation link.
 * Default: renders a touchable <View> wrapping your slot content.
 * If the slot content is plain text, it's automatically wrapped in <Text>.
 *
 * Usage:
 *
 *   <!-- Basic — text auto-wrapped in <Text> -->
 *   <RouterLink to="/">Home</RouterLink>
 *
 *   <!-- Custom template (no wrapping View) -->
 *   <RouterLink to="/about" custom>
 *     <Text :style="{ color: '#e0e0ee' }">About</Text>
 *   </RouterLink>
 *
 *   <!-- With slot scope (isActive, navigate) -->
 *   <RouterLink v-slot="{ isActive }" to="/about" custom>
 *     <Text :style="{ color: isActive ? '#16c79a' : '#e0e0ee' }">About</Text>
 *   </RouterLink>
 */

import { defineComponent, h, type VNode, type PropType } from '@vue/runtime-core'
import { useLink } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'

export interface RouterLinkSlotScope {
  route: ReturnType<typeof useLink>['route']
  href: ReturnType<typeof useLink>['href']
  isActive: ReturnType<typeof useLink>['isActive']
  isExactActive: ReturnType<typeof useLink>['isExactActive']
  navigate: ReturnType<typeof useLink>['navigate']
}

function isTextNode(vnode: VNode): boolean {
  return typeof vnode.children === 'string' || typeof vnode.children === 'number'
}

function wrapText(vnodes: VNode[], style?: Record<string, any> | Record<string, any>[]): VNode[] {
  return vnodes.map(v => isTextNode(v) ? h('Text', { style }, v.children as string) : v)
}

export const RouterLink = /*#__PURE__*/ defineComponent({
  name: 'RouterLink',
  props: {
    to: { type: [String, Object] as PropType<RouteLocationRaw>, required: true },
    replace: Boolean,
    /**
     * When true, renders only the slot content without wrapping View.
     * Use this when you need full control over the touchable wrapper.
     */
    custom: Boolean,
    /**
     * Style forwarded to the inner Text when in default (non-custom) mode.
     * Ignored in custom mode — apply styles directly to your own elements.
     */
    style: [Object, Array] as PropType<Record<string, any> | Record<string, any>[]>,
  },
  setup(props, { slots }) {
    const link = useLink(props as Parameters<typeof useLink>[0])

    return () => {
      const scope: RouterLinkSlotScope = {
        route: link.route,
        href: link.href,
        isActive: link.isActive,
        isExactActive: link.isExactActive,
        navigate: link.navigate,
      }

      const slotContent = slots.default?.(scope) ?? []

      if (props.custom) {
        return slotContent.length === 0 ? h('View') : slotContent
      }

      // Default mode: auto-wrap text nodes in <Text> (with style passthrough),
      // then wrap everything in a touchable View
      return h('View', { onTouchEnd: link.navigate }, wrapText(slotContent, props.style))
    }
  },
})
