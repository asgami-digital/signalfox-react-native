package com.asgami.signalfoxreactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.util.UUID

class SignalfoxReactNativeModule(reactContext: ReactApplicationContext) :
  NativeSignalfoxReactNativeSpec(reactContext) {

  private val appContext = reactContext.applicationContext
  private val prefs by lazy {
    appContext.getSharedPreferences("signalfox_react_native", ReactApplicationContext.MODE_PRIVATE)
  }

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  override fun getAppVersion(promise: Promise) {
    try {
      val packageInfo = appContext.packageManager.getPackageInfo(appContext.packageName, 0)
      val version = packageInfo.versionName ?: ""
      promise.resolve(version)
    } catch (error: Exception) {
      promise.reject("GET_APP_VERSION_ERROR", "Failed to resolve app version", error)
    }
  }

  override fun getAnonymousId(promise: Promise) {
    try {
      val key = "signalfox_anonymous_id"
      var anonymousId = prefs.getString(key, null)
      if (anonymousId.isNullOrEmpty()) {
        anonymousId = UUID.randomUUID().toString()
        prefs.edit().putString(key, anonymousId).apply()
      }
      promise.resolve(anonymousId)
    } catch (error: Exception) {
      promise.reject("GET_ANONYMOUS_ID_ERROR", "Failed to get anonymous id", error)
    }
  }

  companion object {
    const val NAME = NativeSignalfoxReactNativeSpec.NAME
  }
}
