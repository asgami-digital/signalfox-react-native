package com.asgami.signalfoxreactnative

import android.util.Log
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.PurchasesResult
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.math.BigInteger

internal final class SignalfoxPurchaseAnalyticsTracker(
  private val reactContext: ReactApplicationContext
) {
  private companion object {
    const val TAG = "SignalfoxPurchaseAnalytics"
  }

  private var billingClient: BillingClient? = null
  @Volatile private var isStarted: Boolean = false

  private data class PriceInfo(
    val price: Double?,
    val currency: String?,
    val hasTrial: Boolean?,
    val trialDays: Int?,
  )

  private val purchasesUpdatedListener = PurchasesUpdatedListener { billingResult, purchases ->
    if (!isStarted) return@PurchasesUpdatedListener

    Log.d(TAG, "purchasesUpdatedListener called: responseCode=${billingResult.responseCode} debugMessage=${billingResult.debugMessage}")
    if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
      purchases?.forEach { purchase ->
        Log.d(
          TAG,
          "Purchase callback OK state=${purchase.purchaseState} productId=${purchase.products.firstOrNull()} token=${purchase.purchaseToken}"
        )
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
          handlePurchaseCompleted(purchase)
        }
      }
      return@PurchasesUpdatedListener
    }

    val isCancelled =
      billingResult.responseCode == BillingClient.BillingResponseCode.USER_CANCELED

    val eventName = if (isCancelled) {
      "purchase_cancelled"
    } else {
      "purchase_failed"
    }

    val productFromPurchase = purchases?.firstOrNull()?.products?.firstOrNull()

    val payload = Arguments.createMap().apply {
      putString("eventName", eventName)
      putString("platform", "android")
      putString("store", "google_play")
      putString("errorCode", billingResult.responseCode.toString())
      putString("errorMessage", billingResult.debugMessage)
      productFromPurchase?.let { putString("productId", it) }
    }

    Log.d(
      TAG,
      "Emitting failure event=$eventName productId=$productFromPurchase (si falta, la app debe llamar notifyPurchaseStarted antes del flow para adjuntar sku en JS)"
    )
    sendEvent(payload)
  }

  private fun ensureBillingClient(): BillingClient {
    val existing = billingClient
    if (existing != null) return existing

    val client = BillingClient.newBuilder(reactContext)
      .enablePendingPurchases()
      .setListener(purchasesUpdatedListener)
      .build()
    billingClient = client
    return client
  }

  fun startNativePurchaseAnalytics() {
    if (isStarted) return
    isStarted = true

    Log.d(TAG, "startNativePurchaseAnalytics()")
    val client = ensureBillingClient()
    client.startConnection(object : BillingClientStateListener {
      override fun onBillingSetupFinished(billingResult: BillingResult) {
        Log.d(TAG, "BillingClient onBillingSetupFinished code=${billingResult.responseCode} debug=${billingResult.debugMessage}")
        // No emitimos aquí. Esperamos callbacks o reconciliación.
      }

      override fun onBillingServiceDisconnected() {
        Log.d(TAG, "BillingClient onBillingServiceDisconnected")
        // El servicio puede desconectarse. No hacemos reconexión automática para evitar bucles.
      }
    })
  }

  fun stopNativePurchaseAnalytics() {
    Log.d(TAG, "stopNativePurchaseAnalytics()")
    isStarted = false
    billingClient?.endConnection()
    billingClient = null
  }

  fun reconcileNativePurchases(promise: Promise) {
    try {
      Log.d(TAG, "reconcileNativePurchases() called")
      val client = ensureBillingClient()

      val productIds = mutableSetOf<String>()
      val done = intArrayOf(0)

      fun maybeEmit() {
        if (done[0] < 2) return

        if (productIds.isEmpty()) {
          Log.d(TAG, "reconcileNativePurchases: no restored products")
          promise.resolve(null)
          return
        }

        Log.d(TAG, "reconcileNativePurchases: restoredProductIds=${productIds}")
        val restored = Arguments.createArray().apply {
          productIds.forEach { pushString(it) }
        }

        val restorePayload = Arguments.createMap().apply {
          putString("eventName", "restore_completed")
          putString("platform", "android")
          putString("store", "google_play")
          putArray("restoredProductIds", restored)
        }
        Log.d(TAG, "Emitting restore_completed")
        sendEvent(restorePayload)

        promise.resolve(null)
      }

      fun query(productType: String) {
        val params = QueryPurchasesParams.newBuilder()
          .setProductType(productType)
          .build()

        client.queryPurchasesAsync(params) { result, purchases ->
          Log.d(TAG, "queryPurchasesAsync type=$productType response=${result.responseCode} debug=${result.debugMessage} count=${purchases.size}")
          if (result.responseCode == BillingClient.BillingResponseCode.OK) {
            purchases.forEach { p ->
              p.products.firstOrNull()?.let { productIds.add(it) }
            }
          }
          done[0] += 1
          maybeEmit()
        }
      }

      query(BillingClient.ProductType.INAPP)
      query(BillingClient.ProductType.SUBS)
    } catch (e: Exception) {
      promise.reject("RECONCILE_PURCHASES_ERROR", "Failed to reconcile purchases", e)
    }
  }

  private fun handlePurchaseCompleted(purchase: Purchase) {
    val productId = purchase.products.firstOrNull() ?: run {
      Log.w(TAG, "STUCK: handlePurchaseCompleted — purchase has no product id in products[]")
      return
    }

    Log.d(TAG, "handlePurchaseCompleted productId=$productId token=${purchase.purchaseToken} (next: queryProductDetails)")
    queryProductDetails(productId) { details ->
      val productType = if (details?.productType == BillingClient.ProductType.SUBS) {
        "subscription"
      } else {
        "inapp"
      }

      val priceInfo = extractPriceAndTrial(details)

      val purchasePayload = Arguments.createMap().apply {
        putString("eventName", "purchase_completed")
        putString("platform", "android")
        putString("store", "google_play")
        putString("productId", productId)
        putString("productType", productType)
        priceInfo.price?.let { putDouble("price", it) }
        priceInfo.currency?.let { putString("currency", it) }
        priceInfo.hasTrial?.let { putBoolean("hasTrial", it) }
        priceInfo.trialDays?.let { putInt("trialDays", it) }
        // BillingClient no provee originalTransactionId directamente.
        putString("transactionId", purchase.purchaseToken)
        putString("environment", "unknown")
      }

      Log.d(
        TAG,
        "Emitting purchase_completed productId=$productId productType=$productType price=${priceInfo.price} currency=${priceInfo.currency} hasTrial=${priceInfo.hasTrial} trialDays=${priceInfo.trialDays}"
      )
      sendEvent(purchasePayload)

      if (productType == "subscription") {
        val subPayload = Arguments.createMap().apply {
          putString("eventName", "subscription_started")
          putString("platform", "android")
          putString("store", "google_play")
          putString("productId", productId)
          putString("productType", productType)
          priceInfo.price?.let { putDouble("price", it) }
          priceInfo.currency?.let { putString("currency", it) }
          putString("transactionId", purchase.purchaseToken)
          putString("environment", "unknown")
        }
        Log.d(TAG, "Emitting subscription_started for $productId")
        sendEvent(subPayload)
      }
    }
  }

  private fun sendEvent(payload: com.facebook.react.bridge.WritableMap) {
    val name = payload.getString("eventName") ?: "unknown"
    val pid = payload.getString("productId") ?: ""
    Log.d(
      TAG,
      "Native → JS: DeviceEventEmitter.emit channel=${SignalfoxPurchaseEventEmitterModule.PURCHASE_EVENT_CHANNEL} eventName=$name productId=$pid"
    )
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(SignalfoxPurchaseEventEmitterModule.PURCHASE_EVENT_CHANNEL, payload)
  }

  private fun queryProductDetails(
    productId: String,
    cb: (ProductDetails?) -> Unit
  ) {
    val client = billingClient ?: run {
      Log.w(TAG, "STUCK: queryProductDetails — billingClient is null (startNativePurchaseAnalytics not run or stopped?)")
      cb(null)
      return
    }

    // Intentamos SUBS primero.
    Log.d(TAG, "queryProductDetails START productId=$productId (first: SUBS)")
    val subsParams = QueryProductDetailsParams.newBuilder()
      .setProductList(
        listOf(
          QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        )
      )
      .build()

    client.queryProductDetailsAsync(subsParams) { _, list ->
      val subs = list.firstOrNull()
      if (subs != null) {
        Log.d(TAG, "queryProductDetails got SUBS productId=$productId")
        cb(subs)
        return@queryProductDetailsAsync
      }

      Log.d(TAG, "queryProductDetails no SUBS, trying INAPP productId=$productId")
      val inappParams = QueryProductDetailsParams.newBuilder()
        .setProductList(
          listOf(
            QueryProductDetailsParams.Product.newBuilder()
              .setProductId(productId)
              .setProductType(BillingClient.ProductType.INAPP)
              .build()
          )
        )
        .build()

      client.queryProductDetailsAsync(inappParams) { _, inappList ->
        val d = inappList.firstOrNull()
        if (d == null) {
          Log.w(TAG, "queryProductDetails STUCK/empty: no ProductDetails for productId=$productId (check Play Console / sku)")
        } else {
          Log.d(TAG, "queryProductDetails got INAPP productId=$productId")
        }
        cb(d)
      }
    }
  }

  private fun extractPriceAndTrial(details: ProductDetails?): PriceInfo {
    if (details == null) return PriceInfo(null, null, null, null)

    return if (details.productType == BillingClient.ProductType.SUBS) {
      val offer = details.subscriptionOfferDetails?.firstOrNull()
      val phases = offer?.pricingPhases?.pricingPhaseList

      // Inferimos trial/intro si existe una fase con precio 0.
      // No garantizamos (sin más metadatos) que la compra haya usado esa fase.
      val trialPhase = phases?.firstOrNull { phase ->
        val micros: BigInteger? = try {
          phase.priceAmountMicros
        } catch {
          null
        }
        micros == BigInteger.ZERO
      }

      val hasTrial = trialPhase != null

      val currency = trialPhase?.priceCurrencyCode ?: phases?.firstOrNull()?.priceCurrencyCode

      val chosen = phases?.firstOrNull()
      val priceMicros = chosen?.priceAmountMicros
      val price = priceMicros?.let { micros ->
        micros.toDouble() / 1_000_000.0
      }

      val trialDays = parseDaysFromBillingPeriod(trialPhase?.billingPeriod)

      PriceInfo(
        price = price,
        currency = currency,
        hasTrial = hasTrial,
        trialDays = trialDays
      )
    } else {
      val oneTime = details.oneTimePurchaseOfferDetails
      val priceMicros = oneTime?.priceAmountMicros
      val price = priceMicros?.let { micros ->
        micros.toDouble() / 1_000_000.0
      }
      val currency = oneTime?.priceCurrencyCode ?: details.priceCurrencyCode
      PriceInfo(price = price, currency = currency, hasTrial = null, trialDays = null)
    }
  }

  private fun parseDaysFromBillingPeriod(billingPeriod: String?): Int? {
    if (billingPeriod == null) return null
    // Ejemplos típicos: "P7D", "P1W", "P1M"
    val m = Regex("P(\\d+)([DWMY])").find(billingPeriod) ?: return null
    val value = m.groupValues[1].toIntOrNull() ?: return null
    return when (m.groupValues[2]) {
      "D" -> value
      "W" -> value * 7
      "M" -> value * 30
      "Y" -> value * 365
      else -> null
    }
  }
}

