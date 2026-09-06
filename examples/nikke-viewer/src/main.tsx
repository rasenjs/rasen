/**
 * Entry — boots the Vue reactive runtime and mounts the NIKKE viewer app.
 *
 * The Spine renderer is used as a PascalCase JSX component (<Spine/>), so it
 * needs no tag registration — Rasen calls component functions directly. The
 * reactive runtime is bootstrapped inside viewer.tsx (before its module-level
 * refs are created).
 */

import 'uno.css'
import './style.css'
import { mount } from '@rasenjs/dom'
import { app } from './viewer'

const container = document.getElementById('app')
if (container) mount(app(), container)
