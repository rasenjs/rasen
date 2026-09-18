# Styling

Rota ships no CSS. Every part exposes its state as an **ARIA attribute** or a
**`data-*` attribute**, and you style from the outside:

```css
/* the state, not a class name chosen by the library */
[role='switch'][aria-checked='true'] { background: #6366f1; }
[role='switch'] > span { transform: translateX(1.1rem); }
```

That is the whole contract. It survives refactors of the library, works with
any CSS strategy (plain CSS, CSS modules, Tailwind, `@rasenjs/tw`), and never
loses a specificity fight with an inline default.

## Attributes at a glance

| Attribute | Values | Seen on |
| --- | --- | --- |
| `data-state` | `open` / `closed` | Collapsible, Accordion |
| `data-state` | `checked` / `unchecked` / `indeterminate` | Switch, Checkbox |
| `data-state` | `active` / `inactive` / `hidden` | Tabs |
| `data-state` | `selected` / `unselected` | TagsInput items |
| `data-state` | `loading` / `loaded` / `error`, `visible` / `hidden` | Avatar |
| `data-state` | `loading` / `complete` / `indeterminate` | Progress |
| `data-state` | `on` / `off` | Toggle, ToggleGroup |
| `data-state` | `checked` / `unchecked` | RadioGroup |
| `data-orientation` | `vertical` / `horizontal` | Accordion, Separator, Tabs, Slider, ToggleGroup |
| `data-disabled` | present when disabled | Most components |
| `data-value` / `data-max` | numbers | Progress, TagsInput items |
| `data-ratio` | number | AspectRatio |

ARIA attributes carry the same information and are the ones assistive
technology reads (`aria-checked`, `aria-expanded`, `aria-selected`,
`aria-disabled`, `aria-valuenow`). Styling off the ARIA attribute means the
"state" you see and the state a screen reader announces can never drift apart.

## A worked example

The site's own stylesheet is exactly this exercise for all thirteen
components:

```css
/* Switch */
[role='switch'] { border-radius: 999px; background: #e5e7eb; transition: background 150ms ease; }
[role='switch'][aria-checked='true'] { background: #6366f1; }
[role='switch'] > span { transition: transform 150ms ease; }
[role='switch'][aria-checked='true'] > span { transform: translateX(1.1rem); }

/* Tabs */
[role='tab'][data-state='active'] { background: var(--surface); }
[role='tabpanel'][hidden] { display: none; }

/* Accordion */
[role='button'][data-state='open']::after { content: '–'; }
[data-state='closed'][role='region'] { display: none; }
```

<RotaDemo name="switch" />
<RotaDemo name="tabs" />
<RotaDemo name="accordion" />

## Functional defaults

A few things cannot be left to CSS without breaking the component's mechanism,
so those ship as inline defaults and stay overridable through `style`:

| Component | What, and why |
| --- | --- |
| AspectRatio | `position: relative`, `overflow: hidden` and the `padding-bottom` percentage — the ratio *is* that padding |
| Avatar | absolute positioning of image and fallback inside the root box |
| Separator | the 1px sizing — the line is the entire output |
| Progress indicator | `width`/`height` 100% so your track colour shows through |

Everything cosmetic — colour, radius, shadow, spacing, transition — is yours.
If a default gets in your way, override it: they are plain inline styles, not
`!important`.
