import { runReactiveRuntimeTests } from '@rasenjs/core/test-utils'
import { createReactiveRuntime, ref, computed, watch } from '../src/index'

runReactiveRuntimeTests('TC39 Signals Runtime', () => ({
  runtime: createReactiveRuntime(),
  ref,
  computed,
  watch,
}))
