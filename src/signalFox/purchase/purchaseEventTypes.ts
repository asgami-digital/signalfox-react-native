export type PurchasePlatform = 'ios' | 'android';

export type PurchaseStore = 'app_store' | 'google_play';

export type PurchaseEnvironment = 'sandbox' | 'production' | 'unknown';

export type PurchaseProductType = 'subscription' | 'inapp' | 'unknown';

/**
 * Eventos internos del SDK (canónicos) relacionados con compras.
 * Importante: el backend los agrupa con `family = "purchase"` vía taxonomía.
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
   * Solo para eventos de reconciliación/restauración (si aplica).
   * Ej: lista de productIds con compras activas.
   */
  restoredProductIds?: string[];

  /**
   * Error info cuando aplica (cancel/fail).
   */
  errorCode?: string;
  errorMessage?: string;

  /**
   * Contexto nativo adicional (opcional). Evitamos depender de su forma exacta
   * en la normalización para mantener compatibilidad.
   */
  rawContext?: Record<string, unknown>;
}

export interface NormalizedPurchaseAnalyticsEvent {
  family: 'purchase';
  eventName: PurchaseAnalyticsEventName;
  analyticsDisplayName: string;
  properties: Record<string, unknown>;
}
