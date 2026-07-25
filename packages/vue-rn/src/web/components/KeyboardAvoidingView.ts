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
})

const KEYBOARD_PADDING = { paddingBottom: 300 } // Approximate keyboard height

export const KeyboardAvoidingView = defineComponent({
  name: 'KeyboardAvoidingView',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    behavior: { type: String, default: 'padding' },
    keyboardVerticalOffset: { type: Number, default: 0 },
  },
  setup(props, { slots, attrs }) {
    return () => {
      const extra = props.behavior === 'padding' ? KEYBOARD_PADDING : {}
      return createElement('View', {
        ...attrs, ...props,
        style: [base.root, extra, props.style],
      }, slots.default?.())
    }
  },
})
