import { defineComponent } from 'vue'
import { createElement } from '../create-element'
import { StyleSheet } from '../stylesheet'
import { Image } from './Image'

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

export const ImageBackground = defineComponent({
  name: 'ImageBackground',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    source: [Object, Array, String, Number],
    src: String,
    resizeMode: String,
    imageStyle: [Object, Array],
    id: String, testID: String,
  },
  setup(props, { slots, attrs }) {
    return () => {
      const src = props.src || (typeof props.source === 'object' ? (props.source as any)?.uri : props.source)

      return createElement('View', {
        ...attrs, ...props,
        style: [base.root, props.style],
        children: [
          createElement(Image, {
            key: 'bg',
            style: [
              {
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                width: '100%', height: '100%',
              },
              props.imageStyle,
            ],
            src: src ? String(src) : undefined,
            resizeMode: props.resizeMode,
            children: undefined,
          }),
          createElement('View', {
            key: 'content',
            style: { flex: 1 },
            children: slots.default?.(),
          }),
        ],
      })
    }
  },
})
