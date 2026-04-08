import type { AnalyticsIntegration } from '../types/integration';
import {
  reconcileNativePurchaseState,
  startListeningToNativePurchaseEvents,
  stopListeningToNativePurchaseEvents,
} from '../purchase/nativePurchaseEventBridge';

/**
 * Registra el bridge JS de compras (`notifyPurchase*`, RevenueCat, etc.) con el core.
 *
 * No escucha el canal nativo de compras: los eventos StoreKit/Billing que envía iOS/Android
 * no se consumen en JS (ver `startListeningToNativePurchaseEvents` con
 * `enableNativePurchaseEvents: true` si lo necesitas).
 */
export function nativePurchaseIntegration(): AnalyticsIntegration {
  return {
    name: 'nativePurchaseAnalytics',

    setup(core, _context) {
      // Logs no condicionados a __DEV__ para depurar problemas de inicialización.
      // (Si no ves estos logs al hacer una compra/restore, la integración no está montada en tu app.)
      console.log(
        '[SignalfoxPurchaseAnalyticsBridge][TS] nativePurchaseIntegration.setup()'
      );
      startListeningToNativePurchaseEvents(core);

      // En algunos apps conviene disparar reconciliación tras conectar.
      // Degradamos silenciosamente si el nativo no está disponible.
      reconcileNativePurchaseState().catch(() => {
        /* fire-and-forget */
      });

      return () => {
        stopListeningToNativePurchaseEvents();
      };
    },
  };
}
