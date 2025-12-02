/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-signals'
import { mount } from '@rasenjs/dom'
import { App } from './App'
import './style.css'

// 初始化响应式运行时
setReactiveRuntime(createReactiveRuntime())

// 挂载应用
mount(<App />, document.getElementById('app')!)
