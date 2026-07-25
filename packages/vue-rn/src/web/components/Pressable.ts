import { defineComponent, ref } from 'vue'
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

/**
 * Pressable — Low-level touch wrapper.
 * Renders a div that responds to press interactions.
 * Provides hover/press/active states via slots.
 *
 * Usage:
 *   <Pressable v-slot="{ pressed }" @press="onPress">
 *     <Text :style="{ opacity: pressed ? 0.5 : 1 }">Tap me</Text>
 *   </Pressable>
 */
export const Pressable = defineComponent({
  name: 'Pressable',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    disabled: Boolean,
    onPress: Function,
    onLongPress: Function,
    onPressIn: Function,
    onPressOut: Function,
    onTouchEnd: Function,
    id: String, testID: String,
    accessibilityLabel: String, accessibilityRole: String,
    accessibilityState: Object,
  },
  emits: ['press', 'longPress', 'pressIn', 'pressOut'],
  setup(props, { slots, attrs, emit }) {
    const pressed = ref(false)
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    let isLongPress = false

    function handlePointerDown(e: Event) {
      if (props.disabled) return
      pressed.value = true
      isLongPress = false
      emit('pressIn', e)
      props.onPressIn?.(e)
      longPressTimer = setTimeout(() => {
        isLongPress = true
        emit('longPress', e)
        props.onLongPress?.(e)
      }, 500)
    }

    function handlePointerUp(e: Event) {
      if (props.disabled) return
      pressed.value = false
      emit('pressOut', e)
      props.onPressOut?.(e)
      if (longPressTimer) clearTimeout(longPressTimer)
      if (!isLongPress) {
        emit('press', e)
        props.onPress?.(e)
      }
    }

    function handlePointerLeave() {
      pressed.value = false
      if (longPressTimer) clearTimeout(longPressTimer)
    }

    return () => {
      const slotProps = { pressed: pressed.value }
      const children = slots.default?.(slotProps)
      return createElement('View', {
        ...attrs, ...props,
        style: [base.root, props.style],
        onTouchStart: handlePointerDown,
        onTouchEnd: handlePointerUp,
        onTouchCancel: handlePointerLeave,
        onMouseDown: handlePointerDown,
        onMouseUp: handlePointerUp,
        onMouseLeave: handlePointerLeave,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        children,
      })
    }
  },
})
