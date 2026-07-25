import { defineComponent } from 'vue'
import { createElement } from '../create-element'

export const CheckBox = defineComponent({
  name: 'CheckBox',
  props: {
    value: Boolean,
    disabled: Boolean,
    color: String,
    onValueChange: Function,
    onChange: Function,
    testID: String,
  },
  emits: ['update:value', 'change'],
  setup(props, { emit }) {
    function handleChange(e: Event) {
      if (props.disabled) return
      const target = e.target as HTMLInputElement
      emit('update:value', target.checked)
      emit('change', target.checked)
      props.onValueChange?.(target.checked)
      props.onChange?.(target.checked)
    }

    return () => createElement('input', {
      type: 'checkbox',
      checked: props.value ?? false,
      disabled: props.disabled || undefined,
      onChange: handleChange,
      style: {
        accentColor: props.color,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        width: 20,
        height: 20,
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        appearance: 'none',
        backgroundColor: props.value ? (props.color ?? '#1976D2') : '#fff',
        border: `2px solid ${props.value ? (props.color ?? '#1976D2') : '#999'}`,
        borderRadius: 3,
        transition: 'all 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
      role: 'checkbox',
      ariaChecked: props.value ?? false,
      'data-testid': props.testID,
    })
  },
})
