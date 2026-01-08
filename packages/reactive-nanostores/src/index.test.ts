import { runReactiveRuntimeTests } from '@rasenjs/core/test-utils'
import { createReactiveRuntime } from '../src/index'

runReactiveRuntimeTests('Nanostores Runtime', createReactiveRuntime)
