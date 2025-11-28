import { runReactiveRuntimeTests } from '@rasenjs/core/test-utils'
import { createSignalsRuntime, ref, computed, watch } from '../src/index'

runReactiveRuntimeTests('TC39 Signals Runtime', () => ({
  runtime: createSignalsRuntime(),
  ref,
  computed,
  watch,
}))
