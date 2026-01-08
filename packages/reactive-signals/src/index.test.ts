import { runReactiveRuntimeTests } from '@rasenjs/core/test-utils'
import { createReactiveRuntime } from '../src/index'

runReactiveRuntimeTests('TC39 Signals Runtime', createReactiveRuntime)
