import { Platform } from 'react-native';
import type { IAnalyticsCore } from '../types/integration';
import type { AnalyticsEventType } from '../types/events';
import { normalizeNativePurchaseEventToAnalyticsEvent } from './normalizeNativePurchaseEvent';
import type {
  NativePurchaseEventPayload,
  PurchaseStore,
} from './purchaseEventTypes';

let activeCore: IAnalyticsCore | null = null;
let bridgeRefCount = 0;
const lastEventSeenAtMs = new Map<string, number>();
const DEDUPE_WINDOW_MS = 3000;
const COMPLETION_DEDUPE_WINDOW_MS = 10000;

/** Last SKU notified through `notifyPurchaseStarted` (for example, Android cancel without productId). */
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

function attachPendingProductIdToJsPayload<T extends Record<string, unknown> | undefined>(
  payload: T
): T {
  if (
    pendingPurchaseProductId == null ||
    (typeof payload?.productId === 'string' && payload.productId.trim().length > 0)
  ) {
    return payload;
  }
  return {
    ...(payload ?? {}),
    productId: pendingPurchaseProductId,
  } as T;
}

function debugLog(...args: unknown[]): void {
  console.log('[SignalfoxPurchaseAnalyticsBridge]', ...args);
}

function debugWarn(...args: unknown[]): void {
  console.warn('[SignalfoxPurchaseAnalyticsBridge]', ...args);
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

function shouldDedupe(
  payload: NativePurchaseEventPayload,
  dedupeWindowMs = DEDUPE_WINDOW_MS
): boolean {
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
  if (typeof prev === 'number' && now - prev < dedupeWindowMs) {
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
 * Registers the `AnalyticsCore` so `notifyPurchase*` and hooks (for example, RevenueCat) can send events.
 * Independent from the optional native channel (`nativePurchaseEventBridge`).
 */
export function registerPurchaseAnalyticsCore(core: IAnalyticsCore): void {
  if (bridgeRefCount === 0) {
    activeCore = core;
  }
  bridgeRefCount += 1;
}

export function unregisterPurchaseAnalyticsCore(): void {
  if (bridgeRefCount <= 0) return;
  bridgeRefCount -= 1;
  if (bridgeRefCount > 0) return;
  lastEventSeenAtMs.clear();
  activeCore = null;
  pendingPurchaseProductId = null;
}

/** Used by the native channel listener (separate module). */
export function ingestNativePurchaseChannelPayload(
  payload: NativePurchaseEventPayload
): void {
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

  const normalized = normalizeNativePurchaseEventToAnalyticsEvent(payload);
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

export function notifyPurchaseStarted(
  payload: Omit<NativePurchaseEventPayload, 'eventName'> & {
    timestamp?: number;
  }
): void {
  setPendingPurchaseProductId((payload as { productId?: string }).productId);

  if (!activeCore) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      debugWarn(
        'notifyPurchaseStarted: no activeCore - the event will not be sent to the core. Mount revenueCatIntegration() or call registerPurchaseAnalyticsCore(core) before purchasing.'
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
  activeCore.trackEvent({
    ...coreEvent,
    ...(typeof payload.timestamp === 'number' &&
    Number.isFinite(payload.timestamp) &&
    payload.timestamp > 0
      ? { timestamp: payload.timestamp }
      : {}),
  } as any);
}

export function notifyPurchaseCancelled(
  payload?: Omit<NativePurchaseEventPayload, 'eventName'>
): void {
  if (!activeCore) return;

  const payloadWithPendingProductId = attachPendingProductIdToJsPayload(
    payload as Record<string, unknown> | undefined
  ) as Omit<NativePurchaseEventPayload, 'eventName'> | undefined;

  const normalized = normalizeNativePurchaseEventToAnalyticsEvent({
    ...(payloadWithPendingProductId as any),
    eventName: 'purchase_cancelled',
    platform:
      payloadWithPendingProductId?.platform ??
      (Platform.OS === 'ios' ? 'ios' : 'android'),
    store: payloadWithPendingProductId?.store ?? defaultStoreForPlatform(),
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

  const payloadWithPendingProductId = attachPendingProductIdToJsPayload(
    payload as Record<string, unknown> | undefined
  ) as Omit<NativePurchaseEventPayload, 'eventName'> | undefined;

  const normalized = normalizeNativePurchaseEventToAnalyticsEvent({
    ...(payloadWithPendingProductId as any),
    eventName: 'purchase_failed',
    platform:
      payloadWithPendingProductId?.platform ??
      (Platform.OS === 'ios' ? 'ios' : 'android'),
    store: payloadWithPendingProductId?.store ?? defaultStoreForPlatform(),
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

  const completedPayload = {
    ...(payload as any),
    eventName: 'purchase_completed',
    platform: payload?.platform ?? (Platform.OS === 'ios' ? 'ios' : 'android'),
    store: payload?.store ?? defaultStoreForPlatform(),
  } as NativePurchaseEventPayload;
  if (shouldDedupe(completedPayload, COMPLETION_DEDUPE_WINDOW_MS)) {
    debugLog('dedupe: skipped duplicate JS purchase payload', {
      eventName: completedPayload.eventName,
      productId: completedPayload.productId,
      transactionId: completedPayload.transactionId,
    });
    return;
  }

  const normalized =
    normalizeNativePurchaseEventToAnalyticsEvent(completedPayload);
  const coreEvent = toCoreTrackEvent(normalized);
  if (!coreEvent) return;
  activeCore.trackEvent(coreEvent as any);
  clearPendingPurchaseProductId('notifyPurchaseCompleted');
}

export function notifyRestoreCompleted(
  payload: Omit<NativePurchaseEventPayload, 'eventName'>
): void {
  if (!activeCore) return;

  const restorePayload = {
    ...(payload as any),
    eventName: 'restore_completed',
  } as NativePurchaseEventPayload;
  if (shouldDedupe(restorePayload, COMPLETION_DEDUPE_WINDOW_MS)) {
    debugLog('dedupe: skipped duplicate JS restore payload', {
      restoredProductIds: restorePayload.restoredProductIds,
    });
    return;
  }

  const normalized =
    normalizeNativePurchaseEventToAnalyticsEvent(restorePayload);
  const coreEvent = toCoreTrackEvent(normalized);
  if (!coreEvent) return;
  activeCore.trackEvent(coreEvent as any);
}

export function notifyModalOpened(
  targetId: string,
  payloadExtras?: Record<string, unknown>,
  timestamp?: number
): void {
  if (!activeCore) return;

  const trimmedTargetId = typeof targetId === 'string' ? targetId.trim() : '';
  if (!trimmedTargetId) return;

  activeCore.trackEvent({
    type: 'modal_open',
    ...(typeof timestamp === 'number' &&
    Number.isFinite(timestamp) &&
    timestamp > 0
      ? { timestamp }
      : {}),
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
  payloadExtras?: Record<string, unknown>,
  timestamp?: number
): void {
  if (!activeCore) return;

  const trimmedTargetId = typeof targetId === 'string' ? targetId.trim() : '';
  if (!trimmedTargetId) return;

  activeCore.trackEvent({
    type: 'modal_close',
    ...(typeof timestamp === 'number' &&
    Number.isFinite(timestamp) &&
    timestamp > 0
      ? { timestamp }
      : {}),
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
