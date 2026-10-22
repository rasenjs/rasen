#import <Foundation/Foundation.h>
#import <React/RCTLegacyViewManagerInteropComponentView.h>

/**
 * @rasenjs/rn-html — iOS Fabric interop registration.
 *
 * On iOS, Fabric only routes a component through the legacy RCTViewManager
 * interop layer if its name is in `RCTLegacyViewManagerInteropComponentView`'s
 * whitelist (by default just DatePicker/ProgressView/MaskedView/ART*). Anything
 * else falls back to <UnimplementedView>, the pink error box.
 *
 * So each rn-html component must be registered here. This runs in +load, before
 * any view is created, so no AppDelegate change is needed.
 */
@interface RnHtmlInterop : NSObject
@end

@implementation RnHtmlInterop

+ (void)load
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    [RCTLegacyViewManagerInteropComponentView supportLegacyViewManagerWithName:@"HTMLDivElement"];
    // HTMLSpanElement is NOT registered yet: iOS has no legacy text view manager
    // left to reuse (text is `RCTParagraphComponentView`, a native Fabric
    // component), and a UILabel-based manager would never see child raw-text
    // nodes. Until span gets a real Fabric component it renders as
    // <UnimplementedView> on iOS — a visible failure rather than a blank one.
    // Android does support span (it subclasses ReactTextViewManager).
  });
}

@end
