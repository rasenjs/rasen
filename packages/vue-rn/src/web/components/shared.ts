import { defineComponent, ref } from 'vue'
import { createElement } from '../create-element'
import { StyleSheet } from '../stylesheet'

export interface TouchableProps {
  style?: unknown
  class?: unknown
  disabled?: boolean
  onPress?: Function
  onLongPress?: Function
  onPressIn?: Function
  onPressOut?: Function
  activeOpacity?: number
  underlayColor?: string
  id?: string
  testID?: string
}

function usePressHandlers(props: TouchableProps, emit: any, extra?: { onPress?: Function }) {
  const pressed = ref(false)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let isLong = false

  function onPointerDown(e: Event) {
    if (props.disabled) return
    pressed.value = true
    isLong = false
    emit('pressIn', e)
    props.onPressIn?.(e)
    longPressTimer = setTimeout(() => {
      isLong = true
      emit('longPress', e)
      props.onLongPress?.(e)
    }, 500)
  }

  function onPointerUp(e: Event) {
    if (props.disabled) return
    pressed.value = false
    emit('pressOut', e)
    props.onPressOut?.(e)
    if (longPressTimer) clearTimeout(longPressTimer)
    if (!isLong) {
      emit('press', e)
      props.onPress?.(e)
      extra?.onPress?.(e)
    }
  }

  function onPointerLeave() {
    pressed.value = false
    if (longPressTimer) clearTimeout(longPressTimer)
  }

  return { pressed, onPointerDown, onPointerUp, onPointerLeave }
}

export { usePressHandlers }
