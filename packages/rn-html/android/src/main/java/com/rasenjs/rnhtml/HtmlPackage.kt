/**
 * @rasenjs/rn-html — React package registration (autolinked).
 *
 * Registers every native component this package ships under the name rn-dom
 * asks for via its `HTML<Tag>Element` fallback.
 */
package com.rasenjs.rnhtml

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

public class HtmlPackage : BaseReactPackage() {
  override fun getModule(
      name: String,
      reactContext: ReactApplicationContext,
  ): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
      ReactModuleInfoProvider { emptyMap() }

  override fun createViewManagers(
      reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = listOf(HtmlDivViewManager(), HtmlSpanViewManager())
}
