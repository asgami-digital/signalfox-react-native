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
  applyModalPatch,
  applyTouchablePatch,
} from './integrations';
export { SignalFoxProvider, useSignalFox } from './provider';
export type { SignalFoxProviderProps, SignalFoxContextValue } from './provider';
export type {
  AnalyticsEvent,
  AnalyticsEventType,
  AnalyticsIntegration,
  FlowStepParams,
  SubviewParams,
  IAnalyticsCore,
} from './types';
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
