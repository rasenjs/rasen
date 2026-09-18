---
layout: home

hero:
  name: Rota
  text: Headless UI for Rasen
  tagline: Accessible behaviour and full keyboard support — no styling, no lock-in. Style it with the data attributes the parts expose.
  actions:
    - theme: brand
      text: Getting started
      link: /guide/getting-started
    - theme: alt
      text: Components
      link: /components/
    - theme: alt
      text: Styling
      link: /guide/styling

features:
  - icon: 🧩
    title: Composable parts
    details: Every component is a set of parts (Root, Trigger, Content…) that share one context, Reka/Radix-style.
  - icon: 🎨
    title: Styled from the outside
    details: The library never sets cosmetic styles. State is exposed as data-state / aria-* and you style it with CSS.
  - icon: ♿️
    title: Correct by default
    details: Roles, aria-* wiring, ids and focus management come with the parts — including arrow-key navigation.
  - icon: 🔌
    title: Any reactive system
    details: State runs through the Rasen reactive runtime, so Vue reactivity, signals or your own adapter all work.
  - icon: 🪶
    title: Runs on the framework
    details: Parts are built with @rasenjs/dom element factories and com — no hand-rolled DOM, no second rendering model.
  - icon: 📦
    title: Thirteen components
    details: Accordion, AlertDialog, AspectRatio, Avatar, Checkbox, Collapsible, NumberField, PinInput, Progress, Separator, Switch, Tabs, TagsInput.
---

## A component, unstyled

Everything below is one live component. Its entire appearance comes from CSS
that targets `data-*` attributes — the same rules are in the
[styling guide](/guide/styling).

<RotaDemo name="sign-in-form" />

## Switch, Checkbox, Collapsible

<RotaDemo name="switch" />
<RotaDemo name="checkbox" />
<RotaDemo name="collapsible" />

## Tabs and Accordion

<RotaDemo name="tabs" />
<RotaDemo name="accordion" />

## Every component on its own page

<ComponentGrid />
