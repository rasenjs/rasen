# Accessibility

Rota components are built around the ARIA patterns the roles imply, and the
parts carry the wiring so it cannot be forgotten.

## Roles come from the parts

| Component | Roles |
| --- | --- |
| Accordion | `heading` on the header, `region` on the content, trigger linked by `aria-controls` / `aria-labelledby` |
| AlertDialog | `alertdialog` with `aria-modal`, title and description wired to `aria-labelledby` / `aria-describedby` |
| Checkbox | `checkbox` with `aria-checked` (`true` / `false` / `mixed`) |
| PinInput | `group` |
| Progress | `progressbar` with `aria-valuemin` / `aria-valuemax` / `aria-valuenow` / `aria-valuetext` |
| Separator | `separator` (omitted when `decorative`) |
| Switch | `switch` with `aria-checked` |
| Tabs | `tablist` / `tab` / `tabpanel` with `aria-selected` |
| TagsInput | `listbox` with `option` children and `aria-selected` |
| NumberField | `group` |

## Keyboard maps

Every interactive part is a real `<button>` or `<input>`, so the native
behaviour is there first. On top of that:

| Component | Keys |
| --- | --- |
| Accordion | `Enter` / `Space` toggle; `ArrowUp` / `ArrowDown` (or left/right when horizontal) move between triggers; `Home` / `End` jump to the ends |
| Collapsible, Switch, Checkbox | `Enter` / `Space` toggle |
| Tabs | `Enter` / `Space` activate the focused tab |
| PinInput | typing advances, `Backspace` / `Delete` clear or step back, arrows move, paste fills from the current cell |
| TagsInput | `Enter` commits, `Backspace` on an empty input focuses the last tag, arrows move between tags, `Backspace` / `Delete` remove the focused tag, `Escape` returns to the input |
| AlertDialog | `Escape` is deliberately *ignored* unless you pass `onEscapeKeyDown` |

<RotaDemo name="tags-input" />

## Focus

Focus is moved with the browser's own API on elements the parts hold through
refs:

| Component | Behaviour |
| --- | --- |
| AlertDialog | Focus moves to the action button (then cancel, then the content box) when the dialog opens; the previously focused element is remembered |
| Accordion | `focusTrigger(index)` moves focus between enabled triggers, skipping disabled ones |
| PinInput | Each cell keeps its own ref; navigation never searches the DOM |
| TagsInput | Selecting a tag focuses it, and the input is reached through `inputRef` |

Disabled items are skipped rather than focused: `aria-disabled` plus
`data-disabled` are set on the parts, and the handlers check them before doing
anything.

<RotaDemo name="accordion" />

## What you still own

Rota gives you the behaviour and the attributes. You own:

- **Visible focus styles** — the parts are focusable, the outline is your CSS.
- **Colour contrast** and the rest of the visual layer.
- **Transitions** — animate on `data-state`, the attributes are always current.
