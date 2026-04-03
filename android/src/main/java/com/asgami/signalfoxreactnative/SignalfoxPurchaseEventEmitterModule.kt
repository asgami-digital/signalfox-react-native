package com.asgami.signalfoxreactnative

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class SignalfoxPurchaseEventEmitterModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "SignalfoxPurchaseEventEmitter"

  @ReactMethod
  fun addListener(eventName: String) {
    // required for NativeEventEmitter in RN
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // required for NativeEventEmitter in RN
  }

  fun emitPurchaseEvent(eventName: String, params: Any?) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  companion object {
    const val PURCHASE_EVENT_CHANNEL = "signalfox_purchase_event"
  }
}

