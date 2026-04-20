export type PurchasePlatform = 'ios' | 'android';

export type PurchaseStore = 'app_store' | 'google_play';

export type PurchaseEnvironment = 'sandbox' | 'production' | 'unknown';

export type PurchaseProductType = 'subscription' | 'inapp' | 'unknown';

/**
 * Canonical internal SDK events related to purchases.
 * Important: the backend groups them under `family = "purchase"` through taxonomy.
 */
export type PurchaseAnalyticsEventName =
  | 'purchase_started'
  | 'purchase_cancelled'
  | 'purchase_failed'
  | 'purchase_completed'
  | 'subscription_started'
  | 'trial_started'
  | 'restore_completed';

export interface NativePurchaseEventPayload {
  eventName: PurchaseAnalyticsEventName;

  platform?: PurchasePlatform;
  store?: PurchaseStore;
  productId?: string;
  productType?: PurchaseProductType;

  price?: number;
  currency?: string;

  hasTrial?: boolean;
  trialDays?: number;

  transactionId?: string;
  originalTransactionId?: string;

  environment?: PurchaseEnvironment;

  /**
   * Only for reconciliation/restore events (if applicable).
   * Example: list of productIds with active purchases.
   */
  restoredProductIds?: string[];

  /**
   * Error info cuando aplica (cancel/fail).
   */
  errorCode?: string;
  errorMessage?: string;

  /**
   * Additional native context (optional). We avoid depending on its exact shape
   * during normalization to preserve compatibility.
   */
  rawContext?: Record<string, unknown>;
}

export interface NormalizedPurchaseAnalyticsEvent {
  family: 'purchase';
  eventName: PurchaseAnalyticsEventName;
  analyticsDisplayName: string;
  properties: Record<string, unknown>;
}
