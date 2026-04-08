import type { AnalyticsIntegration } from '../types/integration';
import {
  reconcileNativePurchaseState,
  startListeningToNativePurchaseEvents,
  stopListeningToNativePurchaseEvents,
} from '../purchase/nativePurchaseEventBridge';
import {
  isRevenueCatPurchasesAvailable,
  startRevenueCatPurchaseAnalyticsIfAvailable,
  stopRevenueCatPurchaseAnalyticsIfAvailable,
} from '../purchase/revenueCatPurchaseAnalytics';

/**
 * Conecta eventos nativos de compra (StoreKit / Billing) → TypeScript → core analytics.
 *
 * `purchase_started` y `purchase_cancelled` se obtienen vía `react-native-purchases` si está
 * instalado (parche de métodos de compra). `restore_completed` puede requerir hooks TS.
 */
export function nativePurchaseIntegration(): AnalyticsIntegration {
  return {
    name: 'nativePurchaseAnalytics',

    setup(core) {
      // Logs no condicionados a __DEV__ para depurar problemas de inicialización.
      // (Si no ves estos logs al hacer una compra/restore, la integración no está montada en tu app.)
      console.log(
        '[SignalfoxPurchaseAnalyticsBridge][TS] nativePurchaseIntegration.setup()'
      );
      const hasRevenueCatPurchases = isRevenueCatPurchasesAvailable();
      startListeningToNativePurchaseEvents(core, {
        enableNativePurchaseEvents: !hasRevenueCatPurchases,
      });
      startRevenueCatPurchaseAnalyticsIfAvailable();

      // En algunos apps conviene disparar reconciliación tras conectar.
      // Degradamos silenciosamente si el nativo no está disponible.
      reconcileNativePurchaseState().catch(() => {
        /* fire-and-forget */
      });

      return () => {
        stopRevenueCatPurchaseAnalyticsIfAvailable();
        stopListeningToNativePurchaseEvents();
      };
    },
  };
}
