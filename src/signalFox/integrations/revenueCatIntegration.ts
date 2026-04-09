import type { AnalyticsIntegration } from '../types/integration';
import {
  startRevenueCatPurchaseAnalytics,
  stopRevenueCatPurchaseAnalyticsIfAvailable,
} from '../purchase/revenueCatPurchaseAnalytics';

/** Nombre estable; `nativePurchaseIntegration` lo usa para desactivar el bridge nativo. */
export const REVENUECAT_ANALYTICS_INTEGRATION_NAME =
  'revenueCatPurchaseAnalytics';

/**
 * Resuelve el objeto con métodos estáticos de compra (p. ej. `purchasePackage`).
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
  const purchases = resolveRevenueCatPurchasesExport(options.purchases) as any;

  return {
    name: REVENUECAT_ANALYTICS_INTEGRATION_NAME,

    setup(_core, _context) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const hasPkg = purchases && typeof purchases.purchasePackage === 'function';
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
      };
    },
  };
}
