# State & reactivity

## Controlled and uncontrolled

Every stateful component takes both forms, the same way wherever it appears:

```ts
// Uncontrolled: the component owns the state.
checkbox({ defaultChecked: true })

// Controlled: the value is yours; the component only reports changes.
checkbox({ checked: isDone(), onCheckedChange: (next) => isDone.set(next) })
```

In controlled mode the part never writes the model — it calls
`onCheckedChange` / `onValueChange` / `onOpenChange` and renders whatever you
pass back. That is also what makes the value observable from the outside
without the component knowing anything about your state container.

<RotaDemo name="checkbox" />

## Props accept a value, a ref, or a getter

Every value-carrying prop is a `PropValue<T>`. The JSX transform wraps a
dynamic expression in a getter, so this is how a controlled component follows
your state:

```tsx
<Switch checked={enabled.value} onCheckedChange={(next) => (enabled.value = next)} />
<Progress value={uploaded.value} max={total.value} />
<Slider value={range.value} onValueCommit={(next) => save(next)} />
```

Reading such a prop directly would compare the function itself; components read
them through the runtime, so a ref or a getter is tracked like any other
binding.

## Contexts are getter-backed

A context is a plain object, but the reactive fields are **getters**. Reading
them inside a binding registers a dependency, which is how one part follows
another without holding a reference to its element:

```ts
// switch root
const getContext = () => ({
  get checked() { return isChecked() },
  get disabled() { return isDisabled() }
})

// thumb — reacts to the root because the read happens inside the binding
span({ 'data-state': () => (getContext?.().checked ? 'checked' : 'unchecked') })
```

<RotaDemo name="switch" />

## Element refs

When a part genuinely needs an element — to move focus, or to run something
once it is in the DOM — it goes through a **ref cell** rather than a DOM query:

```ts
const cell = createElementRef<HTMLInputElement>(rt)   // internal helper
input({ ref: cell })

// once the element is live (this runs synchronously during mount)
rt.subscribe(() => cell.value, (el) => el?.focus())
```

| Component | Cells it exposes |
| --- | --- |
| PinInput | `cellRef(index)` for each position |
| TagsInput | `rootRef`, `inputRef` |
| Accordion | `triggerRef(itemValue)` |
| AlertDialog | `contentRef`, action/cancel elements |

<RotaDemo name="pin-input" />

## Reactivity checklist

- Set a runtime before mounting (`useReactiveRuntime()`, `setReactiveRuntime()`).
- Prefer getters (`() => expr`) for reactive props: bindings subscribe to them.
- Ref values are unwrapped by the runtime when a binding reads them.
- Nothing polls: state changes propagate through the runtime's subscriptions.

<RotaDemo name="sign-in-form" />
