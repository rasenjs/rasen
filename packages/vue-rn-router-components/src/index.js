/**
 * @rasenjs/vue-rn-router-components
 *
 * RN-compatible RouterLink for vue-router.
 * Replaces vue-router's default <a> tag with RN View + onTouchEnd.
 *
 * Usage:
 *   import { RouterLink } from '@rasenjs/vue-rn-router-components'
 *   import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
 */

const { defineComponent, h } = require('vue')
const { useLink } = require('vue-router')

const RouterLink = /*#__PURE__*/ defineComponent({
  name: 'RouterLink',
  props: {
    to: { type: [String, Object], required: true },
    replace: Boolean,
    custom: Boolean,
  },
  setup(props, { slots }) {
    const link = useLink(props)

    return () => {
      const children = slots.default && slots.default(link)

      if (props.custom) {
        return children
      }

      return h('View', {
        onTouchEnd: link.navigate,
      }, children)
    }
  },
})

module.exports = { RouterLink }

