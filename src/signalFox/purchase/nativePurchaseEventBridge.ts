import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { IAnalyticsCore } from '../types/integration';
import type { AnalyticsEventType } from '../types/events';
import { normalizeNativePurchaseEventToAnalyticsEvent } from './normalizeNativePurchaseEvent';
import type {
  NativePurchaseEventPayload,
  PurchaseStore,
} from './purchaseEventTypes';
import SignalfoxReactNative from '../../NativeSignalfoxReactNative';

export const NATIVE_PURCHASE_EVENT_CHANNEL = 'signalfox_purchase_event';

let activeCore: IAnalyticsCore | null = null;
let refCount = 0;
let subscription: { remove: () => void } | null = null;
let nativePurchaseListenerEnabled = true;
const lastEventSeenAtMs = new Map<string, number>();
const DEDUPE_WINDOW_MS = 3000;

/** Último sku notificado con `notifyPurchaseStarted` (p. ej. Android cancel sin productId). */
let pendingPurchaseProductId: string | null = null;

function defaultStoreForPlatform(): PurchaseStore {
  return Platform.OS === 'ios' ? 'app_store' : 'google_play';
}

function setPendingPurchaseProductId(productId: unknown): void {
  if (typeof productId === 'string' && productId.trim().length > 0) {
    pendingPurchaseProductId = productId.trim();
    debugLog('pending purchase productId set', {
      productId: pendingPurchaseProductId,
    });
  }
}

function clearPendingPurchaseProductId(reason: string): void {
  if (pendingPurchaseProductId != null) {
    debugLog('pending purchase productId cleared', { reason });
  }
  pendingPurchaseProductId = null;
}

function enrichPayloadWithPendingProductId(
  payload: NativePurchaseEventPayload
): void {
  const needsId =
    (payload.eventName === 'purchase_cancelled' ||
      payload.eventName === 'purchase_failed') &&
    !payload.productId;
  if (needsId && pendingPurchaseProductId) {
    (payload as { productId?: string }).productId = pendingPurchaseProductId;
    debugLog('JS: attached pending productId to native cancel/fail payload', {
      productId: pendingPurchaseProductId,
    });
  }
}

function debugLog(...args: unknown[]): void {
  console.log('[SignalfoxPurchaseAnalyticsBridge]', ...args);
}

function debugWarn(...args: unknown[]): void {
  console.warn('[SignalfoxPurchaseAnalyticsBridge]', ...args);
}

function makeDedupeKey(payload: NativePurchaseEventPayload): string {
  const restored = Array.isArray(payload.restoredProductIds)
    ? payload.restoredProductIds.join('|')
    : '';
  return [
    payload.eventName,
    payload.platform,
    payload.store,
    payload.productId,
    payload.transactionId ?? '',
    payload.originalTransactionId ?? '',
    payload.environment ?? '',
    restored,
  ].join('::');
}

function shouldDedupe(payload: NativePurchaseEventPayload): boolean {
  const key = makeDedupeKey(payload);
  if (
    !payload.productId &&
    !payload.transactionId &&
    !payload.restoredProductIds
  ) {
    return false;
  }

  const now = Date.now();
  const prev = lastEventSeenAtMs.get(key);
  if (typeof prev === 'number' && now - prev < DEDUPE_WINDOW_MS) {
    debugWarn('Dedupe: dropping duplicate native purchase event', { key });
    return true;
  }

  lastEventSeenAtMs.set(key, now);
  return false;
}

function toCoreTrackEvent(
  normalized: ReturnType<typeof normalizeNativePurchaseEventToAnalyticsEvent>
): { type: AnalyticsEventType; payload: Record<string, unknown> } | null {
  if (!normalized) return null;

  return {
    type: normalized.eventName as AnalyticsEventType,
    payload: {
      family: normalized.family,
      analyticsDisplayName: normalized.analyticsDisplayName,
      ...normalized.properties,
    },
  };
}

/**
 * Registra el `core` para `notifyPurchase*` (bridge JS).
 *
 * Por defecto **no** suscribe al `NativeEventEmitter` ni llama a `startNativePurchaseAnalytics`:
 * los eventos que emite el módulo nativo de compras quedan ignorados en JS salvo que pases
 * `{ enableNativePurchaseEvents: true }` (casos avanzados).
 */
export function startListeningToNativePurchaseEvents(
  core: IAnalyticsCore,
  options?: { enableNativePurchaseEvents?: boolean }
): void {
  const enableNativePurchaseEvents =
    options?.enableNativePurchaseEvents === true;

  if (refCount === 0) {
    activeCore = core;
    nativePurchaseListenerEnabled = enableNativePurchaseEvents;
  }

  refCount += 1;
  if (refCount > 1) return;

  debugLog('startListeningToNativePurchaseEvents', {
    refCount,
    nativePurchaseListenerEnabled,
    platform: core ? 'hasCore' : 'noCore',
  });

  if (!nativePurchaseListenerEnabled) {
    return;
  }

  // Suscripción antes de iniciar nativo para evitar race condition.
  const emitterModule = NativeModules.SignalfoxPurchaseEventEmitter;
  if (!emitterModule) {
    debugWarn('NativeModules.SignalfoxPurchaseEventEmitter is missing');
  }

  if (emitterModule) {
    const emitter = new NativeEventEmitter(emitterModule);
    subscription = emitter.addListener(
      NATIVE_PURCHASE_EVENT_CHANNEL,
      (event) => {
        const payload = event as NativePurchaseEventPayload;
        debugLog('Native → JS: event received on channel', {
          eventName: payload?.eventName,
          productId: payload?.productId,
          platform: payload?.platform,
        });
        if (!activeCore) {
          debugWarn(
            'stuck: activeCore is null — trackEvent will not run (listener started before core?)'
          );
          return;
        }

        enrichPayloadWithPendingProductId(payload);

        if (shouldDedupe(payload)) {
          debugLog('dedupe: skipped duplicate native purchase payload', {
            eventName: payload.eventName,
            productId: payload.productId,
          });
          return;
        }

        const normalized =
          normalizeNativePurchaseEventToAnalyticsEvent(payload);
        if (!normalized) {
          debugWarn('stuck: normalization returned null', payload);
          return;
        }
        const coreEvent = toCoreTrackEvent(normalized);
        if (!coreEvent) {
          debugWarn('stuck: toCoreTrackEvent returned null', normalized);
          return;
        }
        debugLog('JS → core: calling trackEvent', { type: coreEvent.type });
        activeCore.trackEvent(coreEvent as any);
        debugLog('JS → core: trackEvent returned', { type: coreEvent.type });

        const done = payload.eventName;
        if (
          done === 'purchase_completed' ||
          done === 'purchase_cancelled' ||
          done === 'purchase_failed'
        ) {
          clearPendingPurchaseProductId(done);
        }
      }
    );
  }

  SignalfoxReactNative.startNativePurchaseAnalytics()
    .then(() => debugLog('startNativePurchaseAnalytics resolved'))
    .catch((e) => debugWarn('startNativePurchaseAnalytics failed', e));
}

/**
 * Detiene listeners para evitar duplicados y fugas.
 */
export function stopListeningToNativePurchaseEvents(): void {
  if (refCount <= 0) return;
  refCount -= 1;
  if (refCount > 0) return;

  debugLog('stopListeningToNativePurchaseEvents', { refCount });
  subscription?.remove();
  subscription = null;
  lastEventSeenAtMs.clear();
  activeCore = null;
  pendingPurchaseProductId = null;
  nativePurchaseListenerEnabled = true;

  SignalfoxReactNative.stopNativePurchaseAnalytics().catch(() => {
    // ignore
  });
}

/**
 * Llama justo **antes** de iniciar la compra si usas StoreKit 2 `Product.purchase()` (no siempre
 * hay `SKPaymentQueue` `.purchasing`) o Billing `launchBillingFlow` (para poder adjuntar `productId`
 * en cancelaciones que llegan sin sku).
 *
 * Guarda `productId` en memoria para `purchase_cancelled` / `purchase_failed` huérfanos.
 */
export function notifyPurchaseStarted(
  payload: Omit<NativePurchaseEventPayload, 'eventName'>
): void {
  setPendingPurchaseProductId((payload as { productId?: string }).productId);

  if (!activeCore) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      debugWarn(
        'notifyPurchaseStarted: sin activeCore — el evento no se enviará al core. Incluye nativePurchaseIntegration() y asegúrate de que monte antes que revenueCatIntegration (SignalFox ordena esto automáticamente).'
      );
    }
    return;
  }

  const normalized = normalizeNativePurchaseEventToAnalyticsEvent({
    ...(payload as any),
    eventName: 'purchase_started',
    platform:
      (payload as any).platform ?? (Platform.OS === 'ios' ? 'ios' : 'android'),
    store: (payload as any).store ?? defaultStoreForPlatform(),
  });
  const coreEvent = toCoreTrackEvent(normalized);
  if (!coreEvent) return;
  activeCore.trackEvent(coreEvent as any);
}

/**
 * Cuando el resultado de compra solo llega a JS (p. ej. cancelación de StoreKit 2 en el `switch`).
 */
export function notifyPurchaseCancelled(
  payload?: Omit<NativePurchaseEventPayload, 'eventName'>
): void {
  if (!activeCore) return;

  const normalized = normalizeNativePurchaseEventToAnalyticsEvent({
    ...(payload as any),
    eventName: 'purchase_cancelled',
    platform: payload?.platform ?? (Platform.OS === 'ios' ? 'ios' : 'android'),
    store: payload?.store ?? defaultStoreForPlatform(),
  });
  const coreEvent = toCoreTrackEvent(normalized);
  if (!coreEvent) return;
  activeCore.trackEvent(coreEvent as any);
  clearPendingPurchaseProductId('notifyPurchaseCancelled');
}

export function notifyPurchaseFailed(
  payload?: Omit<NativePurchaseEventPayload, 'eventName'>
): void {
  if (!activeCore) return;

  const normalized = normalizeNativePurchaseEventToAnalyticsEvent({
    ...(payload as any),
    eventName: 'purchase_failed',
    platform: payload?.platform ?? (Platform.OS === 'ios' ? 'ios' : 'android'),
    store: payload?.store ?? defaultStoreForPlatform(),
  });
  const coreEvent = toCoreTrackEvent(normalized);
  if (!coreEvent) return;
  activeCore.trackEvent(coreEvent as any);
  clearPendingPurchaseProductId('notifyPurchaseFailed');
}

export function notifyPurchaseCompleted(
  payload?: Omit<NativePurchaseEventPayload, 'eventName'>
): void {
  if (!activeCore) return;

  const normalized = normalizeNativePurchaseEventToAnalyticsEvent({
    ...(payload as any),
    eventName: 'purchase_completed',
    platform: payload?.platform ?? (Platform.OS === 'ios' ? 'ios' : 'android'),
    store: payload?.store ?? defaultStoreForPlatform(),
  });
  const coreEvent = toCoreTrackEvent(normalized);
  if (!coreEvent) return;
  activeCore.trackEvent(coreEvent as any);
  clearPendingPurchaseProductId('notifyPurchaseCompleted');
}

/**
 * Hook opcional: permite emitir `restore_completed` cuando el restore/reconciliación
 * no sea detectable de forma fiable pasiva.
 */
export function notifyRestoreCompleted(
  payload: Omit<NativePurchaseEventPayload, 'eventName'>
): void {
  if (!activeCore) return;

  const normalized = normalizeNativePurchaseEventToAnalyticsEvent({
    ...(payload as any),
    eventName: 'restore_completed',
  });
  const coreEvent = toCoreTrackEvent(normalized);
  if (!coreEvent) return;
  activeCore.trackEvent(coreEvent as any);
}

export function notifyModalOpened(
  targetId: string,
  payloadExtras?: Record<string, unknown>
): void {
  if (!activeCore) return;

  const trimmedTargetId =
    typeof targetId === 'string' ? targetId.trim() : '';
  if (!trimmedTargetId) return;

  activeCore.trackEvent({
    type: 'modal_open',
    signalFoxDisplayName: trimmedTargetId,
    target_type: 'modal',
    payload: {
      modalName: trimmedTargetId,
      source: 'react_native_modal',
      kind: 'component_modal',
      ...(payloadExtras ?? {}),
    },
  } as any);
}

export function notifyModalClosed(
  targetId: string,
  payloadExtras?: Record<string, unknown>
): void {
  if (!activeCore) return;

  const trimmedTargetId =
    typeof targetId === 'string' ? targetId.trim() : '';
  if (!trimmedTargetId) return;

  activeCore.trackEvent({
    type: 'modal_close',
    signalFoxDisplayName: trimmedTargetId,
    target_type: 'modal',
    payload: {
      modalName: trimmedTargetId,
      source: 'react_native_modal',
      kind: 'component_modal',
      ...(payloadExtras ?? {}),
    },
  } as any);
}

/**
 * Hook utilitario (opcional): pide una reconciliación nativa de compras,
 * que típicamente se usa después de iniciar `restore`/sync.
 */
export async function reconcileNativePurchaseState(): Promise<void> {
  debugLog('reconcileNativePurchaseState called');
  await SignalfoxReactNative.reconcileNativePurchases();
}
