import { runReactiveRuntimeTests } from '@rasenjs/core/test-utils'
import { createReactiveRuntime } from '../src/index'
import { ref as vueRef, computed as vueComputed, watch as vueWatch } from 'vue'

runReactiveRuntimeTests('Vue Composition API Runtime', () => ({
  runtime: createReactiveRuntime(),
  ref: vueRef,
  computed: vueComputed,
  watch: vueWatch,
}))
