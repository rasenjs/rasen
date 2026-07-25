import { defineComponent } from 'vue'
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
    height: '100%',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
})

export const StatusBar = defineComponent({
  name: 'StatusBar',
  props: {
    barStyle: { type: String, default: 'default' },
    backgroundColor: { type: String, default: 'transparent' },
    translucent: Boolean,
    hidden: Boolean,
  },
  setup(props) {
    return () => {
      if (typeof document === 'undefined') return null
      const themeColor = props.barStyle === 'dark' ? '#000' : '#fff'
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', props.backgroundColor)
      else {
        const m = document.createElement('meta')
        m.name = 'theme-color'
        m.content = props.backgroundColor
        document.head.appendChild(m)
      }
      document.body.style.backgroundColor = props.backgroundColor
      // no visible DOM element
      return null
    }
  },
})
