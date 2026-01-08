import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  view,
  text,
  touchableOpacity,
  registerApp
} from '@rasenjs/react-native'
import { ref } from '@vue/reactivity'

useReactiveRuntime()

const App = () => {
  const count = ref(0)

  return view({
    style: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    children: [
      text({
        style: { fontSize: 48, marginBottom: 20 },
        children: () => `${count.value}`
      }),
      view({
        style: { flexDirection: 'row', gap: 10 },
        children: [
          touchableOpacity({
            onPress: () => count.value--,
            style: { padding: 15, backgroundColor: '#f44336', borderRadius: 8 },
            children: text({
              style: { color: 'white', fontSize: 24 },
              children: '-'
            })
          }),
          touchableOpacity({
            onPress: () => count.value++,
            style: { padding: 15, backgroundColor: '#4CAF50', borderRadius: 8 },
            children: text({
              style: { color: 'white', fontSize: 24 },
              children: '+'
            })
          })
        ]
      })
    ]
  })
}

registerApp('CounterApp', App)
