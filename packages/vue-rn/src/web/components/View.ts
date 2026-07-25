import { defineComponent } from 'vue'
import { createElement } from '../create-element'
import { StyleSheet } from '../stylesheet'

const base = StyleSheet.create({
  root: {
    alignItems: 'stretch',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'black',
    boxSizing: 'border-box',
    display: 'flex',
    flexBasis: 'auto',
    flexDirection: 'column',
    flexShrink: 0,
    justifyContent: 'flex-start',
    listStyle: 'none',
    margin: 0,
    minHeight: 0,
    minWidth: 0,
    padding: 0,
    position: 'relative',
    textDecoration: 'none',
    zIndex: 0,
  },
})

export const View = defineComponent({
  name: 'View',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    href: String, target: String, rel: String,
    id: String, tabIndex: [Number, String], testID: String,
    accessibilityLabel: String, accessibilityRole: String, accessibilityState: Object,
    onTouchEnd: Function, onTouchStart: Function, onTouchMove: Function,
    onPress: Function, onLayout: Function,
  },
  setup(props, { slots, attrs }) {
    return () => createElement('View', {
      ...attrs, ...props,
      style: [base.root, props.style],
    }, slots.default?.())
  },
})
