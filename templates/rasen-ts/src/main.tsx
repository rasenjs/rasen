/// <reference types="@rasenjs/jsx-runtime/jsx" />

import { mount } from '@rasenjs/dom'
import { App } from './App'
import './style.css'

// Router initialization happens in router.ts

// Mount application
mount(<App />, document.getElementById('app')!)
