package com.asgami.signalfoxreactnative

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import android.os.Build
import java.util.UUID

class SignalfoxReactNativeModule(reactContext: ReactApplicationContext) :
  NativeSignalfoxReactNativeSpec(reactContext) {

  private val appContext = reactContext.applicationContext
  private val prefs by lazy {
    appContext.getSharedPreferences("signalfox_react_native", Context.MODE_PRIVATE)
  }

  private val purchaseTracker by lazy {
    SignalfoxPurchaseAnalyticsTracker(reactContext)
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

  override fun getDeviceModel(promise: Promise) {
    try {
      promise.resolve(Build.MODEL ?: "")
    } catch (error: Exception) {
      promise.reject("GET_DEVICE_MODEL_ERROR", "Failed to resolve device model", error)
    }
  }

  override fun getOsVersion(promise: Promise) {
    try {
      promise.resolve(Build.VERSION.RELEASE ?: "")
    } catch (error: Exception) {
      promise.reject("GET_OS_VERSION_ERROR", "Failed to resolve OS version", error)
    }
  }

  override fun startNativePurchaseAnalytics(promise: Promise) {
    try {
      purchaseTracker.startNativePurchaseAnalytics()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("START_NATIVE_PURCHASE_ANALYTICS_ERROR", "Failed to start native purchase analytics", e)
    }
  }

  override fun stopNativePurchaseAnalytics(promise: Promise) {
    try {
      purchaseTracker.stopNativePurchaseAnalytics()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("STOP_NATIVE_PURCHASE_ANALYTICS_ERROR", "Failed to stop native purchase analytics", e)
    }
  }

  override fun reconcileNativePurchases(promise: Promise) {
    try {
      purchaseTracker.reconcileNativePurchases(promise)
    } catch (e: Exception) {
      promise.reject("RECONCILE_NATIVE_PURCHASES_ERROR", "Failed to reconcile native purchases", e)
    }
  }

  override fun beginHeuristicPaywallSession(promise: Promise) {
    try {
      purchaseTracker.beginHeuristicPaywallSession()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject(
        "BEGIN_HEURISTIC_PAYWALL_SESSION_ERROR",
        "Failed to begin heuristic paywall session",
        e
      )
    }
  }

  override fun endHeuristicPaywallSession(promise: Promise) {
    try {
      promise.resolve(purchaseTracker.endHeuristicPaywallSession())
    } catch (e: Exception) {
      promise.reject(
        "END_HEURISTIC_PAYWALL_SESSION_ERROR",
        "Failed to end heuristic paywall session",
        e
      )
    }
  }

  companion object {
    const val NAME = NativeSignalfoxReactNativeSpec.NAME
  }
}
