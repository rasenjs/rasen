/**
 * @rasenjs/rn-html — `HTMLSpanElement`
 *
 * The native host for the `span` tag. It extends RN's own text manager so it
 * inherits the text pipeline: nested `RCTRawText` children have no view of
 * their own, they are folded into the parent text's attributed string by
 * `TextLayoutManager`. A hand-rolled text view would never see them.
 */
package com.rasenjs.rnhtml

import com.facebook.react.views.text.ReactTextViewManager

public class HtmlSpanViewManager : ReactTextViewManager() {
  /** Fabric component name — must match `nativeNameFor('span')` in src/index.ts. */
  override fun getName(): String = "HTMLSpanElement"
}
