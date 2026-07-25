import { defineComponent } from 'vue'
import { createElement } from '../create-element'
import { StyleSheet } from '../stylesheet'
import { usePressHandlers } from './shared'

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

export const TouchableOpacity = defineComponent({
  name: 'TouchableOpacity',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    disabled: Boolean,
    activeOpacity: { type: Number, default: 0.2 },
    onPress: Function,
    onLongPress: Function,
    onPressIn: Function,
    onPressOut: Function,
    id: String, testID: String,
    accessibilityLabel: String, accessibilityRole: String,
  },
  emits: ['press', 'longPress', 'pressIn', 'pressOut'],
  setup(props, { slots, attrs, emit }) {
    const { pressed, onPointerDown, onPointerUp, onPointerLeave } = usePressHandlers(props, emit)

    return () => {
      return createElement('View', {
        ...attrs, ...props,
        style: [
          base.root,
          props.style,
          { opacity: pressed.value ? props.activeOpacity : 1, transition: 'opacity 0.15s' },
          props.disabled && { cursor: 'not-allowed' as const },
        ],
        onTouchStart: onPointerDown,
        onTouchEnd: onPointerUp,
        onTouchCancel: onPointerLeave,
        onMouseDown: onPointerDown,
        onMouseUp: onPointerUp,
        onMouseLeave: onPointerLeave,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
      }, slots.default?.())
    }
  },
})

export const TouchableHighlight = defineComponent({
  name: 'TouchableHighlight',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    disabled: Boolean,
    activeOpacity: { type: Number, default: 0.85 },
    underlayColor: { type: String, default: 'rgba(0,0,0,0.12)' },
    onPress: Function,
    onLongPress: Function,
    onPressIn: Function,
    onPressOut: Function,
    id: String, testID: String,
    accessibilityLabel: String, accessibilityRole: String,
  },
  emits: ['press', 'longPress', 'pressIn', 'pressOut'],
  setup(props, { slots, attrs, emit }) {
    const { pressed, onPointerDown, onPointerUp, onPointerLeave } = usePressHandlers(props, emit)

    return () => {
      return createElement('View', {
        ...attrs, ...props,
        style: [
          base.root,
          props.style,
          {
            backgroundColor: pressed.value ? props.underlayColor : 'transparent',
            transition: 'background-color 0.15s, opacity 0.15s',
            opacity: pressed.value ? props.activeOpacity : 1,
          },
          props.disabled && { cursor: 'not-allowed' as const },
        ],
        onTouchStart: onPointerDown,
        onTouchEnd: onPointerUp,
        onTouchCancel: onPointerLeave,
        onMouseDown: onPointerDown,
        onMouseUp: onPointerUp,
        onMouseLeave: onPointerLeave,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
      }, slots.default?.())
    }
  },
})

export const TouchableWithoutFeedback = defineComponent({
  name: 'TouchableWithoutFeedback',
  props: {
    disabled: Boolean,
    onPress: Function,
    onLongPress: Function,
    onPressIn: Function,
    onPressOut: Function,
    id: String, testID: String,
  },
  emits: ['press', 'longPress', 'pressIn', 'pressOut'],
  setup(props, { slots, attrs, emit }) {
    const { onPointerDown, onPointerUp, onPointerLeave } = usePressHandlers(props, emit)

    return () => createElement('View', {
      ...attrs, ...props,
      onTouchStart: onPointerDown,
      onTouchEnd: onPointerUp,
      onTouchCancel: onPointerLeave,
      onMouseDown: onPointerDown,
      onMouseUp: onPointerUp,
      onMouseLeave: onPointerLeave,
      cursor: props.disabled ? 'not-allowed' : 'pointer',
    }, slots.default?.())
  },
})
