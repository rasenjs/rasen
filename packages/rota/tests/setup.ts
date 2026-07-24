import '@testing-library/jest-dom'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'

beforeAll(() => {
  setReactiveRuntime(createReactiveRuntime())
})

afterAll(() => {
  setReactiveRuntime(null as any)
})
