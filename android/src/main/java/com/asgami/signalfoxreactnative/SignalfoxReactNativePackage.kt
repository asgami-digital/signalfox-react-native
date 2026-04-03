package com.asgami.signalfoxreactnative

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.HashMap

class SignalfoxReactNativePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return when (name) {
      SignalfoxReactNativeModule.NAME -> SignalfoxReactNativeModule(reactContext)
      "SignalfoxPurchaseEventEmitter" -> SignalfoxPurchaseEventEmitterModule(reactContext)
      else -> null
    }
  }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
      SignalfoxReactNativeModule.NAME to ReactModuleInfo(
        name = SignalfoxReactNativeModule.NAME,
        className = SignalfoxReactNativeModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true
      )
    )
  }
}
