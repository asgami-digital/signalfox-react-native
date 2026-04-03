import Foundation
import StoreKit

import React

private let kSignalfoxPurchaseEventChannel = "signalfox_purchase_event"

/// ISO 4217 best-effort. StoreKit 2 `Product` no tiene `priceLocale` (eso es `SKProduct` / StoreKit 1).
/// Desde iOS 16: `priceFormatStyle.locale`. En iOS 15 solo existe `price`/`displayPrice` sin código ISO;
/// usamos el locale actual del dispositivo como aproximación de la tienda.
@available(iOS 15.0, *)
private func storeKitCurrencyCode(for product: Product) -> String? {
  if #available(iOS 16.0, *) {
    let locale = product.priceFormatStyle.locale
    return locale.currency?.identifier ?? locale.currencyCode
  }
  return Locale.current.currencyCode
}

@objc(SignalfoxPurchaseEventEmitter)
final class SignalfoxPurchaseEventEmitter: RCTEventEmitter {
  private static weak var sharedInstance: SignalfoxPurchaseEventEmitter?

  override init() {
    super.init()
    SignalfoxPurchaseEventEmitter.sharedInstance = self
  }

  @objc
  static func emit(_ body: [String: Any]) {
    // Solo emitimos si hay un emitter activo en el runtime de RN.
    guard let emitter = sharedInstance else {
      NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] emit() called but sharedInstance is nil. body=%@", String(describing: body["eventName"]))
      return
    }
    let eventName = body["eventName"] as? String ?? "unknown"
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] Emitting %@", eventName)
    emitter.sendEvent(withName: kSignalfoxPurchaseEventChannel, body: body)
  }

  override func supportedEvents() -> [String]! {
    return [kSignalfoxPurchaseEventChannel]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
}

@objc(SignalfoxPurchaseAnalyticsTracker)
final class SignalfoxPurchaseAnalyticsTracker: NSObject {
  @objc static let shared = SignalfoxPurchaseAnalyticsTracker()

  private var isRunning: Bool = false
  private var transactionUpdatesTask: Task<Void, Never>?
  private var paymentQueueObserver: SKPaymentTransactionObserver?

  private override init() {
    super.init()
  }

  @objc
  func startNativePurchaseAnalytics() {
    guard !isRunning else { return }
    isRunning = true
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] startNativePurchaseAnalytics()")

    // SKPaymentQueue cubre cancelaciones y fallos del flujo de compra.
    let observer = PaymentQueueObserver()
    paymentQueueObserver = observer
    SKPaymentQueue.default().add(observer)
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue observer added")

    // StoreKit 2 cubre completados (incluyendo restauraciones a nivel de transacción).
    if #available(iOS 15.0, *) {
      transactionUpdatesTask = Task.detached(priority: .background) { [weak self] in
        guard let self else { return }
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] transactionUpdatesTask started")
        await self.listenToTransactionUpdates()
      }
    }
  }

  @objc
  func stopNativePurchaseAnalytics() {
    guard isRunning else { return }
    isRunning = false
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] stopNativePurchaseAnalytics()")

    if let observer = paymentQueueObserver {
      SKPaymentQueue.default().remove(observer)
      NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue observer removed")
    }
    paymentQueueObserver = nil

    transactionUpdatesTask?.cancel()
    transactionUpdatesTask = nil
  }

  @objc(reconcileNativePurchases:reject:)
  func reconcileNativePurchases(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject reject: @escaping RCTPromiseRejectBlock
  ) {
    Task.detached(priority: .background) { [weak self] in
      guard let self else {
        resolve(nil)
        return
      }

      if #available(iOS 15.0, *) {
        do {
          let restoredProductIds = try await self.collectCurrentEntitlements()
          NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] reconcileNativePurchases entitlements=%d", restoredProductIds.count)

          guard !restoredProductIds.isEmpty else {
            resolve(nil)
            return
          }

          SignalfoxPurchaseEventEmitter.emit([
            "eventName": "restore_completed",
            "platform": "ios",
            "store": "app_store",
            "restoredProductIds": restoredProductIds
          ])

          SignalfoxPurchaseEventEmitter.emit([
            "eventName": "purchase_state_reconciled",
            "platform": "ios",
            "store": "app_store",
            "restoredProductIds": restoredProductIds
          ])

          resolve(nil)
        } catch {
          reject("RECONCILE_PURCHASES_ERROR", "Failed to reconcile purchases", error)
        }
      } else {
        // Sin StoreKit2 no podemos hacer reconciliación fiable.
        resolve(nil)
      }
    }
  }
}

// MARK: - Observación SKPaymentQueue (cancel/fail/start)

private final class PaymentQueueObserver: NSObject, SKPaymentTransactionObserver {
  private func storeKitPriceInfo(for productId: String) async -> (price: Double?, currency: String?, productType: String?, hasTrial: Bool, trialDays: Int?) {
    guard #available(iOS 15.0, *) else {
      return (nil, nil, nil, false, nil)
    }
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] storeKitPriceInfo for %@", productId)
    do {
      let products = try await Product.products(for: [productId])
      guard let product = products.first else {
        return (nil, nil, nil, false, nil)
      }

      let price = NSDecimalNumber(decimal: product.price).doubleValue
      let currency = storeKitCurrencyCode(for: product)

      let isSubscription = product.subscription != nil
      let introOffer = product.subscription?.introductoryOffer

      // Inferimos trial/intro si el producto tiene una oferta configurada.
      // StoreKit no nos da (en este puente) la certeza de que ESA transacción
      // haya sido efectivamente la que usó el intro offer.
      var hasTrial = introOffer != nil
      var trialDays: Int? = nil

      if let introOffer {
        let period = introOffer.period
        // Nota: calculamos una aproximación en días.
        // Si el periodo está en meses/años, esto es inferido.
        switch period.unit {
        case .day:
          trialDays = period.value
        case .week:
          trialDays = period.value * 7
        case .month:
          trialDays = period.value * 30
        case .year:
          trialDays = period.value * 365
        @unknown default:
          break
        }
      }

      return (price, currency, isSubscription ? "subscription" : "inapp", hasTrial, trialDays)
    } catch {
      return (nil, nil, nil, false, nil)
    }
  }

  private func emitPurchaseStarted(productId: String) {
    if #available(iOS 15.0, *) {
      Task.detached(priority: .background) {
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] emit purchase_started for %@", productId)
        let info = await self.storeKitPriceInfo(for: productId)
        SignalfoxPurchaseEventEmitter.emit([
          "eventName": "purchase_started",
          "platform": "ios",
          "store": "app_store",
          "productId": productId,
          "productType": info.productType as Any,
          "price": info.price as Any,
          "currency": info.currency as Any,
          "hasTrial": info.hasTrial,
          "trialDays": info.trialDays as Any,
        ])
      }
    } else {
      SignalfoxPurchaseEventEmitter.emit([
        "eventName": "purchase_started",
        "platform": "ios",
        "store": "app_store",
        "productId": productId
      ])
    }
  }

  private func emitPurchaseFailedOrCancelled(transaction: SKPaymentTransaction) {
    let productId = transaction.payment.productIdentifier
    let error = transaction.error

    let skError = error as? SKError
    let isCancelled = skError?.code == .paymentCancelled

    let errorCode: String? = skError.map { String(describing: $0.code.rawValue) }
    let errorMessage: String? = error?.localizedDescription

    let eventName = isCancelled ? "purchase_cancelled" : "purchase_failed"
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] emit %@ for %@ token=%@", eventName, productId, String(describing: transaction.transactionIdentifier))
    SignalfoxPurchaseEventEmitter.emit([
      "eventName": eventName,
      "platform": "ios",
      "store": "app_store",
      "productId": productId,
      "transactionId": transaction.transactionIdentifier as Any,
      "originalTransactionId": transaction.original?.transactionIdentifier as Any,
      "errorCode": errorCode as Any,
      "errorMessage": errorMessage as Any
    ])
  }

  func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
    for transaction in transactions {
      switch transaction.transactionState {
      case .purchasing:
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue state=purchasing product=%@", transaction.payment.productIdentifier)
        emitPurchaseStarted(productId: transaction.payment.productIdentifier)
      case .failed:
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue state=failed product=%@", transaction.payment.productIdentifier)
        emitPurchaseFailedOrCancelled(transaction: transaction)
      default:
        // Para completados/restaurados usamos StoreKit2 (Transaction.updates) para reducir duplicados.
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue state=other=%ld product=%@", transaction.transactionState.rawValue, transaction.payment.productIdentifier)
        break
      }
    }
  }
}

// MARK: - StoreKit 2 (purchase_completed + subscription/trial)

private extension SignalfoxPurchaseAnalyticsTracker {
  @available(iOS 15.0, *)
  func listenToTransactionUpdates() async {
    for await verification in Transaction.updates {
      if Task.isCancelled { return }

      do {
        let transaction = try verification.payloadValue
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] Transaction.updates verified productID=%@", transaction.productID)
        await emitForVerifiedTransaction(transaction)
      } catch {
        // Las transacciones no verificadas se omiten para no registrar eventos inexactos.
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] Transaction.updates unverified payload skipped")
      }
    }
  }

  @available(iOS 15.0, *)
  func emitForVerifiedTransaction(_ transaction: Transaction) async {
    let productId = transaction.productID
    let store: String = "app_store"

    var platform: String = "ios"

    // StoreKit2: `transaction.environment` está disponible desde iOS 16.
    // Usamos una conversión best-effort sin `switch` para evitar errores de exhaustividad
    // por variaciones del enum entre toolchains/SDKs.
    let environment: String = {
      guard #available(iOS 16.0, *) else { return "unknown" }
      let desc = String(describing: transaction.environment).lowercased()
      if desc.contains("sandbox") {
        return "sandbox"
      }
      if desc.contains("production") {
        return "production"
      }
      return "unknown"
    }()

    var productType: String = "unknown"
    var price: Double? = nil
    var currency: String? = nil
    var hasTrial: Bool = false
    var trialDays: Int? = nil

    do {
      let products = try await Product.products(for: [productId])
      if let product = products.first {
        if product.subscription != nil {
          productType = "subscription"
        } else {
          productType = "inapp"
        }

        price = NSDecimalNumber(decimal: product.price).doubleValue
        currency = storeKitCurrencyCode(for: product)

        if let introOffer = product.subscription?.introductoryOffer {
          // Igual que en purchase_started: esto es inferencia a partir de configuración del producto.
          hasTrial = true
          let period = introOffer.period
          switch period.unit {
          case .day:
            trialDays = period.value
          case .week:
            trialDays = period.value * 7
          case .month:
            trialDays = period.value * 30
          case .year:
            trialDays = period.value * 365
          @unknown default:
            break
          }
        }
      }
    } catch {
      // Mantener valores por defecto.
    }

    NSLog(
      "[SignalfoxPurchaseAnalyticsBridge][iOS] emit purchase_completed product=%@ type=%@ hasTrial=%@ trialDays=%@ env=%@",
      productId,
      productType,
      String(hasTrial),
      trialDays != nil ? String(trialDays!) : "nil",
      environment
    )
    SignalfoxPurchaseEventEmitter.emit([
      "eventName": "purchase_completed",
      "platform": platform,
      "store": store,
      "productId": productId,
      "productType": productType,
      "price": price as Any,
      "currency": currency as Any,
      "hasTrial": hasTrial,
      "trialDays": trialDays as Any,
      "transactionId": String(transaction.id),
      "originalTransactionId": String(transaction.originalID),
      "environment": environment,
      // rawContext omitido para mantener payload limpio.
    ])

    if productType == "subscription" {
      SignalfoxPurchaseEventEmitter.emit([
        "eventName": "subscription_started",
        "platform": platform,
        "store": store,
        "productId": productId,
        "productType": productType,
        "price": price as Any,
        "currency": currency as Any,
        "hasTrial": hasTrial,
        "trialDays": trialDays as Any,
        "transactionId": String(transaction.id),
        "originalTransactionId": String(transaction.originalID),
        "environment": environment,
      ])
    }

    if hasTrial {
      SignalfoxPurchaseEventEmitter.emit([
        "eventName": "trial_started",
        "platform": platform,
        "store": store,
        "productId": productId,
        "productType": productType,
        "hasTrial": true,
        "trialDays": trialDays as Any,
        "transactionId": String(transaction.id),
        "originalTransactionId": String(transaction.originalID),
        "environment": environment,
      ])
    }

    // IMPORTANTE: en StoreKit2 se recomienda terminar la transacción para evitar
    // re-emisiones en `Transaction.updates`. Esto no consume la compra, solo marca
    // que el "consumer" (este puente) ya la procesó para analytics.
    await transaction.finish()
  }

  @available(iOS 15.0, *)
  func collectCurrentEntitlements() async throws -> [String] {
    var restoredProductIds: [String] = []
    for await verification in Transaction.currentEntitlements {
      if case .verified(let transaction) = verification {
        restoredProductIds.append(transaction.productID)
      }
    }
    return restoredProductIds
  }
}

