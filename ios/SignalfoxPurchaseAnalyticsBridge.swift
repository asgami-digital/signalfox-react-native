import Foundation
import StoreKit

import React

private let kSignalfoxPurchaseEventChannel = "signalfox_purchase_event"

/// Umbral entre `signedDate` y `purchaseDate` para detectar replay de historial (restore/sync) en StoreKit 2.
private let kSignalfoxRestoreReplaySignedVsPurchaseSkewSeconds: TimeInterval = 180

/// ISO 4217 best-effort. StoreKit 2 `Product` no tiene `priceLocale` (eso es `SKProduct` / StoreKit 1).
/// Since iOS 16: `priceFormatStyle.locale`. On iOS 15 only `price`/`displayPrice` exists without an ISO code;
/// we use the device's current locale as a store approximation.
@available(iOS 15.0, *)
private func storeKitCurrencyCode(for product: Product) -> String? {
  if #available(iOS 16.0, *) {
    let locale = product.priceFormatStyle.locale
    return locale.currency?.identifier ?? locale.currencyCode
  }
  return Locale.current.currencyCode
}

/// `Product.products` can hang indefinitely in sandbox/simulator; without a timeout we used to block `emit` to JS.
@available(iOS 15.0, *)
private func loadFirstProduct(productId: String, timeoutNs: UInt64 = 2_000_000_000) async -> Product? {
  let timeoutSec = Double(timeoutNs) / 1_000_000_000.0
  NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] loadFirstProduct START productId=%@ timeout=%.1fs (Product.products can hang in sandbox)", productId, timeoutSec)
  return await withTaskGroup(of: (product: Product?, isTimeout: Bool).self) { group in
    group.addTask {
      do {
        let list = try await Product.products(for: [productId])
        if let first = list.first {
          NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] loadFirstProduct OK productId=%@", productId)
          return (first, false)
        }
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] loadFirstProduct empty list productId=%@", productId)
        return (nil, false)
      } catch {
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] loadFirstProduct ERROR productId=%@ err=%@", productId, String(describing: error))
        return (nil, false)
      }
    }
    group.addTask {
      try? await Task.sleep(nanoseconds: timeoutNs)
      return (nil, true)
    }
    for await partial in group {
      if let p = partial.product {
        group.cancelAll()
        return p
      }
      if partial.isTimeout {
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] loadFirstProduct TIMEOUT productId=%@ — emitting without StoreKit metadata", productId)
        group.cancelAll()
        return nil
      }
    }
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] loadFirstProduct END no product productId=%@", productId)
    return nil
  }
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
    let eventName = body["eventName"] as? String ?? "unknown"
    let productId = body["productId"] as? String ?? ""
    guard let emitter = sharedInstance else {
      NSLog(
        "[SignalfoxPurchaseAnalyticsBridge][iOS] STUCK: emit skipped — RCTEventEmitter sharedInstance is nil (RN module not mounted yet?). event=%@ productId=%@",
        eventName,
        productId
      )
      return
    }
    if productId.isEmpty {
      NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] Native → RN: sendEvent event=%@", eventName)
    } else {
      NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] Native → RN: sendEvent event=%@ productId=%@", eventName, productId)
    }
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
  private let paywallStateLock = NSLock()
  private var lifecycleObservers: [NSObjectProtocol] = []
  private var heuristicPaywallIsOpen: Bool = false
  private var heuristicPaywallOpenedAtMs: Double?
  private var heuristicSawInactiveDuringPaywall: Bool = false
  private var heuristicInactiveAtMs: Double?

  private override init() {
    super.init()
    registerLifecycleObserversIfNeeded()
  }

  @objc
  func startNativePurchaseAnalytics() {
    guard !isRunning else { return }
    isRunning = true
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] startNativePurchaseAnalytics()")

    // SKPaymentQueue covers purchase-flow cancellations and failures.
    let observer = PaymentQueueObserver()
    paymentQueueObserver = observer
    SKPaymentQueue.default().add(observer)
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue observer added")

    // StoreKit 2 covers completions (including transaction-level restores).
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

          resolve(nil)
        } catch {
          reject("RECONCILE_PURCHASES_ERROR", "Failed to reconcile purchases", error)
        }
      } else {
        // Without StoreKit2 we cannot perform reliable reconciliation.
        resolve(nil)
      }
    }
  }

  @objc
  func beginHeuristicPaywallSession() {
    let nowMs = Date().timeIntervalSince1970 * 1000
    paywallStateLock.lock()
    heuristicPaywallIsOpen = true
    heuristicPaywallOpenedAtMs = nowMs
    heuristicSawInactiveDuringPaywall = false
    heuristicInactiveAtMs = nil
    paywallStateLock.unlock()

    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] beginHeuristicPaywallSession openedAt=%.0f", nowMs)
  }

  @objc
  func endHeuristicPaywallSession() -> [String: Any] {
    paywallStateLock.lock()
    let snapshot: [String: Any] = [
      "paywallIsOpen": heuristicPaywallIsOpen,
      "paywallOpenedAt": heuristicPaywallOpenedAtMs as Any,
      "sawInactiveDuringPaywall": heuristicSawInactiveDuringPaywall,
      "inactiveAt": heuristicInactiveAtMs as Any
    ]
    heuristicPaywallIsOpen = false
    heuristicPaywallOpenedAtMs = nil
    heuristicSawInactiveDuringPaywall = false
    heuristicInactiveAtMs = nil
    paywallStateLock.unlock()

    NSLog(
      "[SignalfoxPurchaseAnalyticsBridge][iOS] endHeuristicPaywallSession sawInactive=%@ inactiveAt=%@",
      String(describing: snapshot["sawInactiveDuringPaywall"] ?? false),
      String(describing: snapshot["inactiveAt"] ?? "nil")
    )
    return snapshot
  }

  private func registerLifecycleObserversIfNeeded() {
    guard lifecycleObservers.isEmpty else { return }

    lifecycleObservers.append(
      NotificationCenter.default.addObserver(
        forName: UIApplication.willResignActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.noteInactiveDuringHeuristicPaywall(reason: "UIApplication.willResignActiveNotification")
      }
    )

    if #available(iOS 13.0, *) {
      lifecycleObservers.append(
        NotificationCenter.default.addObserver(
          forName: UIScene.willDeactivateNotification,
          object: nil,
          queue: .main
        ) { [weak self] _ in
          self?.noteInactiveDuringHeuristicPaywall(reason: "UIScene.willDeactivateNotification")
        }
      )
    }
  }

  private func noteInactiveDuringHeuristicPaywall(reason: String) {
    let nowMs = Date().timeIntervalSince1970 * 1000
    paywallStateLock.lock()
    guard heuristicPaywallIsOpen else {
      paywallStateLock.unlock()
      return
    }

    heuristicSawInactiveDuringPaywall = true
    if heuristicInactiveAtMs == nil {
      heuristicInactiveAtMs = nowMs
    }
    let openedAt = heuristicPaywallOpenedAtMs
    let inactiveAt = heuristicInactiveAtMs
    paywallStateLock.unlock()

    NSLog(
      "[SignalfoxPurchaseAnalyticsBridge][iOS] heuristic paywall inactive reason=%@ openedAt=%@ inactiveAt=%@",
      reason,
      openedAt != nil ? String(format: "%.0f", openedAt!) : "nil",
      inactiveAt != nil ? String(format: "%.0f", inactiveAt!) : "nil"
    )
  }
}

// MARK: - SKPaymentQueue observation (cancel/fail/start)

private final class PaymentQueueObserver: NSObject, SKPaymentTransactionObserver {
  private func storeKitPriceInfo(for productId: String) async -> (price: Double?, currency: String?, productType: String?, hasTrial: Bool, trialDays: Int?) {
    guard #available(iOS 15.0, *) else {
      return (nil, nil, nil, false, nil)
    }
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] storeKitPriceInfo for %@", productId)
    guard let product = await loadFirstProduct(productId: productId) else {
      NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] storeKitPriceInfo: no Product (timeout/empty) productId=%@", productId)
      return (nil, nil, nil, false, nil)
    }

    let price = NSDecimalNumber(decimal: product.price).doubleValue
    let currency = storeKitCurrencyCode(for: product)

    let isSubscription = product.subscription != nil
    let introOffer = product.subscription?.introductoryOffer

    // Inferimos trial/intro si el producto tiene una oferta configurada.
    // StoreKit does not give us (through this bridge) certainty that THAT transaction
    // was actually the one that used the intro offer.
    var hasTrial = introOffer != nil
    var trialDays: Int? = nil

    if let introOffer {
      let period = introOffer.period
      // Note: we compute an approximation in days.
      // If the period is in months/years, this is inferred.
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
  }

  /// `purchase_started` / `purchase_cancelled` are not emitted from StoreKit 1 here:
  /// they are covered via JS when the app uses `react-native-purchases` (see TS integration).

  private func emitPurchaseFailed(transaction: SKPaymentTransaction) {
    let productId = transaction.payment.productIdentifier
    let error = transaction.error

    let skError = error as? SKError
    let errorCode: String? = skError.map { String(describing: $0.code.rawValue) }
    let errorMessage: String? = error?.localizedDescription

    NSLog(
      "[SignalfoxPurchaseAnalyticsBridge][iOS] emit purchase_failed for %@ token=%@",
      productId,
      String(describing: transaction.transactionIdentifier)
    )
    SignalfoxPurchaseEventEmitter.emit([
      "eventName": "purchase_failed",
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
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue updatedTransactions count=%ld", transactions.count)
    for transaction in transactions {
      switch transaction.transactionState {
      case .purchasing:
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue state=purchasing product=%@", transaction.payment.productIdentifier)
        break
      case .failed:
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue state=failed product=%@", transaction.payment.productIdentifier)
        emitPurchaseFailed(transaction: transaction)
      case .restored:
        // Replay of history while restoring: no analytics here (a single `restore_completed` through reconcile).
        NSLog(
          "[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue state=restored ignored product=%@",
          transaction.payment.productIdentifier
        )
        break
      default:
        // Para completados usamos StoreKit2 (Transaction.updates) para reducir duplicados.
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] SKPaymentQueue state=other=%ld product=%@", transaction.transactionState.rawValue, transaction.payment.productIdentifier)
        break
      }
    }
  }
}

// MARK: - StoreKit 2 (purchase_completed + subscription/trial)

private extension SignalfoxPurchaseAnalyticsTracker {
  /// StoreKit 2 no distingue "restaurado" en `Transaction.Reason` (solo purchase/renewal). Tras `restore`/`sync`,
  /// el historial suele reaparecer como `.purchase` con `purchaseDate` antigua y `signedDate` reciente.
  /// Las renovaciones reales llevan `.renewal` y no se filtran.
  @available(iOS 15.0, *)
  func shouldSuppressPurchaseAnalyticsForRestoreReplay(_ transaction: Transaction) -> Bool {
    if #available(iOS 17.0, *) {
      if transaction.reason == .renewal {
        return false
      }
      let raw = transaction.reason.rawValue.uppercased()
      if raw.contains("RESTORE") {
        return true
      }
    } else {
      let raw = transaction.reasonStringRepresentation.uppercased()
      if raw == "RENEWAL" {
        return false
      }
      if raw.contains("RESTORE") {
        return true
      }
    }

    let skew = transaction.signedDate.timeIntervalSince(transaction.purchaseDate)
    return skew > kSignalfoxRestoreReplaySignedVsPurchaseSkewSeconds
  }

  @available(iOS 15.0, *)
  func listenToTransactionUpdates() async {
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] Transaction.updates: listening (blocks until next transaction)")
    for await verification in Transaction.updates {
      if Task.isCancelled { return }

      do {
        let transaction = try verification.payloadValue
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] Transaction.updates verified productID=%@", transaction.productID)
        await emitForVerifiedTransaction(transaction)
      } catch {
        // Unverified transactions are skipped to avoid recording inaccurate events.
        NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] Transaction.updates unverified payload skipped")
      }
    }
  }

  @available(iOS 15.0, *)
  func emitForVerifiedTransaction(_ transaction: Transaction) async {
    let productId = transaction.productID
    let store: String = "app_store"

    var platform: String = "ios"

    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] emitForVerifiedTransaction BEGIN productId=%@", productId)

    if shouldSuppressPurchaseAnalyticsForRestoreReplay(transaction) {
      NSLog(
        "[SignalfoxPurchaseAnalyticsBridge][iOS] emitForVerifiedTransaction: suppressed as restore/sync replay productId=%@ (finish only)",
        productId
      )
      await transaction.finish()
      return
    }

    // StoreKit2: `transaction.environment` is available starting in iOS 16.
    // We use a best-effort conversion without `switch` to avoid exhaustiveness errors
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

    if let product = await loadFirstProduct(productId: productId) {
      NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] emitForVerifiedTransaction: loaded Product for metadata productId=%@", productId)
      if product.subscription != nil {
        productType = "subscription"
      } else {
        productType = "inapp"
      }

      price = NSDecimalNumber(decimal: product.price).doubleValue
      currency = storeKitCurrencyCode(for: product)

      if let introOffer = product.subscription?.introductoryOffer {
        // Inference based on product configuration (does not imply this transaction used the intro).
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
        "transactionId": String(transaction.id),
        "originalTransactionId": String(transaction.originalID),
        "environment": environment,
      ])
    }

    // We do not emit `trial_started`: the catalog may have a trial even if the user has already
    // consumed it; there is no reliable way here to know whether it applies. Only `subscription_started`.

    // IMPORTANT: with StoreKit2 it is recommended to finish the transaction to avoid
    // re-emissions in `Transaction.updates`. This does not consume the purchase; it only marks
    // that the "consumer" (this bridge) already processed it for analytics.
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] emitForVerifiedTransaction: calling transaction.finish() productId=%@", productId)
    await transaction.finish()
    NSLog("[SignalfoxPurchaseAnalyticsBridge][iOS] emitForVerifiedTransaction END productId=%@", productId)
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
