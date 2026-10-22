#import <React/RCTViewManager.h>

/**
 * @rasenjs/rn-html — `HTMLDivElement` (the native host for `<div>`).
 *
 * Backed by a plain UIView: layout is still Yoga (Fabric's default), so
 * everything RN's View supports behaves identically. Owning the component gives
 * us a place to add real HTML semantics later (overflow → scroll container,
 * z-index across parents).
 *
 * rn-dom resolves `div` → `HTMLDivElement` and Fabric instantiates this manager
 * through the legacy interop layer (see RnHtmlInterop.mm).
 */
@interface HtmlDivViewManager : RCTViewManager
@end
