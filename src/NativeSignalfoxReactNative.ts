import {
  NativeModules,
  Platform,
  TurboModuleRegistry,
  type TurboModule,
} from 'react-native';

export interface Spec extends TurboModule {
  getAppVersion(): Promise<string>;
  getAnonymousId(): Promise<string>;
  getDeviceModel(): Promise<string>;
  getOsVersion(): Promise<string>;

  /**
   * Starts native purchase listeners and enables event emission to JS.
   * Events are published on the `signalfox_purchase_event` channel.
   */
  startNativePurchaseAnalytics(): Promise<void>;

  /**
   * Stops native purchase listeners.
   */
  stopNativePurchaseAnalytics(): Promise<void>;

  /**
   * Forces a native reconciliation (for example, re-querying active purchases)
   * that may emit `restore_completed`.
   */
  reconcileNativePurchases(): Promise<void>;

  /**
   * Opens a heuristic paywall window to infer `purchase_started`
   * from `inactive` while RevenueCatUI is visible.
   */
  beginHeuristicPaywallSession(): Promise<void>;

  /**
   * Closes the heuristic paywall window and returns whether `inactive`
   * was observed during its lifetime and when it happened.
   */
  endHeuristicPaywallSession(): Promise<{
    sawInactiveDuringPaywall?: boolean;
    inactiveAt?: number;
  } | null>;
}

type NativeSignalfoxReactNativeModule = Spec;

const MODULE_NAME = 'SignalfoxReactNative';
let anonymousIdFallback: string | null = null;
const warnedFallbackMethods = new Set<string>();

function warnFallback(methodName: string): void {
  if (
    typeof __DEV__ === 'undefined' ||
    !__DEV__ ||
    warnedFallbackMethods.has(methodName)
  ) {
    return;
  }

  warnedFallbackMethods.add(methodName);
  console.warn(
    `[SignalfoxReactNative] Native module is unavailable; using JS fallback for ${methodName}.`
  );
}

function getPlatformConstant(name: string): unknown {
  const constants = Platform.constants as Record<string, unknown> | undefined;
  return constants?.[name];
}

function createAnonymousIdFallback(): string {
  if (anonymousIdFallback == null) {
    anonymousIdFallback = `signalfox-js-${Date.now().toString(
      36
    )}-${Math.random().toString(36).slice(2, 12)}`;
  }

  return anonymousIdFallback;
}

const fallbackModule: NativeSignalfoxReactNativeModule = {
  getAppVersion(): Promise<string> {
    warnFallback('getAppVersion');
    return Promise.resolve('');
  },

  getAnonymousId(): Promise<string> {
    warnFallback('getAnonymousId');
    return Promise.resolve(createAnonymousIdFallback());
  },

  getDeviceModel(): Promise<string> {
    warnFallback('getDeviceModel');
    const model =
      getPlatformConstant('Model') ??
      getPlatformConstant('model') ??
      getPlatformConstant('DeviceModel');
    return Promise.resolve(typeof model === 'string' ? model : '');
  },

  getOsVersion(): Promise<string> {
    warnFallback('getOsVersion');
    return Promise.resolve(String(Platform.Version ?? ''));
  },

  startNativePurchaseAnalytics(): Promise<void> {
    warnFallback('startNativePurchaseAnalytics');
    return Promise.resolve();
  },

  stopNativePurchaseAnalytics(): Promise<void> {
    warnFallback('stopNativePurchaseAnalytics');
    return Promise.resolve();
  },

  reconcileNativePurchases(): Promise<void> {
    warnFallback('reconcileNativePurchases');
    return Promise.resolve();
  },

  beginHeuristicPaywallSession(): Promise<void> {
    warnFallback('beginHeuristicPaywallSession');
    return Promise.resolve();
  },

  endHeuristicPaywallSession(): Promise<{
    sawInactiveDuringPaywall?: boolean;
    inactiveAt?: number;
  } | null> {
    warnFallback('endHeuristicPaywallSession');
    return Promise.resolve(null);
  },
};

function resolveNativeModule(): NativeSignalfoxReactNativeModule {
  let turboModule: NativeSignalfoxReactNativeModule | null = null;

  try {
    turboModule = TurboModuleRegistry.get<Spec>('SignalfoxReactNative');
  } catch {
    turboModule = null;
  }

  if (turboModule != null) {
    return turboModule;
  }

  const legacyModule = NativeModules[MODULE_NAME] as
    | NativeSignalfoxReactNativeModule
    | null
    | undefined;

  return legacyModule ? { ...fallbackModule, ...legacyModule } : fallbackModule;
}

export default resolveNativeModule();
