import { getCanonicalTriple } from '../../api/canonicalTaxonomy';
import { normalizeNativePurchaseEventToAnalyticsEvent } from '../normalizeNativePurchaseEvent';
import type { NativePurchaseEventPayload } from '../purchaseEventTypes';

describe('purchase normalization', () => {
  it('normalizes purchase_completed with provided metadata', () => {
    const native: NativePurchaseEventPayload = {
      eventName: 'purchase_completed',
      platform: 'ios',
      store: 'app_store',
      productId: 'pro_monthly',
      productType: 'subscription',
      price: 7.99,
      currency: 'USD',
      hasTrial: true,
      trialDays: 7,
      transactionId: '123',
      originalTransactionId: '456',
      environment: 'sandbox',
    };

    const normalized = normalizeNativePurchaseEventToAnalyticsEvent(native);

    expect(normalized).not.toBeNull();
    expect(normalized?.family).toBe('purchase');
    expect(normalized?.eventName).toBe('purchase_completed');
    expect(normalized?.properties.store).toBe('app_store');
    expect(normalized?.properties.productId).toBe('pro_monthly');
    expect(normalized?.properties.hasTrial).toBe(true);
    expect(normalized?.properties.trialDays).toBe(7);
  });

  it('derives store from platform when store is missing', () => {
    const native: NativePurchaseEventPayload = {
      eventName: 'purchase_completed',
      platform: 'android',
      productId: 'pro_monthly',
      productType: 'subscription',
    };

    const normalized = normalizeNativePurchaseEventToAnalyticsEvent(native);

    expect(normalized?.family).toBe('purchase');
    expect(normalized?.properties.store).toBe('google_play');
    expect(normalized?.properties.sourcePlatform).toBe('android');
  });

  it.each([
    'purchase_started',
    'purchase_cancelled',
    'purchase_failed',
    'purchase_completed',
    'subscription_started',
    'trial_started',
    'restore_completed',
    'purchase_state_reconciled',
  ])('canonical taxonomy maps %s to family purchase', (eventName) => {
    const triple = getCanonicalTriple(eventName);
    expect(triple.event_family).toBe('purchase');
  });
});
