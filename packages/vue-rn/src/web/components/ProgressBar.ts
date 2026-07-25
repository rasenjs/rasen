import { defineComponent, computed } from 'vue'
import { createElement } from '../create-element'
import { StyleSheet } from '../stylesheet'

const base = StyleSheet.create({
  root: {
    alignItems: 'stretch',
    backgroundColor: '#E5E5EA',
    borderRadius: 999,
    display: 'flex',
    flexShrink: 0,
    height: 4,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    borderRadius: 999,
    height: '100%',
    transitionDuration: '0.3s',
    transitionProperty: 'width',
  },
})

export const ProgressBar = defineComponent({
  name: 'ProgressBar',
  props: {
    progress: { type: Number, default: 0 },
    color: { type: String, default: '#1976D2' },
    indeterminate: Boolean,
    trackColor: { type: String, default: '#E5E5EA' },
    style: [Object, Array],
    class: [String, Array, Object],
  },
  setup(props) {
    return () => {
      const pct = Math.min(Math.max(props.progress, 0), 1) * 100
      return createElement('View', {
        style: [base.root, { backgroundColor: props.trackColor }, props.style],
        role: 'progressbar',
        ariaValueNow: props.indeterminate ? undefined : pct,
        ariaValueMin: 0,
        ariaValueMax: 100,
        children: createElement('View', {
          style: [
            base.fill,
            {
              backgroundColor: props.color,
              width: props.indeterminate ? '30%' : `${pct}%`,
            },
          ],
        }),
      })
    }
  },
})
