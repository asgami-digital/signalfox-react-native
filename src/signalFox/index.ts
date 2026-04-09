/**
 * Auto Analytics – captura automática de eventos (AppState, navegación, compras).
 * Ver docs/auto-analytics-experiment.md
 */

export { AnalyticsCore } from './core';
export type { AnalyticsCoreConfig } from './core';
export {
  appStateIntegration,
  reactNativeModalPatchIntegration,
  reactNativeTouchablePatchIntegration,
  reactNavigationIntegration,
  nativePurchaseIntegration,
  revenueCatIntegration,
  resolveRevenueCatPurchasesExport,
  REVENUECAT_ANALYTICS_INTEGRATION_NAME,
  applyModalPatch,
  applyTouchablePatch,
} from './integrations';
export type { RevenueCatIntegrationOptions } from './integrations';
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
  reconcileNativePurchaseState,
  startListeningToNativePurchaseEvents,
  stopListeningToNativePurchaseEvents,
  notifyPurchaseStarted,
  notifyPurchaseCancelled,
  notifyPurchaseCompleted,
  notifyPurchaseFailed,
  notifyRestoreCompleted,
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
