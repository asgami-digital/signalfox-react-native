import type { AnalyticsIntegration } from '../types/integration';
import {
  startRevenueCatPurchaseAnalytics,
  stopRevenueCatPurchaseAnalyticsIfAvailable,
} from '../purchase/revenueCatPurchaseAnalytics';

/** Nombre estable; `nativePurchaseIntegration` lo usa para desactivar el bridge nativo. */
export const REVENUECAT_ANALYTICS_INTEGRATION_NAME =
  'revenueCatPurchaseAnalytics';

export interface RevenueCatIntegrationOptions {
  /**
   * Instancia/módulo `Purchases` de `react-native-purchases`
   * (`import Purchases from 'react-native-purchases'`).
   */
  purchases: unknown;
  /**
   * Opcional: constructor `RevenueCatUI` de `react-native-purchases-ui`
   * (`import RevenueCatUI from 'react-native-purchases-ui'`) para paywall / modal analytics.
   */
  revenueCatUI?: unknown;
}

/**
 * Integración de analytics sobre RevenueCat: parchea `Purchases` (y opcionalmente `RevenueCatUI`).
 * Usa junto con `nativePurchaseIntegration()` para enlazar el core al bridge JS (`notify*`).
 */
export function revenueCatIntegration(
  options: RevenueCatIntegrationOptions
): AnalyticsIntegration {
  const purchases = options.purchases as any;

  return {
    name: REVENUECAT_ANALYTICS_INTEGRATION_NAME,

    setup(_core, _context) {
      startRevenueCatPurchaseAnalytics({
        purchases,
        revenueCatUI: options.revenueCatUI,
      });

      return () => {
        stopRevenueCatPurchaseAnalyticsIfAvailable();
      };
    },
  };
}
