import { defineComponent } from 'vue'
import { createElement } from '../create-element'
import { StyleSheet } from '../stylesheet'

const base = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: '#1976D2',
    borderRadius: 4,
    cursor: 'pointer',
    display: 'inline-flex',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    userSelect: 'none',
    transitionDuration: '0.15s',
    transitionProperty: 'opacity',
  },
  text: {
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
})

export const Button = defineComponent({
  name: 'Button',
  props: {
    title: { type: String, required: true },
    color: String,
    disabled: Boolean,
    onPress: Function,
    accessibilityLabel: String,
    testID: String,
  },
  emits: ['press'],
  setup(props, { emit }) {
    function handlePress(e: Event) {
      if (props.disabled) return
      emit('press', e)
      props.onPress?.(e)
    }

    return () => {
      const bgColor = props.disabled ? '#999'
        : props.color ?? '#1976D2'

      return createElement('View', {
        style: [
          base.root,
          props.disabled && base.disabled,
          { backgroundColor: bgColor },
        ],
        onClick: handlePress,
        role: 'button',
        ariaDisabled: props.disabled || undefined,
        accessibilityLabel: props.accessibilityLabel,
        testID: props.testID,
        tabIndex: props.disabled ? -1 : 0,
        children: createElement('Text', {
          style: base.text,
          children: props.title,
        }),
      })
    }
  },
})
