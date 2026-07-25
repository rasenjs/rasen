import { defineComponent } from 'vue'
import { createElement } from '../create-element'
import { StyleSheet } from '../stylesheet'

const base = StyleSheet.create({
  root: {
    color: 'inherit',
    display: 'inline',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 14,
    fontStyle: 'normal',
    fontWeight: '400',
    letterSpacing: 'normal',
    lineHeight: 1.4,
    margin: 0,
    padding: 0,
    textAlign: 'left',
    textDecoration: 'none',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  },
})

export const Text = defineComponent({
  name: 'Text',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    numberOfLines: [Number, String],
    selectable: Boolean,
    id: String, testID: String,
    accessibilityLabel: String, accessibilityRole: String,
    href: String, target: String, rel: String,
    onPress: Function, onTouchEnd: Function, onLayout: Function,
  },
  setup(props, { slots, attrs }) {
    return () => createElement('Text', {
      ...attrs, ...props,
      style: [base.root, props.style],
    }, slots.default?.())
  },
})
