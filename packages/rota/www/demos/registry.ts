/**
 * Live component demos for the Rota site.
 *
 * One entry per component: `build()` returns a mountable, and the site's
 * `<RotaDemo name="…">` mounts it into a stage element. Keeping them in one
 * registry means the site and any future visual check share a single source.
 *
 * These are written the way a consumer writes them: parts composed together,
 * state through the reactive runtime, styling left to CSS (the components are
 * headless and only expose `data-*` contracts).
 */
import type { Mountable } from '@rasenjs/core'
// The isomorphic entry: DOM in the browser, string renderer under the node
// condition — so this registry can also be rendered on the server (SSG).
import { div, span, text, input } from '@rasenjs/web/elements'
import {
  accordion,
  alertDialog,
  aspectRatio,
  avatar,
  checkbox,
  label,
  numberField,
  pinInput,
  progress,
  radioGroup,
  separator,
  slider,
  switchControl,
  tabs,
  tagsInput,
  toggle,
  toggleGroup,
  popover,
  createCollapsibleRoot,
  createCollapsibleTrigger,
  createCollapsibleContent,
  dialog
} from '../../src/index'

export interface Demo {
  /** Heading shown in the site's demo card. */
  title: string
  /** One line on what the demo shows. */
  description: string
  /** Source shown next to the live example. */
  code: string
  build: () => Mountable<HTMLElement>
}

/** Helper: an element with a wrapper class, so demos read like markup. */
const row = (children: Mountable<HTMLElement>[], cls = 'row') =>
  div({ class: cls, children })

export const demos: Record<string, Demo> = {
  switch: {
    title: 'Switch',
    description: 'Uncontrolled by default; pass `checked` to control it.',
    code: `const sw = createSwitch()
mount(sw({ defaultChecked: true }), el)`,
    build: () => row([switchControl({ defaultChecked: true, class: 'sw' })])
  },

  checkbox: {
    title: 'Checkbox',
    description: 'Tri-state: `false` → `true` → `indeterminate` → `false`.',
    code: `checkbox({ defaultChecked: true })
checkbox({ defaultChecked: 'indeterminate' })`,
    build: () =>
      row([
        checkbox({ defaultChecked: true, class: 'cb', indicatorClass: 'cb__i' }),
        checkbox({
          defaultChecked: 'indeterminate',
          class: 'cb',
          indicatorClass: 'cb__i'
        }),
        checkbox({
          class: 'cb',
          indicatorClass: 'cb__i',
          disabled: true
        })
      ])
  },

  collapsible: {
    title: 'Collapsible',
    description: 'Parts share one context; content is hidden while closed.',
    code: `createCollapsible()({ triggerClass: 'btn', contentClass: 'panel' })`,
    build: () => {
      const Root = createCollapsibleRoot()
      const Trigger = createCollapsibleTrigger()
      const Content = createCollapsibleContent()

      return div({
        children: [
          Root({
            defaultOpen: true,
            class: 'card',
            children: (getContext) =>
              div({
                children: [
                  Trigger({ class: 'btn', children: () => text({ content: 'Toggle details' }) }, getContext),
                  Content(
                    {
                      class: 'panel',
                      children: () =>
                        span({
                          class: 'panel__inner',
                          children: ['Hidden while closed.']
                        })
                    },
                    getContext
                  )
                ]
              })
          })
        ]
      })
    }
  },

  tabs: {
    title: 'Tabs',
    description: 'Each panel is a `role="tabpanel"`; only one is visible.',
    code: `tabs({ defaultValue: 'a', tabs: [
  { value: 'a', label: 'Account', content: '…' },
  { value: 'b', label: 'Password', content: '…' }
] })`,
    build: () =>
      tabs({
        defaultValue: 'a',
        class: 'tabs',
        listClass: 'tabs__list',
        triggerClass: 'tabs__trigger',
        contentClass: 'tabs__panel',
        tabs: [
          { value: 'a', label: 'Account', content: 'Make changes to your account.' },
          { value: 'b', label: 'Password', content: 'Change your password here.' },
          { value: 'c', label: 'Locked', content: 'Unavailable.', disabled: true }
        ]
      })
  },

  accordion: {
    title: 'Accordion',
    description: '`single` keeps one panel open; arrow keys move between triggers.',
    code: `accordion({ type: 'single', collapsible: true, items: [
  { value: 'one', label: 'Is it accessible?', content: 'Yes.' }
] })`,
    build: () =>
      accordion({
        type: 'single',
        collapsible: true,
        defaultValue: 'one',
        class: 'acc',
        itemClass: 'acc__item',
        triggerClass: 'acc__trigger',
        contentClass: 'acc__content',
        items: [
          { value: 'one', label: 'Is it accessible?', content: 'Yes — links and roles come from the parts.' },
          { value: 'two', label: 'Is it unstyled?', content: 'Completely. Style it with data attributes.' },
          { value: 'three', label: 'Is it animated?', content: 'Add your own transitions on data-state.' }
        ]
      })
  },

  progress: {
    title: 'Progress',
    description: 'Omit `value` for the indeterminate state.',
    code: `progress({ value: 60, max: 100 })
progress({ value: null })`,
    build: () =>
      div({
        class: 'stack',
        children: [
          progress({
            value: 60,
            class: 'prog',
            indicatorClass: 'prog__bar'
          }),
          progress({ value: null, class: 'prog', indicatorClass: 'prog__bar' })
        ]
      })
  },

  separator: {
    title: 'Separator',
    description: '`decorative` drops the separator role; orientation is a data attribute.',
    code: `separator()
vseparator({ decorative: true })`,
    build: () =>
      div({
        class: 'card',
        children: [
          span({ children: ['Above'] }),
          separator({ class: 'sep' }),
          span({ children: ['Below'] }),
          div({
            class: 'row',
            children: [
              span({ children: ['Left'] }),
              separator({ orientation: 'vertical', class: 'sep sep--v' }),
              span({ children: ['Right'] })
            ]
          })
        ]
      })
  },

  avatar: {
    title: 'Avatar',
    description: 'The fallback covers the image until it loads, then fades out.',
    code: `avatar({ src: '…', alt: '…', fallback: () => text({ content: 'RS' }) })`,
    build: () =>
      row([
        avatar({
          src: 'https://avatars.githubusercontent.com/u/1?v=4',
          alt: 'A user',
          class: 'avatar',
          fallback: () => text({ content: 'RS' })
        }),
        avatar({
          src: 'https://example.invalid/broken.png',
          alt: 'Broken image',
          class: 'avatar',
          fallback: () => text({ content: 'AB' })
        })
      ])
  },

  'alert-dialog': {
    title: 'AlertDialog',
    description:
      'Not dismissible by Escape or overlay click; focus lands on the action.',
    code: `const { Root, Trigger, Overlay, Content, Title, Description, Action, Cancel } = alertDialog`,
    build: () => {
      const { Root, Trigger, Overlay, Content, Title, Description, Action, Cancel } =
        alertDialog

      return div({
        children: [
          Root({
            class: 'dialog',
            children: (getContext) =>
              div({
                children: [
                  Trigger(
                    { class: 'btn', children: () => text({ content: 'Delete account' }) },
                    getContext
                  ),
                  Overlay({ class: 'overlay' }, getContext),
                  Content(
                    {
                      class: 'dialog__panel',
                      children: (getCtx) =>
                        div({
                          children: [
                            Title(
                              { children: () => text({ content: 'Are you absolutely sure?' }) },
                              getCtx
                            ),
                            Description(
                              {
                                children: () =>
                                  text({
                                    content:
                                      'This action cannot be undone. It removes your account permanently.'
                                  })
                              },
                              getCtx
                            ),
                            div({
                              class: 'row row--end',
                              children: [
                                Cancel(
                                  {
                                    class: 'btn btn--ghost',
                                    children: () => text({ content: 'Cancel' })
                                  },
                                  getCtx
                                ),
                                Action(
                                  {
                                    class: 'btn btn--danger',
                                    children: () => text({ content: 'Delete' })
                                  },
                                  getCtx
                                )
                              ]
                            })
                          ]
                        })
                    },
                    getContext
                  )
                ]
              })
          })
        ]
      })
    }
  },

  popover: {
    title: 'Popover',
    description:
      'A non-modal layer anchored to its trigger: Escape or a press outside closes it, and Tab leaves it.',
    code: `const { Root, Trigger, Content } = popover`,
    build: () => {
      const { Root, Trigger, Content } = popover

      return div({
        children: [
          Root({
            // Open, so the server-rendered markup also exercises the panel.
            defaultOpen: true,
            class: 'popover',
            children: (getContext) => [
              Trigger(
                { class: 'btn', children: () => text({ content: 'Filters' }) },
                getContext
              ),
              Content(
                {
                  class: 'popover__panel',
                  side: 'bottom',
                  align: 'start',
                  children: () =>
                    div({
                      class: 'popover__body',
                      children: [
                        span({ children: ['Depth'] }),
                        input({ class: 'text-input', placeholder: 'Any' })
                      ]
                    })
                },
                getContext
              )
            ]
          })
        ]
      })
    }
  },

  dialog: {
    title: 'Dialog',
    description:
      'A modal you can dismiss: Escape, a press outside, or the close button.',
    code: `const { Root, Trigger, Overlay, Content, Title, Description, Close } = dialog`,
    build: () => {
      const { Root, Trigger, Overlay, Content, Title, Description, Close } =
        dialog

      return div({
        children: [
          Root({
            defaultOpen: true,
            class: 'dialog',
            children: (getContext) =>
              div({
                children: [
                  Trigger(
                    {
                      class: 'btn',
                      children: () => text({ content: 'Open settings' })
                    },
                    getContext
                  ),
                  Overlay({ class: 'overlay' }, getContext),
                  Content(
                    {
                      class: 'dialog__panel',
                      children: (getCtx) =>
                        div({
                          children: [
                            Title(
                              {
                                children: () =>
                                  text({ content: 'Notification settings' })
                              },
                              getCtx
                            ),
                            Description(
                              {
                                children: () =>
                                  text({
                                    content:
                                      'Escape, a press outside, or the close button all dismiss this panel.'
                                  })
                              },
                              getCtx
                            ),
                            Close(
                              {
                                class: 'btn btn--ghost',
                                children: () => text({ content: 'Close' })
                              },
                              getCtx
                            )
                          ]
                        })
                    },
                    getContext
                  )
                ]
              })
          })
        ]
      })
    }
  },

  'number-field': {
    title: 'NumberField',
    description: 'Steps clamp to `min`/`max`; the input keeps its own text while typing.',
    code: `numberField({ defaultValue: 12, min: 0, max: 50, step: 5 })`,
    build: () =>
      numberField({
        defaultValue: 12,
        min: 0,
        max: 50,
        step: 5,
        class: 'nf',
        inputClass: 'nf__input',
        decrementClass: 'nf__btn',
        incrementClass: 'nf__btn'
      })
  },

  'pin-input': {
    title: 'PinInput',
    description: 'Arrow keys move between cells; pasting fills them in order.',
    code: `pinInput({ length: 4, type: 'numeric' })`,
    build: () =>
      pinInput({
        length: 4,
        type: 'numeric',
        defaultValue: '12',
        inputClass: 'pin__cell'
      })
  },

  'tags-input': {
    title: 'TagsInput',
    description: 'Enter commits a tag; Backspace focuses the last one.',
    code: `tagsInput({ defaultValue: ['design', 'ui'] })`,
    build: () =>
      tagsInput({
        defaultValue: ['design', 'ui'],
        class: 'tags',
        itemClass: 'tags__item',
        itemTextClass: 'tags__text',
        itemDeleteClass: 'tags__delete',
        inputClass: 'tags__input',
        inputPlaceholder: 'Add a tag…'
      })
  },

  'aspect-ratio': {
    title: 'AspectRatio',
    description: 'The child box is pinned to the ratio; the padding technique stays overridable.',
    code: `aspectRatio({ ratio: 16 / 9 }, () => div({ class: 'box' }))`,
    build: () =>
      row([
        aspectRatio({ ratio: 16 / 9, class: 'ar' }, () =>
          div({ class: 'ar__inner', children: ['16 : 9'] })
        ),
        aspectRatio({ ratio: 1, class: 'ar', style: { width: '6rem' } }, () =>
          div({ class: 'ar__inner', children: ['1 : 1'] })
        )
      ])
  },


  label: {
    title: 'Label',
    description: 'A real `<label>` — clicking it focuses the control it names.',
    code: `label({ htmlFor: 'seat', children: () => text({ content: 'Seats' }) })`,
    build: () =>
      div({
        class: 'stack',
        children: [
          label({ htmlFor: 'demo-seat', children: () => text({ content: 'Seats' }) }),
          input({ id: 'demo-seat', class: 'text-input', placeholder: 'Focuses when the label is clicked' })
        ]
      })
  },

  toggle: {
    title: 'Toggle',
    description: 'A two-state button: `aria-pressed`, not a checkbox.',
    code: `toggle({ defaultPressed: true, children: () => text({ content: 'Bold' }) })`,
    build: () =>
      row([
        toggle({ defaultPressed: true, class: 'toggle', children: () => text({ content: 'Bold' }) }),
        toggle({ class: 'toggle', children: () => text({ content: 'Italic' }) }),
        toggle({ disabled: true, class: 'toggle', children: () => text({ content: 'Disabled' }) })
      ])
  },

  'toggle-group': {
    title: 'ToggleGroup',
    description:
      '`single` acts as a radio group, `multiple` keeps independent toggles. Arrows move focus.',
    code: `toggleGroup({ type: 'multiple', items: [{ value: 'b', label: 'Bold' }] })`,
    build: () =>
      div({
        class: 'stack',
        children: [
          toggleGroup({
            type: 'single',
            defaultValue: ['left'],
            class: 'group',
            itemClass: 'toggle',
            items: [
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' }
            ]
          }),
          toggleGroup({
            type: 'multiple',
            defaultValue: ['bold', 'underline'],
            class: 'group',
            itemClass: 'toggle',
            items: [
              { value: 'bold', label: 'Bold' },
              { value: 'italic', label: 'Italic' },
              { value: 'underline', label: 'Underline' }
            ]
          })
        ]
      })
  },

  'radio-group': {
    title: 'RadioGroup',
    description:
      'Exactly one option; selection follows focus, so arrows both move and choose.',
    code: `radioGroup({ defaultValue: 'pro', items: [{ value: 'pro', label: 'Pro' }] })`,
    build: () =>
      radioGroup({
        defaultValue: 'pro',
        name: 'demo-plan',
        class: 'radio-group',
        itemClass: 'radio-item',
        indicatorClass: 'radio-dot',
        items: [
          { value: 'free', label: 'Free — one project' },
          { value: 'pro', label: 'Pro — unlimited projects' },
          { value: 'team', label: 'Team — sharing', disabled: true }
        ]
      })
  },

  slider: {
    title: 'Slider',
    description:
      'Arrow keys step, Page Up/Down move ten steps, Home/End jump, and the thumb drags.',
    code: `slider({ defaultValue: [30], min: 0, max: 100, step: 5 })`,
    build: () =>
      div({
        class: 'stack',
        children: [
          slider({
            defaultValue: [30],
            step: 5,
            class: 'slider',
            trackClass: 'slider__track',
            rangeClass: 'slider__range',
            thumbClass: 'slider__thumb'
          }),
          slider({
            defaultValue: [25, 70],
            class: 'slider',
            trackClass: 'slider__track',
            rangeClass: 'slider__range',
            thumbClass: 'slider__thumb'
          })
        ]
      })
  },

  /** Composed example: parts of several components in one form. */
  'sign-in-form': {
    title: 'Composed example',
    description:
      'Switch, checkboxes, number field and a separator composed into one settings card.',
    code: `// see demos/registry.ts → sign-in-form`,
    build: () =>
      div({
        class: 'card stack',
        children: [
          div({
            class: 'row row--between',
            children: [
              span({ children: ['Enable two-factor authentication'] }),
              switchControl({ defaultChecked: true, class: 'sw' })
            ]
          }),
          separator({ class: 'sep' }),
          div({
            class: 'row',
            children: [
              checkbox({ defaultChecked: true, class: 'cb', indicatorClass: 'cb__i' }),
              span({ children: ['Remember this device'] })
            ]
          }),
          div({
            class: 'row row--between',
            children: [
              span({ children: ['Seats'] }),
              numberField({
                defaultValue: 3,
                min: 1,
                max: 10,
                class: 'nf',
                inputClass: 'nf__input',
                decrementClass: 'nf__btn',
                incrementClass: 'nf__btn'
              })
            ]
          }),
          separator({ class: 'sep' }),
          input({ class: 'text-input', placeholder: 'Session label' })
        ]
      })
  }
}

/** Every demo id, used by the site index and by the visual smoke test. */
export const demoIds = Object.keys(demos)
