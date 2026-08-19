/**
 * usePressability — consumes rn-dom's synthesized press events and maintains
 * a `pressed` state.
 *
 * Layering (mirrors RN): rn-dom's event-system already implements the
 * responder → press synthesis (drivePress: onPressIn / onPressOut / onPress /
 * onLongPress, aligned with RN Pressability's state machine). The component
 * layer only needs to *consume* those synthesized events to maintain the
 * pressed state — it does not re-implement the state machine.
 *
 * RN equivalent: Pressability lives in the component layer (Pressable /
 * TouchableOpacity each instantiate Pressability). Here the shared pressed
 * management (a ref + forwarded onPressIn/Out) is extracted into a composable
 * to avoid duplication across the touchable components.
 *
 * Returns:
 *  - pressed: readonly ref, set true on onPressIn / false on onPressOut
 *  - pressEvents: event object bound to the host View (onPressIn/Out +
 *    passthrough onPress/onLongPress), maintaining pressed before calling
 *    the user handler.
 */

import { getReactiveRuntime, ref, type Ref } from '@rasenjs/core'

export interface PressHandlers {
  onPressIn?: ((e?: unknown) => void) | null
  onPressOut?: ((e?: unknown) => void) | null
  onPress?: ((e?: unknown) => void) | null
  onLongPress?: ((e?: unknown) => void) | null
}

export interface PressEvents {
  onPressIn: (e?: unknown) => void
  onPressOut: (e?: unknown) => void
  onPress?: ((e?: unknown) => void) | null
  onLongPress?: ((e?: unknown) => void) | null
}

export function usePressability(handlers: PressHandlers): {
  pressed: Ref<boolean>
  pressEvents: PressEvents
} {
  const runtime = getReactiveRuntime()
  const pressed = ref(false)

  function handlePressIn(e?: unknown): void {
    runtime.setValue(pressed, true)
    handlers.onPressIn?.(e)
  }
  function handlePressOut(e?: unknown): void {
    runtime.setValue(pressed, false)
    handlers.onPressOut?.(e)
  }

  return {
    pressed,
    pressEvents: {
      onPressIn: handlePressIn,
      onPressOut: handlePressOut,
      onPress: handlers.onPress ?? null,
      onLongPress: handlers.onLongPress ?? null,
    },
  }
}