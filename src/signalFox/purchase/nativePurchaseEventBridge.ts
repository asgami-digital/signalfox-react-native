import { NativeEventEmitter, NativeModules } from 'react-native';
import type { IAnalyticsCore } from '../types/integration';
import type { AnalyticsEventType } from '../types/events';
import { normalizeNativePurchaseEventToAnalyticsEvent } from './normalizeNativePurchaseEvent';
import type { NativePurchaseEventPayload } from './purchaseEventTypes';
import SignalfoxReactNative from '../../NativeSignalfoxReactNative';

export const NATIVE_PURCHASE_EVENT_CHANNEL = 'signalfox_purchase_event';

let activeCore: IAnalyticsCore | null = null;
let refCount = 0;
let subscription: { remove: () => void } | null = null;
const lastEventSeenAtMs = new Map<string, number>();
const DEDUPE_WINDOW_MS = 3000;

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
 * Se suscribe a eventos nativos de compra y los enruta al pipeline del core.
 */
export function startListeningToNativePurchaseEvents(
  core: IAnalyticsCore
): void {
  if (refCount === 0) {
    activeCore = core;
  }

  refCount += 1;
  if (refCount > 1) return;

  debugLog('startListeningToNativePurchaseEvents', {
    refCount,
    platform: core ? 'hasCore' : 'noCore',
  });

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
        debugLog('NativeEventEmitter received', event);
        if (!activeCore) return;
        const payload = event as NativePurchaseEventPayload;

        if (shouldDedupe(payload)) return;

        const normalized =
          normalizeNativePurchaseEventToAnalyticsEvent(payload);
        if (!normalized) {
          debugWarn('Normalization returned null', payload);
          return;
        }
        const coreEvent = toCoreTrackEvent(normalized);
        if (!coreEvent) return;
        activeCore.trackEvent(coreEvent as any);
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

  SignalfoxReactNative.stopNativePurchaseAnalytics().catch(() => {
    // ignore
  });
}

/**
 * Hook opcional: permite emitir `purchase_started` cuando no es observable pasivamente
 * desde el nativo (por ejemplo, por la forma en que la app lanza su flow de compra).
 *
 * Nota: el backend seguirá agrupando por `family = "purchase"`.
 */
export function notifyPurchaseStarted(
  payload: Omit<NativePurchaseEventPayload, 'eventName'>
): void {
  if (!activeCore) return;

  const normalized = normalizeNativePurchaseEventToAnalyticsEvent({
    ...(payload as any),
    eventName: 'purchase_started',
  });
  const coreEvent = toCoreTrackEvent(normalized);
  if (!coreEvent) return;
  activeCore.trackEvent(coreEvent as any);
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

/**
 * Hook utilitario (opcional): pide una reconciliación nativa de compras,
 * que típicamente se usa después de iniciar `restore`/sync.
 */
export async function reconcileNativePurchaseState(): Promise<void> {
  debugLog('reconcileNativePurchaseState called');
  await SignalfoxReactNative.reconcileNativePurchases();
}
