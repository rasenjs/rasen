/**
 * @rasenjs/rn-html — `HTMLDivElement`
 *
 * The native host for the `div` tag. It is a plain flex container: layout is
 * still Yoga (Fabric's default), so everything RN's View supports behaves the
 * same. The point of owning the component is to have a place to add real HTML
 * semantics later (overflow → scroll container, z-index across parents).
 *
 * rn-dom resolves `div` → `HTMLDivElement` and Fabric creates this component.
 */
package com.rasenjs.rnhtml

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.views.view.ReactViewGroup

public class HtmlDivViewManager : ViewGroupManager<ReactViewGroup>() {
  /** Fabric component name — must match `nativeNameFor('div')` in src/index.ts. */
  override fun getName(): String = "HTMLDivElement"

  override fun createViewInstance(context: ThemedReactContext): ReactViewGroup =
      ReactViewGroup(context)
}
