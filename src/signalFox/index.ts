/**
 * Auto Analytics - automatic event capture (AppState, navigation, purchases).
 * Ver docs/auto-analytics-experiment.md
 */

export { AnalyticsCore } from './core';
export type { AnalyticsCoreConfig } from './core';
export {
  reactNavigationIntegration,
  expoRouterIntegration,
  EXPO_ROUTER_INTEGRATION_NAME,
  reactNativeIapIntegration,
  applyReactNativeIapPatch,
  REACT_NATIVE_IAP_ANALYTICS_INTEGRATION_NAME,
  revenueCatIntegration,
  resolveRevenueCatPurchasesExport,
  REVENUECAT_ANALYTICS_INTEGRATION_NAME,
  applyModalPatch,
  applyTouchablePatch,
} from './integrations';
export type {
  RevenueCatIntegrationOptions,
  ExpoRouterIntegrationOptions,
  ReactNativeIapIntegrationOptions,
} from './integrations';
export { SignalFoxProvider, useSignalFox } from './provider';
export type { SignalFoxProviderProps, SignalFoxContextValue } from './provider';
export type {
  AnalyticsEvent,
  AnalyticsEventType,
  AnalyticsIntegration,
  AnalyticsIntegrationSetupContext,
  FlowStepParams,
  SubviewParams,
  IAnalyticsCore,
} from './types';
export { EventFamily, getCanonicalTriple } from './api/canonicalTaxonomy';
export { getActiveRouteName } from './utils/getActiveRouteName';
export {
  getActiveRouteInfo,
  isRoutePresentedAsModal,
} from './utils/getActiveRouteInfo';

export {
  registerPurchaseAnalyticsCore,
  unregisterPurchaseAnalyticsCore,
  notifyPurchaseStarted,
  notifyPurchaseCancelled,
  notifyPurchaseCompleted,
  notifyPurchaseFailed,
  notifyRestoreCompleted,
  notifyModalOpened,
  notifyModalClosed,
} from './purchase/purchaseAnalyticsBridge';

export {
  reconcileNativePurchaseState,
  startListeningToNativePurchaseEvents,
  stopListeningToNativePurchaseEvents,
} from './purchase/nativePurchaseEventBridge';

export type {
  PurchaseAnalyticsEventName,
  NativePurchaseEventPayload,
  NormalizedPurchaseAnalyticsEvent,
  PurchaseEnvironment,
  PurchasePlatform,
  PurchaseProductType,
  PurchaseStore,
} from './purchase/purchaseEventTypes';
