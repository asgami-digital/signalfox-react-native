import type { AnalyticsIntegration, IAnalyticsCore } from '../types/integration';
import {
  registerPurchaseAnalyticsCore,
  unregisterPurchaseAnalyticsCore,
} from '../purchase/purchaseAnalyticsBridge';
import {
  startRevenueCatPurchaseAnalytics,
  stopRevenueCatPurchaseAnalyticsIfAvailable,
} from '../purchase/revenueCatPurchaseAnalytics';

/** Stable integration name (ordering in `sortIntegrationsForSetup`, etc.). */
export const REVENUECAT_ANALYTICS_INTEGRATION_NAME =
  'revenueCatPurchaseAnalytics';

/**
 * Resolves the object with static purchase methods (for example, `purchasePackage`).
 * Acepta el default export o el namespace `import * as Purchases`.
 */
export function resolveRevenueCatPurchasesExport(purchases: unknown): unknown {
  if (purchases == null) return purchases;
  const root = purchases as Record<string, unknown>;
  if (typeof root.purchasePackage === 'function') {
    return purchases;
  }
  const d = root.default;
  if (d != null && typeof d === 'object') {
    const mod = d as Record<string, unknown>;
    if (typeof mod.purchasePackage === 'function') return d;
  }
  if (typeof d === 'function') {
    const Ctor = d as unknown as Record<string, unknown>;
    if (typeof Ctor.purchasePackage === 'function') return d;
  }
  return purchases;
}

function resolveRevenueCatUIExport(ui: unknown): unknown {
  if (ui == null) return ui;
  if (typeof ui === 'function') return ui;
  const r = ui as Record<string, unknown>;
  const d = r.default;
  return typeof d === 'function' ? d : ui;
}

export interface RevenueCatIntegrationOptions {
  /**
   * `Purchases` instance/module from `react-native-purchases`
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
 * Analytics integration for RevenueCat: patches `Purchases` (and optionally `RevenueCatUI`).
 * It does not depend on the native purchase channel; it only registers the core in
 * `purchaseAnalyticsBridge` para `notifyPurchase*` desde JS.
 */
export function revenueCatIntegration(
  options: RevenueCatIntegrationOptions
): AnalyticsIntegration {
  const purchases = resolveRevenueCatPurchasesExport(options.purchases) as any;

  return {
    name: REVENUECAT_ANALYTICS_INTEGRATION_NAME,

    setup(core, _context) {
      const internalCore = core as IAnalyticsCore;
      registerPurchaseAnalyticsCore(internalCore);

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const hasPkg =
          purchases && typeof purchases.purchasePackage === 'function';
        console.log('[SignalFox][RevenueCat] revenueCatIntegration.setup()', {
          resolvedPurchases: Boolean(purchases),
          hasPurchasePackage: hasPkg,
        });
      }
      startRevenueCatPurchaseAnalytics({
        purchases,
        revenueCatUI: resolveRevenueCatUIExport(options.revenueCatUI),
      });

      return () => {
        stopRevenueCatPurchaseAnalyticsIfAvailable();
        unregisterPurchaseAnalyticsCore();
      };
    },
  };
}
