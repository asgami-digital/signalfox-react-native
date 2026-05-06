import { Platform } from 'react-native';
import type { IAnalyticsCore } from '../types/integration';
import type { AnalyticsEventType } from '../types/events';
import {
  isModalInStack,
  modalStackPop,
  modalStackPush,
} from '../core/modalStack';
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

export interface TrackModalShownParams {
  visible: boolean;
  signalFoxNodeId: string;
  signalFoxNodeDisplayName?: string;
}

function isSignalFoxDebugEnabled(): boolean {
  return (
    (globalThis as { __SIGNALFOX_DEBUG__?: boolean }).__SIGNALFOX_DEBUG__ ===
    true
  );
}

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

function attachPendingProductIdToJsPayload<
  T extends Record<string, unknown> | undefined
>(payload: T): T {
  if (
    pendingPurchaseProductId == null ||
    (typeof payload?.productId === 'string' &&
      payload.productId.trim().length > 0)
  ) {
    return payload;
  }
  const payloadWithProductId = {
    ...(payload ?? {}),
    productId: pendingPurchaseProductId,
  };
  return payloadWithProductId as T & typeof payloadWithProductId;
}

function debugLog(...args: unknown[]): void {
  if (!isSignalFoxDebugEnabled()) return;
  console.log('[SignalfoxPurchaseAnalyticsBridge]', ...args);
}

function debugWarn(...args: unknown[]): void {
  if (!isSignalFoxDebugEnabled()) return;
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
    debugWarn('Dedupe: dropping duplicate purchase event', { key });
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
 * Independent from any concrete purchase integration.
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

export function notifyPurchaseStarted(
  payload?: Omit<NativePurchaseEventPayload, 'eventName'> & {
    timestamp?: number;
  }
): void {
  setPendingPurchaseProductId(
    (payload as { productId?: string } | undefined)?.productId
  );

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
      (payload as any)?.platform ?? (Platform.OS === 'ios' ? 'ios' : 'android'),
    store: (payload as any)?.store ?? defaultStoreForPlatform(),
  });
  const coreEvent = toCoreTrackEvent(normalized);
  if (!coreEvent) return;
  activeCore.trackEvent({
    ...coreEvent,
    ...(typeof payload?.timestamp === 'number' &&
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

  const payloadWithPendingProductId = attachPendingProductIdToJsPayload(
    payload as Record<string, unknown> | undefined
  ) as Omit<NativePurchaseEventPayload, 'eventName'> | undefined;

  const completedPayload = {
    ...(payloadWithPendingProductId as any),
    eventName: 'purchase_completed',
    platform:
      payloadWithPendingProductId?.platform ??
      (Platform.OS === 'ios' ? 'ios' : 'android'),
    store: payloadWithPendingProductId?.store ?? defaultStoreForPlatform(),
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
  signalFoxNodeId: string,
  payloadExtras?: Record<string, unknown>,
  timestamp?: number
): void {
  trackModalVisibilityChange({
    targetId: signalFoxNodeId,
    payloadExtras,
    timestamp,
    visible: true,
    ignoreCloseIfMissing: false,
  });
}

export function notifyModalClosed(
  signalFoxNodeId: string,
  payloadExtras?: Record<string, unknown>,
  timestamp?: number
): void {
  trackModalVisibilityChange({
    targetId: signalFoxNodeId,
    payloadExtras,
    timestamp,
    visible: false,
    ignoreCloseIfMissing: false,
  });
}

export function trackModalShown(params: TrackModalShownParams): void {
  trackModalVisibilityChange({
    targetId: params.signalFoxNodeId,
    displayName: params.signalFoxNodeDisplayName,
    visible: params.visible,
    ignoreCloseIfMissing: true,
  });
}

function trimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function trackModalVisibilityChange({
  targetId,
  displayName,
  payloadExtras,
  timestamp,
  visible,
  ignoreCloseIfMissing,
}: {
  targetId: unknown;
  displayName?: unknown;
  payloadExtras?: Record<string, unknown>;
  timestamp?: number;
  visible: boolean;
  ignoreCloseIfMissing: boolean;
}): void {
  if (!activeCore) return;

  const trimmedTargetId = trimmedNonEmptyString(targetId);
  if (!trimmedTargetId) return;

  const trimmedDisplayName = trimmedNonEmptyString(displayName);
  if (visible && isModalInStack(trimmedTargetId)) {
    return;
  }
  if (!visible && ignoreCloseIfMissing && !isModalInStack(trimmedTargetId)) {
    return;
  }

  const parentModal = visible
    ? modalStackPush({
        id: trimmedTargetId,
        source: 'react_native_modal',
      })
    : modalStackPop(trimmedTargetId);

  activeCore.trackEvent({
    type: visible ? 'modal_open' : 'modal_close',
    ...(typeof timestamp === 'number' &&
    Number.isFinite(timestamp) &&
    timestamp > 0
      ? { timestamp }
      : {}),
    signalFoxNodeId: trimmedTargetId,
    ...(trimmedDisplayName
      ? { signalFoxNodeDisplayName: trimmedDisplayName }
      : {}),
    target_type: 'modal',
    payload: {
      modalName: trimmedTargetId,
      source: 'react_native_modal',
      kind: 'component_modal',
      ...(payloadExtras ?? {}),
      parent_modal: parentModal,
    },
  } as any);
}
