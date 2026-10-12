import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { View, Text, TouchableOpacity, registerApp } from '@rasenjs/react-native'
import { ref } from '@vue/reactivity'

useReactiveRuntime()

const count = ref(0)

// registerApp mounts the tree into the RN root view (app.json's app name)
registerApp('MyApp', () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    {/* a ref child is a reactive text node on the RN host too */}
    <Text style={{ fontSize: 48, marginBottom: 20 }}>{count}</Text>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <TouchableOpacity
        onPress={() => count.value--}
        style={{ padding: 15, backgroundColor: '#f44336', borderRadius: 8 }}
      >
        <Text style={{ color: 'white' }}>−</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => count.value++}
        style={{ padding: 15, backgroundColor: '#4CAF50', borderRadius: 8 }}
      >
        <Text style={{ color: 'white' }}>+</Text>
      </TouchableOpacity>
    </View>
  </View>
))
