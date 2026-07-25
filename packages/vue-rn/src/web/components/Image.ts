import { defineComponent, computed } from 'vue'
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
    overflow: 'hidden',
  },
})

export const Image = defineComponent({
  name: 'Image',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    source: [Object, Array, String, Number],
    src: String,
    resizeMode: String,
    alt: String,
    id: String, testID: String,
    onPress: Function, onTouchEnd: Function, onLayout: Function,
  },
  setup(props, { attrs }) {
    return () => {
      const src = props.src || (typeof props.source === 'object' ? (props.source as any)?.uri : props.source)
      return createElement('Image', {
        ...attrs, ...props,
        src: src ? String(src) : undefined,
        style: [base.root, props.style],
        children: undefined,
      })
    }
  },
})
