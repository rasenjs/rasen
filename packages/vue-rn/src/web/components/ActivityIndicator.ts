import { defineComponent } from 'vue'
import { createElement } from '../create-element'
import { StyleSheet } from '../stylesheet'

const base = StyleSheet.create({
  root: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
  },
})

const sizes = { small: 20, large: 36 } as const

export const ActivityIndicator = defineComponent({
  name: 'ActivityIndicator',
  props: {
    size: { type: [String, Number], default: 'small' },
    color: { type: String, default: '#1976D2' },
    animating: { type: Boolean, default: true },
    hidesWhenStopped: { type: Boolean, default: true },
    style: [Object, Array],
    class: [String, Array, Object],
  },
  setup(props) {
    return () => {
      const s = typeof props.size === 'number' ? props.size : (sizes[props.size as keyof typeof sizes] ?? 20)
      const borderW = Math.max(s / 8, 2)
      const visible = props.animating || !props.hidesWhenStopped

      return createElement('View', {
        style: [base.root, props.style, !visible && { display: 'none' }],
        children: createElement('View', {
          style: {
            width: s,
            height: s,
            borderWidth: borderW,
            borderStyle: 'solid',
            borderColor: `${props.color}33`,
            borderTopColor: props.color,
            borderRadius: s / 2,
            animation: props.animating ? 'rasen-spin 0.8s linear infinite' : undefined,
          },
        }),
      })
    }
  },
})
