import { defineComponent, ref, watch } from 'vue'
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
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 14,
  },
})

export const TextInput = defineComponent({
  name: 'TextInput',
  props: {
    style: [Object, Array],
    class: [String, Array, Object],
    modelValue: String,
    value: String,
    placeholder: String,
    multiline: Boolean,
    secureTextEntry: Boolean,
    autoFocus: Boolean,
    readonly: Boolean,
    disabled: Boolean,
    maxLength: [Number, String],
    testID: String,
    onFocus: Function,
    onBlur: Function,
    onChange: Function,
    onSubmitEditing: Function,
  },
  emits: ['update:modelValue', 'change', 'focus', 'blur', 'submit'],
  setup(props, { emit, attrs }) {
    const val = ref(props.modelValue ?? props.value ?? '')

    watch(() => props.modelValue, (v) => { if (v !== undefined) val.value = v })

    function onInput(e: Event) {
      const t = e.target as HTMLInputElement
      val.value = t.value
      emit('update:modelValue', t.value)
      emit('change', t.value)
    }

    return () => createElement('TextInput', {
      ...attrs, ...props,
      style: [base.root, { outline: 'none' }, props.style],
      value: val.value,
      onInput,
    })
  },
})
