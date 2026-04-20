import type {
  NativePurchaseEventPayload,
  NormalizedPurchaseAnalyticsEvent,
  PurchaseAnalyticsEventName,
  PurchaseEnvironment,
  PurchasePlatform,
  PurchaseProductType,
  PurchaseStore,
} from './purchaseEventTypes';

function normalizeEnvironment(value: unknown): PurchaseEnvironment {
  if (value === 'sandbox' || value === 'production') return value;
  return 'unknown';
}

function normalizePlatform(value: unknown): PurchasePlatform | undefined {
  return value === 'ios' || value === 'android' ? value : undefined;
}

function platformToStore(platform?: PurchasePlatform): PurchaseStore {
  switch (platform) {
    case 'ios':
      return 'app_store';
    case 'android':
      return 'google_play';
    default:
      return 'app_store';
  }
}

function normalizeProductType(value: unknown): PurchaseProductType {
  if (value === 'subscription' || value === 'inapp' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

function pickFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function pickOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function buildPurchaseDisplayName(
  eventName: PurchaseAnalyticsEventName
): string {
  switch (eventName) {
    case 'purchase_started':
      return 'Purchase started';
    case 'purchase_cancelled':
      return 'Purchase cancelled';
    case 'purchase_failed':
      return 'Purchase failed';
    case 'purchase_completed':
      return 'Purchase completed';
    case 'subscription_started':
      return 'Subscription started';
    case 'trial_started':
      return 'Trial started';
    case 'restore_completed':
      return 'Restore completed';
  }
}

/**
 * Normalizes a native event (StoreKit/Billing) into a canonical backend event.
 *
 * Contrato:
 * - `family` will always be `"purchase"`.
 * - Normalization is "conservative": if a field does not exist on the native event, it is omitted.
 */
export function normalizeNativePurchaseEventToAnalyticsEvent(
  input: NativePurchaseEventPayload
): NormalizedPurchaseAnalyticsEvent | null {
  if (!input || typeof input !== 'object') return null;

  const eventName: PurchaseAnalyticsEventName = input.eventName;

  const platform = normalizePlatform(input.platform);
  const store = (input.store ?? platformToStore(platform)) as PurchaseStore;

  const productId = pickOptionalString(input.productId);
  const productType = normalizeProductType(input.productType);
  const price = pickFiniteNumber(input.price);
  const currency = pickOptionalString(input.currency);

  const hasTrial =
    typeof input.hasTrial === 'boolean' ? input.hasTrial : undefined;
  const trialDays = pickFiniteNumber(input.trialDays);

  const environment = normalizeEnvironment(input.environment);

  const properties: Record<string, unknown> = {
    sourcePlatform: platform ?? undefined,
    store,
    productId,
    productType,
    price,
    currency,
    hasTrial,
    trialDays,
    transactionId: pickOptionalString(input.transactionId),
    originalTransactionId: pickOptionalString(input.originalTransactionId),
    environment,
    restoredProductIds: Array.isArray(input.restoredProductIds)
      ? input.restoredProductIds.filter((x) => typeof x === 'string')
      : undefined,
    errorCode: pickOptionalString(input.errorCode),
    errorMessage: pickOptionalString(input.errorMessage),
    // rawContext is intentionally omitted from normalization to keep it clean.
  };

  // Cleanup: remove undefined keys so properties_json stays cleaner.
  for (const [k, v] of Object.entries(properties)) {
    if (typeof v === 'undefined') delete properties[k];
  }

  return {
    family: 'purchase',
    eventName,
    analyticsDisplayName: buildPurchaseDisplayName(eventName),
    properties,
  };
}
