import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;
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

export default TurboModuleRegistry.getEnforcing<Spec>('SignalfoxReactNative');
