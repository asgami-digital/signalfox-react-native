/**
 * Auto Analytics - automatic event capture (AppState, navigation, purchases).
 * Ver docs/auto-analytics-experiment.md
 */

export {
  reactNavigationIntegration,
  expoRouterIntegration,
  EXPO_ROUTER_INTEGRATION_NAME,
  reactNativeIapIntegration,
  REACT_NATIVE_IAP_ANALYTICS_INTEGRATION_NAME,
  revenueCatIntegration,
  REVENUECAT_ANALYTICS_INTEGRATION_NAME,
  applyModalPatch,
  applyTouchablePatch,
} from './integrations';
export type {
  RevenueCatIntegrationOptions,
  ExpoRouterIntegrationOptions,
  ReactNativeIapIntegrationOptions,
} from './integrations';
export {
  SignalFox,
  init,
  destroy,
  trackFunnelStep,
  trackSubview,
  trackModalShown,
} from './runtime';
export type { SignalFoxInitOptions, SignalFoxApi } from './runtime';
export type {
  AnalyticsEvent,
  AnalyticsEventType,
  AnalyticsIntegration,
  AnalyticsIntegrationSetupContext,
  FunnelStepParams,
  SubviewParams,
} from './types';

export {
  registerPurchaseAnalyticsCore,
  unregisterPurchaseAnalyticsCore,
  notifyPurchaseStarted,
  notifyPurchaseCancelled,
  notifyPurchaseCompleted,
  notifyPurchaseFailed,
  notifyRestoreCompleted,
} from './purchase/purchaseAnalyticsBridge';

export type {
  PurchaseAnalyticsEventName,
  NativePurchaseEventPayload,
  NormalizedPurchaseAnalyticsEvent,
  PurchaseEnvironment,
  PurchasePlatform,
  PurchaseProductType,
  PurchaseStore,
} from './purchase/purchaseEventTypes';
export type { TrackModalShownParams } from './purchase/purchaseAnalyticsBridge';
