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
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    paddingLeft: 'env(safe-area-inset-left, 0px)',
    paddingRight: 'env(safe-area-inset-right, 0px)',
  },
})

export const SafeAreaView = defineComponent({
  name: 'SafeAreaView',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    id: String, testID: String,
    onLayout: Function,
  },
  setup(props, { slots, attrs }) {
    return () => createElement('View', { ...attrs, ...props, style: [base.root, props.style] }, slots.default?.())
  },
})
