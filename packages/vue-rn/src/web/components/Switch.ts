import { defineComponent, ref } from 'vue'
import { createElement } from '../create-element'
import { StyleSheet } from '../stylesheet'

const base = StyleSheet.create({
  root: {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'inline-flex',
    justifyContent: 'center',
    userSelect: 'none',
  },
  track: {
    borderRadius: 15,
    height: 30,
    position: 'relative',
    transitionDuration: '0.2s',
    width: 50,
  },
  thumb: {
    borderRadius: 13,
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    height: 26,
    position: 'absolute',
    top: 2,
    transitionDuration: '0.2s',
    width: 26,
  },
})

export const Switch = defineComponent({
  name: 'Switch',
  props: {
    value: Boolean, disabled: Boolean,
    trackColor: [String, Object],
    thumbColor: { type: String, default: '#fff' },
    style: [Object, Array], class: [String, Array, Object],
    onValueChange: Function, onChange: Function,
  },
  emits: ['update:value', 'change'],
  setup(props, { emit, attrs }) {
    const isOn = ref(props.value ?? false)

    function toggle() {
      if (props.disabled) return
      isOn.value = !isOn.value
      emit('update:value', isOn.value)
      emit('change', isOn.value)
      props.onValueChange?.(isOn.value)
      props.onChange?.(isOn.value)
    }

    return () => {
      const trackOff = typeof props.trackColor === 'object'
        ? (props.trackColor as any)?.false ?? '#E5E5EA'
        : props.trackColor ?? '#E5E5EA'
      const trackOn = typeof props.trackColor === 'object'
        ? (props.trackColor as any)?.true ?? '#34C759'
        : '#34C759'

      return createElement('View', {
        ...attrs, ...props,
        style: [base.root, props.style],
        onClick: toggle,
        role: 'switch',
        ariaChecked: isOn.value,
        children: [
          createElement('View', {
            key: 'track',
            style: [base.track, { backgroundColor: isOn.value ? trackOn : trackOff }],
            children: createElement('View', {
              key: 'thumb',
              style: [base.thumb, {
                backgroundColor: props.thumbColor,
                left: isOn.value ? 22 : 2,
                right: isOn.value ? 2 : 22,
              }],
            }),
          }),
        ],
      })
    }
  },
})
