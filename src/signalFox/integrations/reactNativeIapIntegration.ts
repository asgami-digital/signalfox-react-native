import { Platform } from 'react-native';
import type { AnalyticsIntegration } from '../types/integration';
import type { NativePurchaseEventPayload } from '../purchase/purchaseEventTypes';
import {
  notifyPurchaseCancelled,
  notifyPurchaseCompleted,
  notifyPurchaseFailed,
  notifyPurchaseStarted,
  notifyRestoreCompleted,
  registerPurchaseAnalyticsCore,
  unregisterPurchaseAnalyticsCore,
} from '../purchase/purchaseAnalyticsBridge';

export const REACT_NATIVE_IAP_ANALYTICS_INTEGRATION_NAME =
  'reactNativeIapPurchaseAnalytics';

export interface ReactNativeIapIntegrationOptions {
  reactNativeIap: unknown;
}

type PurchaseModule = Record<string, unknown>;
type EventSubscription = { remove(): void };

type PurchaseLike = Record<string, unknown>;
type PurchaseErrorLike = Record<string, unknown>;
type RequestLike = Record<string, unknown>;

type ActivePatch = {
  module: PurchaseModule;
  originalDescriptors: Map<string, PropertyDescriptor | undefined>;
  fallbackSubscriptions: EventSubscription[];
  cleanupFns: Array<() => void>;
  nitroRestoreState: {
    lastSyncIOSAt: number | null;
  };
};

let activePatch: ActivePatch | null = null;
const RN_IAP_PATCH_MARKER = Symbol.for('signalFox.reactNativeIapPatchApplied');
const RN_IAP_NITRO_REQUEST_PATCH_MARKER = Symbol.for(
  'signalFox.reactNativeIapNitroRequestPurchasePatched'
);
const RN_IAP_NITRO_SYNC_IOS_PATCH_MARKER = Symbol.for(
  'signalFox.reactNativeIapNitroSyncIOSPatched'
);
const RN_IAP_NITRO_GET_AVAILABLE_PURCHASES_PATCH_MARKER = Symbol.for(
  'signalFox.reactNativeIapNitroGetAvailablePurchasesPatched'
);
const NITRO_RESTORE_SYNC_WINDOW_MS = 10_000;

function debugLog(...args: unknown[]): void {
  console.log('[SignalFox][react-native-iap]', ...args);
}

function resolveReactNativeIapExport(value: unknown): PurchaseModule | null {
  if (!value || typeof value !== 'object') return null;
  const root = value as PurchaseModule;
  debugLog('resolveReactNativeIapExport: checking root export', {
    hasUseIAP: typeof root.useIAP === 'function',
    hasRequestPurchase: typeof root.requestPurchase === 'function',
    hasPurchaseUpdatedListener:
      typeof root.purchaseUpdatedListener === 'function',
    hasPurchaseErrorListener: typeof root.purchaseErrorListener === 'function',
    hasDefault: Boolean(root.default),
  });
  if (
    typeof root.useIAP === 'function' ||
    typeof root.requestPurchase === 'function'
  ) {
    debugLog('resolveReactNativeIapExport: resolved from root export');
    return root;
  }
  const d = root.default;
  if (d && typeof d === 'object') {
    const mod = d as PurchaseModule;
    debugLog('resolveReactNativeIapExport: checking default export', {
      hasUseIAP: typeof mod.useIAP === 'function',
      hasRequestPurchase: typeof mod.requestPurchase === 'function',
      hasPurchaseUpdatedListener:
        typeof mod.purchaseUpdatedListener === 'function',
      hasPurchaseErrorListener: typeof mod.purchaseErrorListener === 'function',
    });
    if (
      typeof mod.useIAP === 'function' ||
      typeof mod.requestPurchase === 'function'
    ) {
      debugLog('resolveReactNativeIapExport: resolved from default export');
      return mod;
    }
  }
  debugLog('resolveReactNativeIapExport: failed to resolve compatible export');
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function getOwnDescriptor(
  target: PurchaseModule,
  key: string
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(target, key);
  } catch {
    return undefined;
  }
}

function definePatchedExport(
  target: PurchaseModule,
  key: string,
  createPatched: (original: Function) => Function
): boolean {
  const descriptor = getOwnDescriptor(target, key);
  const original =
    typeof descriptor?.get === 'function'
      ? descriptor.get.call(target)
      : target[key];

  debugLog('definePatchedExport: attempting', {
    key,
    hasOwnDescriptor: Boolean(descriptor),
    descriptorConfigurable: descriptor?.configurable ?? null,
    descriptorWritable: descriptor?.writable ?? null,
    descriptorHasGetter: typeof descriptor?.get === 'function',
    originalType: typeof original,
  });

  if (typeof original !== 'function') {
    debugLog('definePatchedExport: skipped, original is not function', { key });
    return false;
  }

  const patched = createPatched(original);

  try {
    if (descriptor?.configurable !== false) {
      Object.defineProperty(target, key, {
        configurable: descriptor?.configurable ?? true,
        enumerable: descriptor?.enumerable ?? true,
        writable: true,
        value: patched,
      });
      debugLog('definePatchedExport: success via defineProperty', { key });
      return true;
    }
    if (descriptor?.writable === true) {
      target[key] = patched;
      debugLog('definePatchedExport: success via direct assignment', { key });
      return true;
    }
    debugLog('definePatchedExport: failed, non-configurable and non-writable', {
      key,
    });
    return false;
  } catch {
    try {
      target[key] = patched;
      debugLog('definePatchedExport: success via assignment after catch', {
        key,
      });
      return true;
    } catch (error) {
      console.warn('[SignalFox][react-native-iap] failed to patch method', {
        key,
        error,
      });
      return false;
    }
  }
}

function loadNitroModulesRuntime(): PurchaseModule | null {
  try {
    const nitroModule = require('react-native-nitro-modules');
    const nitroModules = asRecord(asRecord(nitroModule)?.NitroModules);
    return nitroModules && typeof nitroModules.createHybridObject === 'function'
      ? nitroModules
      : null;
  } catch {
    return null;
  }
}

function patchNitroRequestPurchaseIfNeeded(hybridObject: unknown): boolean {
  const target = asRecord(hybridObject);
  if (!target) return false;
  if ((target as any)[RN_IAP_NITRO_REQUEST_PATCH_MARKER]) return true;
  if (typeof target.requestPurchase !== 'function') return false;

  const patched = definePatchedExport(target, 'requestPurchase', (original) => {
    return async function patchedNitroRequestPurchase(
      this: unknown,
      request: unknown
    ) {
      const startedPayload = extractStartedPayloadFromNitroRequest(request);
      debugLog('nitro requestPurchase() patched call', startedPayload);
      notifyPurchaseStarted(startedPayload);
      return await original.call(this, request);
    };
  });

  if (patched) {
    (target as any)[RN_IAP_NITRO_REQUEST_PATCH_MARKER] = true;
  }

  return patched;
}

function patchNitroSyncIOSIfNeeded(
  hybridObject: unknown,
  patch: ActivePatch
): boolean {
  const target = asRecord(hybridObject);
  if (!target) return false;
  if ((target as any)[RN_IAP_NITRO_SYNC_IOS_PATCH_MARKER]) return true;
  if (typeof target.syncIOS !== 'function') return false;

  const patched = definePatchedExport(target, 'syncIOS', (original) => {
    return async function patchedNitroSyncIOS(
      this: unknown,
      ...args: unknown[]
    ) {
      const result = await original.apply(this, args);
      patch.nitroRestoreState.lastSyncIOSAt = Date.now();
      debugLog('nitro syncIOS() patched call', {
        lastSyncIOSAt: patch.nitroRestoreState.lastSyncIOSAt,
      });
      return result;
    };
  });

  if (patched) {
    (target as any)[RN_IAP_NITRO_SYNC_IOS_PATCH_MARKER] = true;
  }

  return patched;
}

function patchNitroGetAvailablePurchasesIfNeeded(
  hybridObject: unknown,
  patch: ActivePatch
): boolean {
  const target = asRecord(hybridObject);
  if (!target) return false;
  if ((target as any)[RN_IAP_NITRO_GET_AVAILABLE_PURCHASES_PATCH_MARKER]) {
    return true;
  }
  if (typeof target.getAvailablePurchases !== 'function') return false;

  const patched = definePatchedExport(
    target,
    'getAvailablePurchases',
    (original) => {
      return async function patchedNitroGetAvailablePurchases(
        this: unknown,
        ...args: unknown[]
      ) {
        const now = Date.now();
        const lastSyncIOSAt = patch.nitroRestoreState.lastSyncIOSAt;
        const shouldTreatAsRestore =
          Platform.OS === 'ios' &&
          typeof lastSyncIOSAt === 'number' &&
          now - lastSyncIOSAt >= 0 &&
          now - lastSyncIOSAt <= NITRO_RESTORE_SYNC_WINDOW_MS;

        patch.nitroRestoreState.lastSyncIOSAt = null;

        const result = await original.apply(this, args);
        if (shouldTreatAsRestore) {
          const restorePayload = extractRestorePayload(result);
          debugLog(
            'nitro getAvailablePurchases() patched restore completion',
            restorePayload
          );
          notifyRestoreCompleted(restorePayload as any);
        }
        return result;
      };
    }
  );

  if (patched) {
    (target as any)[RN_IAP_NITRO_GET_AVAILABLE_PURCHASES_PATCH_MARKER] = true;
  }

  return patched;
}

function patchNitroCreateHybridObject(patch: ActivePatch): boolean {
  const nitroModules = loadNitroModulesRuntime();
  if (!nitroModules || typeof nitroModules.createHybridObject !== 'function') {
    debugLog('patchNitroCreateHybridObject: NitroModules unavailable');
    return false;
  }

  const descriptor = getOwnDescriptor(nitroModules, 'createHybridObject');
  const original =
    typeof descriptor?.get === 'function'
      ? descriptor.get.call(nitroModules)
      : nitroModules.createHybridObject;

  if (typeof original !== 'function') {
    debugLog(
      'patchNitroCreateHybridObject: createHybridObject is not callable'
    );
    return false;
  }

  const patchedCreateHybridObject = function patchedCreateHybridObject(
    this: unknown,
    ...args: unknown[]
  ) {
    const hybridObject = original.apply(this, args);
    const hybridObjectName = readString(args[0]);
    if (hybridObjectName === 'RnIap') {
      const didPatchHybridObject =
        patchNitroRequestPurchaseIfNeeded(hybridObject);
      const didPatchSyncIOS = patchNitroSyncIOSIfNeeded(hybridObject, patch);
      const didPatchGetAvailablePurchases =
        patchNitroGetAvailablePurchasesIfNeeded(hybridObject, patch);
      debugLog('patchNitroCreateHybridObject: RnIap hybrid object result', {
        didPatchHybridObject,
        didPatchSyncIOS,
        didPatchGetAvailablePurchases,
      });
    }
    return hybridObject;
  };

  try {
    if (descriptor?.configurable !== false) {
      Object.defineProperty(nitroModules, 'createHybridObject', {
        configurable: descriptor?.configurable ?? true,
        enumerable: descriptor?.enumerable ?? true,
        writable: true,
        value: patchedCreateHybridObject,
      });
    } else if (descriptor?.writable === true) {
      nitroModules.createHybridObject = patchedCreateHybridObject;
    } else {
      debugLog(
        'patchNitroCreateHybridObject: createHybridObject is non-configurable/non-writable'
      );
      return false;
    }
  } catch {
    try {
      nitroModules.createHybridObject = patchedCreateHybridObject;
    } catch (error) {
      console.warn(
        '[SignalFox][react-native-iap] failed to patch NitroModules.createHybridObject',
        { error }
      );
      return false;
    }
  }

  patch.cleanupFns.push(() => {
    try {
      if (descriptor) {
        Object.defineProperty(nitroModules, 'createHybridObject', descriptor);
      } else {
        delete nitroModules.createHybridObject;
      }
    } catch {
      // ignore teardown failures
    }
  });

  debugLog('patchNitroCreateHybridObject: patched createHybridObject');
  return true;
}

function addFallbackListeners(
  module: PurchaseModule,
  patchPurchaseUpdatedListener: boolean,
  patchPurchaseErrorListener: boolean
): EventSubscription[] {
  const subscriptions: EventSubscription[] = [];
  debugLog('addFallbackListeners: evaluating', {
    patchPurchaseUpdatedListener,
    patchPurchaseErrorListener,
    hasPurchaseUpdatedListener:
      typeof module.purchaseUpdatedListener === 'function',
    hasPurchaseErrorListener:
      typeof module.purchaseErrorListener === 'function',
  });

  if (
    !patchPurchaseUpdatedListener &&
    typeof module.purchaseUpdatedListener === 'function'
  ) {
    try {
      const subscription = module.purchaseUpdatedListener(
        (purchase: PurchaseLike) => {
          const completedPayload =
            extractCompletedPayloadFromPurchase(purchase);
          debugLog('fallback purchaseUpdatedListener event', completedPayload);
          notifyPurchaseCompleted(completedPayload);
        }
      );
      subscriptions.push(wrapEventSubscription(subscription));
      debugLog(
        'addFallbackListeners: registered purchaseUpdatedListener fallback'
      );
    } catch (error) {
      console.warn(
        '[SignalFox][react-native-iap] failed to register fallback purchaseUpdatedListener',
        { error }
      );
    }
  }

  if (
    !patchPurchaseErrorListener &&
    typeof module.purchaseErrorListener === 'function'
  ) {
    try {
      const subscription = module.purchaseErrorListener(
        (error: PurchaseErrorLike) => {
          const errorPayload = extractErrorPayload(error);
          debugLog('fallback purchaseErrorListener event', {
            ...errorPayload,
            isUserCancelled: isUserCancelled(module, error),
          });
          if (isUserCancelled(module, error)) {
            notifyPurchaseCancelled(errorPayload);
          } else {
            notifyPurchaseFailed(errorPayload);
          }
        }
      );
      subscriptions.push(wrapEventSubscription(subscription));
      debugLog(
        'addFallbackListeners: registered purchaseErrorListener fallback'
      );
    } catch (error) {
      console.warn(
        '[SignalFox][react-native-iap] failed to register fallback purchaseErrorListener',
        { error }
      );
    }
  }

  return subscriptions;
}

function patchOwnMethods(module: PurchaseModule, patch: ActivePatch): void {
  let didPatchRequestPurchase = false;
  let didPatchRequestSubscription = false;
  let didPatchPurchaseUpdatedListener = false;
  let didPatchPurchaseErrorListener = false;
  let didPatchUseIAP = false;
  debugLog('patchOwnMethods: begin', {
    hasRequestPurchase: typeof module.requestPurchase === 'function',
    hasRequestSubscription: typeof module.requestSubscription === 'function',
    hasPurchaseUpdatedListener:
      typeof module.purchaseUpdatedListener === 'function',
    hasPurchaseErrorListener:
      typeof module.purchaseErrorListener === 'function',
    hasUseIAP: typeof module.useIAP === 'function',
  });
  if (typeof module.requestPurchase === 'function') {
    patch.originalDescriptors.set(
      'requestPurchase',
      getOwnDescriptor(module, 'requestPurchase')
    );
    didPatchRequestPurchase = definePatchedExport(
      module,
      'requestPurchase',
      (original) => {
        return async function patchedRequestPurchase(
          this: unknown,
          request: unknown
        ) {
          const startedPayload = extractStartedPayloadFromRequest(request);
          debugLog('requestPurchase() patched call', startedPayload);
          notifyPurchaseStarted(startedPayload);
          return await original.call(this, request);
        };
      }
    );
    debugLog('patchOwnMethods: requestPurchase patch result', {
      patched: didPatchRequestPurchase,
    });
  }

  if (typeof module.requestSubscription === 'function') {
    patch.originalDescriptors.set(
      'requestSubscription',
      getOwnDescriptor(module, 'requestSubscription')
    );
    didPatchRequestSubscription = definePatchedExport(
      module,
      'requestSubscription',
      (original) => {
        return async function patchedRequestSubscription(
          this: unknown,
          request: unknown
        ) {
          const startedPayload: Omit<NativePurchaseEventPayload, 'eventName'> =
            {
              ...extractStartedPayloadFromRequest(request),
              productType: 'subscription',
            };
          debugLog('requestSubscription() patched call', startedPayload);
          notifyPurchaseStarted(startedPayload);
          return await original.call(this, request);
        };
      }
    );
    debugLog('patchOwnMethods: requestSubscription patch result', {
      patched: didPatchRequestSubscription,
    });
  }

  if (typeof module.purchaseUpdatedListener === 'function') {
    patch.originalDescriptors.set(
      'purchaseUpdatedListener',
      getOwnDescriptor(module, 'purchaseUpdatedListener')
    );
    didPatchPurchaseUpdatedListener = definePatchedExport(
      module,
      'purchaseUpdatedListener',
      (original) => {
        return function patchedPurchaseUpdatedListener(
          this: unknown,
          listener: (purchase: PurchaseLike) => void
        ): EventSubscription {
          const subscription = original.call(this, (purchase: PurchaseLike) => {
            const completedPayload =
              extractCompletedPayloadFromPurchase(purchase);
            debugLog('purchaseUpdatedListener event', completedPayload);
            notifyPurchaseCompleted(completedPayload);
            listener?.(purchase);
          });
          return wrapEventSubscription(subscription);
        };
      }
    );
  }

  if (typeof module.purchaseErrorListener === 'function') {
    patch.originalDescriptors.set(
      'purchaseErrorListener',
      getOwnDescriptor(module, 'purchaseErrorListener')
    );
    didPatchPurchaseErrorListener = definePatchedExport(
      module,
      'purchaseErrorListener',
      (original) => {
        return function patchedPurchaseErrorListener(
          this: unknown,
          listener: (error: PurchaseErrorLike) => void
        ): EventSubscription {
          const subscription = original.call(
            this,
            (error: PurchaseErrorLike) => {
              const errorPayload = extractErrorPayload(error);
              debugLog('purchaseErrorListener event', {
                ...errorPayload,
                isUserCancelled: isUserCancelled(module, error),
              });
              if (isUserCancelled(module, error)) {
                notifyPurchaseCancelled(errorPayload);
              } else {
                notifyPurchaseFailed(errorPayload);
              }
              listener?.(error);
            }
          );
          return wrapEventSubscription(subscription);
        };
      }
    );
  }

  if (typeof module.useIAP === 'function') {
    patch.originalDescriptors.set('useIAP', getOwnDescriptor(module, 'useIAP'));
    didPatchUseIAP = definePatchedExport(module, 'useIAP', (original) => {
      return function patchedUseIAP(this: unknown, options?: unknown) {
        const optionsRecord = asRecord(options) ?? {};
        const userOnPurchaseSuccess =
          typeof optionsRecord.onPurchaseSuccess === 'function'
            ? (optionsRecord.onPurchaseSuccess as (
                purchase: PurchaseLike
              ) => void)
            : undefined;
        const userOnPurchaseError =
          typeof optionsRecord.onPurchaseError === 'function'
            ? (optionsRecord.onPurchaseError as (
                error: PurchaseErrorLike
              ) => void)
            : undefined;

        const wrappedOptions = {
          ...optionsRecord,
          onPurchaseSuccess: (purchase: PurchaseLike) => {
            const completedPayload =
              extractCompletedPayloadFromPurchase(purchase);
            debugLog('useIAP.onPurchaseSuccess event', completedPayload);
            notifyPurchaseCompleted(completedPayload);
            userOnPurchaseSuccess?.(purchase);
          },
          onPurchaseError: (error: PurchaseErrorLike) => {
            const errorPayload = extractErrorPayload(error);
            debugLog('useIAP.onPurchaseError event', {
              ...errorPayload,
              isUserCancelled: isUserCancelled(module, error),
            });
            if (isUserCancelled(module, error)) {
              notifyPurchaseCancelled(errorPayload);
            } else {
              notifyPurchaseFailed(errorPayload);
            }
            userOnPurchaseError?.(error);
          },
        };

        const hookResult = original.call(this, wrappedOptions) as Record<
          string,
          unknown
        >;

        if (hookResult && typeof hookResult.requestPurchase === 'function') {
          const originalHookRequestPurchase = hookResult.requestPurchase;
          hookResult.requestPurchase =
            async function patchedHookRequestPurchase(
              this: unknown,
              request: unknown
            ) {
              const startedPayload = extractStartedPayloadFromRequest(request);
              debugLog('useIAP.requestPurchase() patched call', startedPayload);
              notifyPurchaseStarted(startedPayload);
              return await (originalHookRequestPurchase as Function).call(
                this,
                request
              );
            };
        }

        if (
          hookResult &&
          typeof hookResult.requestSubscription === 'function'
        ) {
          const originalHookRequestSubscription =
            hookResult.requestSubscription;
          hookResult.requestSubscription =
            async function patchedHookRequestSubscription(
              this: unknown,
              request: unknown
            ) {
              const startedPayload: Omit<
                NativePurchaseEventPayload,
                'eventName'
              > = {
                ...extractStartedPayloadFromRequest(request),
                productType: 'subscription',
              };
              debugLog(
                'useIAP.requestSubscription() patched call',
                startedPayload
              );
              notifyPurchaseStarted(startedPayload);
              return await (originalHookRequestSubscription as Function).call(
                this,
                request
              );
            };
        }

        if (hookResult && typeof hookResult.restorePurchases === 'function') {
          const originalHookRestorePurchases = hookResult.restorePurchases;
          hookResult.restorePurchases =
            async function patchedHookRestorePurchases(
              this: unknown,
              restoreOptions?: unknown
            ) {
              debugLog('useIAP.restorePurchases() patched call');
              const result = await (
                originalHookRestorePurchases as Function
              ).call(this, restoreOptions);
              const restorePayload = extractRestorePayload(
                Array.isArray(hookResult.availablePurchases)
                  ? hookResult.availablePurchases
                  : result
              );
              debugLog('restorePurchases completed', restorePayload);
              notifyRestoreCompleted(restorePayload as any);
              return result;
            };
        }

        return hookResult;
      };
    });
    debugLog('patchOwnMethods: useIAP patch result', {
      patched: didPatchUseIAP,
    });
  }

  const didPatchNitroCreateHybridObject =
    !didPatchRequestPurchase &&
    !didPatchRequestSubscription &&
    !didPatchUseIAP &&
    patchNitroCreateHybridObject(patch);

  patch.fallbackSubscriptions.push(
    ...addFallbackListeners(
      module,
      didPatchPurchaseUpdatedListener,
      didPatchPurchaseErrorListener
    )
  );
  debugLog('patchOwnMethods: end', {
    didPatchRequestPurchase,
    didPatchRequestSubscription,
    didPatchPurchaseUpdatedListener,
    didPatchPurchaseErrorListener,
    didPatchUseIAP,
    didPatchNitroCreateHybridObject,
    fallbackSubscriptions: patch.fallbackSubscriptions.length,
  });
}

function restorePatchedMethods(patch: ActivePatch): void {
  for (const [key, descriptor] of patch.originalDescriptors.entries()) {
    try {
      if (descriptor) {
        Object.defineProperty(patch.module, key, descriptor);
      } else {
        delete patch.module[key];
      }
    } catch {
      // ignore teardown failures
    }
  }
}

function removeFallbackListeners(patch: ActivePatch): void {
  for (const subscription of patch.fallbackSubscriptions) {
    try {
      subscription.remove();
    } catch {
      // ignore teardown failures
    }
  }
  patch.fallbackSubscriptions = [];
}

function runCleanupFns(patch: ActivePatch): void {
  for (const cleanup of patch.cleanupFns) {
    try {
      cleanup();
    } catch {
      // ignore teardown failures
    }
  }
  patch.cleanupFns = [];
}

function startReactNativeIapPurchaseAnalytics(module: PurchaseModule): void {
  debugLog('startReactNativeIapPurchaseAnalytics: start');
  if (activePatch?.module === module) {
    debugLog('startReactNativeIapPurchaseAnalytics: already active for module');
    return;
  }
  if (activePatch) {
    debugLog(
      'startReactNativeIapPurchaseAnalytics: replacing existing active patch'
    );
    stopReactNativeIapPurchaseAnalytics();
  }
  if ((module as any)[RN_IAP_PATCH_MARKER]) {
    debugLog(
      'startReactNativeIapPurchaseAnalytics: marker already present, skipping'
    );
    return;
  }

  const patch: ActivePatch = {
    module,
    originalDescriptors: new Map<string, PropertyDescriptor | undefined>(),
    fallbackSubscriptions: [],
    cleanupFns: [],
    nitroRestoreState: {
      lastSyncIOSAt: null,
    },
  };
  activePatch = patch;
  (module as any)[RN_IAP_PATCH_MARKER] = true;
  debugLog(
    'startReactNativeIapPurchaseAnalytics: marker set, patching methods'
  );

  patchOwnMethods(module, patch);
}

function stopReactNativeIapPurchaseAnalytics(): void {
  if (!activePatch) return;

  const patch = activePatch;
  removeFallbackListeners(patch);
  runCleanupFns(patch);
  restorePatchedMethods(patch);
  delete (patch.module as any)[RN_IAP_PATCH_MARKER];

  activePatch = null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function pickFirstString(values: unknown[]): string | undefined {
  for (const value of values) {
    const s = readString(value);
    if (s) return s;
  }
  return undefined;
}

function isSubscriptionType(value: unknown): boolean {
  const type = readString(value)?.toLowerCase();
  return type === 'subs' || type === 'subscription';
}

function inferStoreFromRequest(
  request: RequestLike
): 'app_store' | 'google_play' {
  const req = asRecord(request.request);
  if (req?.apple || req?.ios) return 'app_store';
  if (req?.google || req?.android) return 'google_play';
  return Platform.OS === 'ios' ? 'app_store' : 'google_play';
}

function inferProductIdFromRequest(request: RequestLike): string | undefined {
  const req = asRecord(request.request);
  const apple = asRecord(req?.apple ?? req?.ios);
  const google = asRecord(req?.google ?? req?.android);
  return pickFirstString([
    apple?.sku,
    ...(Array.isArray(google?.skus) ? google!.skus : []),
  ]);
}

function extractStartedPayloadFromRequest(
  request: unknown
): Omit<NativePurchaseEventPayload, 'eventName'> {
  const obj = asRecord(request) ?? {};
  const productId = inferProductIdFromRequest(obj);

  return {
    ...(productId ? { productId } : {}),
    productType: isSubscriptionType(obj.type) ? 'subscription' : 'inapp',
    store: inferStoreFromRequest(obj),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

function isNitroSubscriptionRequest(value: RequestLike): boolean {
  const android = asRecord(value.android);
  if (!android) return false;

  return Boolean(
    Array.isArray(android.subscriptionOffers) ||
      android.purchaseToken != null ||
      android.subscriptionProductReplacementParams != null ||
      android.replacementMode != null
  );
}

function inferStoreFromNitroRequest(
  request: RequestLike
): 'app_store' | 'google_play' {
  if (asRecord(request.ios)) return 'app_store';
  if (asRecord(request.android)) return 'google_play';
  return Platform.OS === 'ios' ? 'app_store' : 'google_play';
}

function inferProductIdFromNitroRequest(
  request: RequestLike
): string | undefined {
  const ios = asRecord(request.ios);
  const android = asRecord(request.android);
  return pickFirstString([
    ios?.sku,
    ...(Array.isArray(android?.skus) ? android!.skus : []),
  ]);
}

function extractStartedPayloadFromNitroRequest(
  request: unknown
): Omit<NativePurchaseEventPayload, 'eventName'> {
  const obj = asRecord(request) ?? {};
  const productId = inferProductIdFromNitroRequest(obj);

  return {
    ...(productId ? { productId } : {}),
    productType: isNitroSubscriptionRequest(obj) ? 'subscription' : 'unknown',
    store: inferStoreFromNitroRequest(obj),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

function extractCompletedPayloadFromPurchase(
  purchase: unknown
): Record<string, unknown> {
  const obj = asRecord(purchase) ?? {};
  const transactionId = pickFirstString([
    obj.transactionId,
    obj.purchaseToken,
    obj.originalTransactionIdentifierIOS,
  ]);

  return {
    ...(readString(obj.productId)
      ? { productId: readString(obj.productId) }
      : {}),
    ...(transactionId ? { transactionId } : {}),
    store: Platform.OS === 'ios' ? 'app_store' : 'google_play',
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

function extractRestorePayload(purchases?: unknown): Record<string, unknown> {
  const restoredProductIds = Array.isArray(purchases)
    ? purchases
        .map((purchase) => readString(asRecord(purchase)?.productId))
        .filter((value): value is string => Boolean(value))
    : [];

  return {
    ...(restoredProductIds.length > 0 ? { restoredProductIds } : {}),
    store: Platform.OS === 'ios' ? 'app_store' : 'google_play',
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

function extractErrorPayload(error: unknown): Record<string, unknown> {
  const obj = asRecord(error) ?? {};
  return {
    ...(readString(obj.productId)
      ? { productId: readString(obj.productId) }
      : {}),
    ...(readString(obj.code) ? { errorCode: readString(obj.code) } : {}),
    ...(readString(obj.message)
      ? { errorMessage: readString(obj.message) }
      : {}),
    store: Platform.OS === 'ios' ? 'app_store' : 'google_play',
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

function isUserCancelled(module: PurchaseModule, error: unknown): boolean {
  const obj = asRecord(error);
  const code = readString(obj?.code)?.toLowerCase() ?? '';
  const message = readString(obj?.message)?.toLowerCase() ?? '';
  const errorCodeEnum = asRecord(module.ErrorCode);
  const expected = readString(errorCodeEnum?.UserCancelled)?.toLowerCase();

  return (
    code.includes('cancel') ||
    message.includes('cancel') ||
    (expected != null && code === expected.toLowerCase())
  );
}

function wrapEventSubscription(
  subscription: unknown,
  onRemove?: () => void
): EventSubscription {
  const sub =
    subscription && typeof subscription === 'object'
      ? (subscription as EventSubscription)
      : { remove() {} };

  return {
    remove() {
      onRemove?.();
      sub.remove?.();
    },
  };
}

export function applyReactNativeIapPatch(reactNativeIap: unknown): void {
  const module = resolveReactNativeIapExport(reactNativeIap);
  if (!module) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[SignalFox][react-native-iap] applyReactNativeIapPatch(): module export could not be resolved'
      );
    }
    return;
  }

  startReactNativeIapPurchaseAnalytics(module);
}

export function reactNativeIapIntegration(
  options: ReactNativeIapIntegrationOptions
): AnalyticsIntegration {
  const module = resolveReactNativeIapExport(options.reactNativeIap);

  return {
    name: REACT_NATIVE_IAP_ANALYTICS_INTEGRATION_NAME,

    setup(core) {
      registerPurchaseAnalyticsCore(core);

      if (module) {
        startReactNativeIapPurchaseAnalytics(module);
      } else if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(
          '[SignalFox][react-native-iap] reactNativeIapIntegration.setup(): module export could not be resolved'
        );
      }

      return () => {
        stopReactNativeIapPurchaseAnalytics();
        unregisterPurchaseAnalyticsCore();
      };
    },
  };
}
