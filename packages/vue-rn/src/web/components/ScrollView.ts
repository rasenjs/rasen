import { defineComponent } from 'vue'
import { createElement } from '../create-element'
import { StyleSheet } from '../stylesheet'

const base = StyleSheet.create({
  root: {
    alignItems: 'stretch',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'solid',
    boxSizing: 'border-box',
    display: 'flex',
    flexBasis: 'auto',
    flexDirection: 'column',
    flexShrink: 0,
    margin: 0,
    minHeight: 0,
    minWidth: 0,
    padding: 0,
    position: 'relative',
    zIndex: 0,
  },
  content: {
    alignItems: 'stretch',
    backgroundColor: 'transparent',
    borderWidth: 0,
    boxSizing: 'border-box',
    display: 'flex',
    flexBasis: 'auto',
    flexDirection: 'column',
    flexShrink: 0,
    margin: 0,
    minHeight: 0,
    minWidth: 0,
    padding: 0,
    position: 'relative',
    zIndex: 0,
  },
})

export const ScrollView = defineComponent({
  name: 'ScrollView',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    contentContainerStyle: [Object, Array],
    horizontal: Boolean,
    showsVerticalScrollIndicator: { type: Boolean, default: true },
    showsHorizontalScrollIndicator: { type: Boolean, default: true },
    onTouchEnd: Function, onScroll: Function, onLayout: Function,
  },
  setup(props, { slots, attrs }) {
    return () => {
      const scrollStyle = { overflow: props.horizontal ? 'auto hidden' : 'hidden auto' }
      const contentStyle = props.horizontal ? { flexDirection: 'row' as const } : {}

      return createElement('ScrollView', {
        ...attrs, ...props,
        style: [base.root, scrollStyle, props.style],
      }, [
        createElement('View', {
          style: [base.content, contentStyle, props.contentContainerStyle],
        }, slots.default?.()),
      ])
    }
  },
})
