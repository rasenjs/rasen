#import "HtmlDivViewManager.h"

#import <React/RCTView.h>

@implementation HtmlDivViewManager

RCT_EXPORT_MODULE(HTMLDivElement)

- (UIView *)view
{
  return [RCTView new];
}

@end
