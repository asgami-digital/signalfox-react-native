package com.asgami.signalfoxreactnative

import com.facebook.react.bridge.ReactApplicationContext

class SignalfoxReactNativeModule(reactContext: ReactApplicationContext) :
  NativeSignalfoxReactNativeSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeSignalfoxReactNativeSpec.NAME
  }
}
