import type { AnalyticsIntegration } from '../types/integration';
import {
  reconcileNativePurchaseState,
  startListeningToNativePurchaseEvents,
  stopListeningToNativePurchaseEvents,
} from '../purchase/nativePurchaseEventBridge';

/**
 * Conecta eventos nativos de compra (StoreKit / Billing) → TypeScript → core analytics.
 *
 * Nota: `purchase_started` y `restore_completed` pueden no ser 100% observables de forma
 * pasiva dependiendo de la integración de compra del consumidor. Se incluyen hooks TS
 * en `nativePurchaseEventBridge` para cubrir esos huecos.
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
      startListeningToNativePurchaseEvents(core);

      // En algunos apps conviene disparar reconciliación tras conectar.
      // Degradamos silenciosamente si el nativo no está disponible.
      void reconcileNativePurchaseState().catch(() => {});

      return () => {
        stopListeningToNativePurchaseEvents();
      };
    },
  };
}
