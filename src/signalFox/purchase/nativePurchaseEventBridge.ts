import { NativeEventEmitter, NativeModules } from 'react-native';
import type { IAnalyticsCore } from '../types/integration';
import type { NativePurchaseEventPayload } from './purchaseEventTypes';
import SignalfoxReactNative from '../../NativeSignalfoxReactNative';
import {
  ingestNativePurchaseChannelPayload,
  registerPurchaseAnalyticsCore,
  unregisterPurchaseAnalyticsCore,
} from './purchaseAnalyticsBridge';

export const NATIVE_PURCHASE_EVENT_CHANNEL = 'signalfox_purchase_event';

let subscription: { remove: () => void } | null = null;
/** How many times `startListeningToNativePurchaseEvents` was called without the matching `stop`. */
let nativeChannelSessionCount = 0;
let nativePurchaseListenerEnabled = false;

function debugLog(...args: unknown[]): void {
  console.log('[SignalfoxPurchaseAnalyticsBridge]', ...args);
}

function debugWarn(...args: unknown[]): void {
  console.warn('[SignalfoxPurchaseAnalyticsBridge]', ...args);
}

/**
 * Registers the core and, optionally, the native channel (`NativeEventEmitter` + native analytics).
 * To only hook RevenueCat or other JS hooks, use `registerPurchaseAnalyticsCore` in
 * `purchaseAnalyticsBridge` (do not import this module).
 */
export function startListeningToNativePurchaseEvents(
  core: IAnalyticsCore,
  options?: { enableNativePurchaseEvents?: boolean }
): void {
  const enableNativePurchaseEvents =
    options?.enableNativePurchaseEvents === true;

  registerPurchaseAnalyticsCore(core);

  nativeChannelSessionCount += 1;
  if (nativeChannelSessionCount > 1) {
    return;
  }

  nativePurchaseListenerEnabled = enableNativePurchaseEvents;

  debugLog('startListeningToNativePurchaseEvents', {
    nativeChannelSessionCount,
    nativePurchaseListenerEnabled,
  });

  if (!nativePurchaseListenerEnabled) {
    return;
  }

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
        ingestNativePurchaseChannelPayload(payload);
      }
    );
  }

  SignalfoxReactNative.startNativePurchaseAnalytics()
    .then(() => debugLog('startNativePurchaseAnalytics resolved'))
    .catch((e) => debugWarn('startNativePurchaseAnalytics failed', e));
}

export function stopListeningToNativePurchaseEvents(): void {
  if (nativeChannelSessionCount <= 0) {
    return;
  }
  unregisterPurchaseAnalyticsCore();
  nativeChannelSessionCount -= 1;
  if (nativeChannelSessionCount > 0) {
    return;
  }

  debugLog('stopListeningToNativePurchaseEvents', {
    nativeChannelSessionCount,
  });
  subscription?.remove();
  subscription = null;
  nativePurchaseListenerEnabled = false;

  SignalfoxReactNative.stopNativePurchaseAnalytics().catch(() => {
    // ignore
  });
}

export async function reconcileNativePurchaseState(): Promise<void> {
  debugLog('reconcileNativePurchaseState called');
  await SignalfoxReactNative.reconcileNativePurchases();
}

export {
  notifyModalClosed,
  notifyModalOpened,
  notifyPurchaseCancelled,
  notifyPurchaseCompleted,
  notifyPurchaseFailed,
  notifyPurchaseStarted,
  notifyRestoreCompleted,
} from './purchaseAnalyticsBridge';
