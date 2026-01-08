import { runReactiveRuntimeTests } from '@rasenjs/core/test-utils'
import { createReactiveRuntime } from '../src/index'

runReactiveRuntimeTests('Vue Composition API Runtime', createReactiveRuntime)
