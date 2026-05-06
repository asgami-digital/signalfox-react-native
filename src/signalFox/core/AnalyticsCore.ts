/**
 * Core of the auto-analytics system.
 * Manages sessions, event queueing, batch sending, and trackEvent().
 */

import { Platform } from 'react-native';
import SignalfoxReactNative from '../../NativeSignalfoxReactNative';
import type {
  AnalyticsEvent,
  AnalyticsEventType,
  FunnelStepParams,
  SubviewParams,
} from '../types/events';
import type { IAnalyticsCore } from '../types/integration';
import {
  isPermanentHttpSendFailure,
  sendEvents,
  SignalFoxRequestError,
} from '../api/signalFoxApi';
import { EventFamily, getCanonicalTriple } from '../api/canonicalTaxonomy';
import { toBackendEventDto } from '../api/eventMapper';
import {
  computePurchaseTerminalAdjustedTimestamp,
  DEFAULT_BATCH_SIZE,
  DEFAULT_FLUSH_INTERVAL_MS,
  EVENT_SCREEN_RESOLUTION_DELAY_MS,
  isDevApiKey,
  isPurchaseFamilyEventType,
  isPurchaseFlowTerminalEventType,
  NAVIGATION_INTENT_BUFFER_MAX_MS,
  PURCHASE_STARTED_ATTRIBUTION_WINDOW_MS,
  SURFACE_CONTEXT_HISTORY_WINDOW_MS,
  shouldDelayScreenResolution,
} from './constants';
import { getActiveModalId } from './modalStack';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

let cachedNativeAppVersion: string | null = null;
let nativeAppVersionPromise: Promise<string | null> | null = null;
let cachedNativeDeviceModel: string | null = null;
let nativeDeviceModelPromise: Promise<string | null> | null = null;
let cachedNativeOsVersion: string | null = null;
let nativeOsVersionPromise: Promise<string | null> | null = null;

async function getNativeAppVersion(): Promise<string | null> {
  if (cachedNativeAppVersion) return cachedNativeAppVersion;
  if (!nativeAppVersionPromise) {
    nativeAppVersionPromise = SignalfoxReactNative.getAppVersion()
      .then((value) => {
        const version = typeof value === 'string' ? value.trim() : '';
        cachedNativeAppVersion = version.length > 0 ? version : null;
        return cachedNativeAppVersion;
      })
      .catch(() => null);
  }
  return nativeAppVersionPromise;
}

async function getNativeDeviceModel(): Promise<string | null> {
  if (cachedNativeDeviceModel) return cachedNativeDeviceModel;
  if (!nativeDeviceModelPromise) {
    nativeDeviceModelPromise = SignalfoxReactNative.getDeviceModel()
      .then((value) => {
        const model = typeof value === 'string' ? value.trim() : '';
        cachedNativeDeviceModel = model.length > 0 ? model : null;
        return cachedNativeDeviceModel;
      })
      .catch(() => null);
  }
  return nativeDeviceModelPromise;
}

async function getNativeOsVersion(): Promise<string | null> {
  if (cachedNativeOsVersion) return cachedNativeOsVersion;
  if (!nativeOsVersionPromise) {
    nativeOsVersionPromise = SignalfoxReactNative.getOsVersion()
      .then((value) => {
        const version = typeof value === 'string' ? value.trim() : '';
        cachedNativeOsVersion = version.length > 0 ? version : null;
        return cachedNativeOsVersion;
      })
      .catch(() => null);
  }
  return nativeOsVersionPromise;
}

function trimOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

interface PurchaseSurfaceContextSnapshot {
  screenName: string | null;
  parentModal: string | null;
  productId: string | null;
  startedAt: number;
  firstInterveningAt: number | null;
}

interface SurfaceContextSnapshot {
  screenName: string | null;
  parentModal: string | null;
  timestamp: number;
}

class PurchaseFlowTracker {
  private pendingFlow: PurchaseSurfaceContextSnapshot | null = null;
  private readonly recentFlows: PurchaseSurfaceContextSnapshot[] = [];

  start(flow: PurchaseSurfaceContextSnapshot): void {
    this.pendingFlow = flow;
    this.recentFlows.push(flow);
    this.prune(flow.startedAt);
  }

  markIntervening(timestamp: number): void {
    if (this.pendingFlow && this.pendingFlow.firstInterveningAt === null) {
      this.pendingFlow.firstInterveningAt = timestamp;
    }
  }

  resolveTerminal(
    eventTimestamp: number,
    productId: string | null
  ): PurchaseSurfaceContextSnapshot | null {
    this.prune(eventTimestamp);

    if (
      this.pendingFlow &&
      (productId == null ||
        this.pendingFlow.productId == null ||
        this.pendingFlow.productId === productId)
    ) {
      return this.pendingFlow;
    }

    if (productId == null) {
      return null;
    }

    for (let i = this.recentFlows.length - 1; i >= 0; i--) {
      const candidate = this.recentFlows[i];
      if (candidate?.productId === productId) {
        return candidate;
      }
    }

    return null;
  }

  adjustedTerminalTimestamp(
    flow: PurchaseSurfaceContextSnapshot | null,
    terminalTimestamp: number
  ): number {
    if (!flow || flow.firstInterveningAt === null) {
      return terminalTimestamp;
    }
    return computePurchaseTerminalAdjustedTimestamp(
      flow.startedAt,
      flow.firstInterveningAt
    );
  }

  completeTerminal(productId: string | null): void {
    if (
      this.pendingFlow == null ||
      productId == null ||
      this.pendingFlow.productId == null ||
      this.pendingFlow.productId === productId
    ) {
      this.pendingFlow = null;
    }
  }

  reset(): void {
    this.pendingFlow = null;
    this.recentFlows.splice(0, this.recentFlows.length);
  }

  private prune(referenceTs: number): void {
    while (this.recentFlows.length > 0) {
      const first = this.recentFlows[0];
      if (!first) {
        break;
      }
      if (
        referenceTs - first.startedAt <=
        PURCHASE_STARTED_ATTRIBUTION_WINDOW_MS
      ) {
        break;
      }
      this.recentFlows.shift();
    }
  }
}

function nullIfEmptySignalFoxId(value: string | null): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function humanizeEventType(type: string): string {
  return type
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildGenericSignalFoxId(params: {
  family: EventFamily;
  screenName: string | null;
  eventType: string;
  explicitSignalFoxId: string | null;
  stepName: string | null;
}): string | null {
  const { family, screenName, eventType, explicitSignalFoxId, stepName } =
    params;

  if (
    explicitSignalFoxId &&
    typeof explicitSignalFoxId === 'string' &&
    explicitSignalFoxId.trim().length > 0
  ) {
    return explicitSignalFoxId.trim();
  }

  if (family === EventFamily.Screen) {
    return trimOptionalString(screenName) ?? 'none';
  }

  if (family === EventFamily.Lifecycle || family === EventFamily.Purchase) {
    return trimOptionalString(eventType) ?? 'unknown';
  }

  if (family === EventFamily.Flow) {
    return trimOptionalString(stepName) ?? 'unknown';
  }

  return null;
}

function buildGenericDisplayName(params: {
  eventType: AnalyticsEventType;
  screenName: string | null;
  payload: Record<string, unknown>;
  fallbackId: string | null;
  customEventName: string | null;
}): string {
  const { eventType, screenName, payload, fallbackId, customEventName } =
    params;
  const payloadDisplay = trimOptionalString(payload.analyticsDisplayName);
  if (payloadDisplay) {
    return payloadDisplay;
  }

  const namedModal =
    trimOptionalString(payload.paywall_name) ??
    trimOptionalString(payload.modalName) ??
    fallbackId;

  switch (eventType) {
    case 'app_open':
      return 'App opened';
    case 'app_foreground':
      return 'App entered foreground';
    case 'app_background':
      return 'App entered background';
    case 'session_start':
      return 'Session started';
    case 'session_end':
      return 'Session ended';
    case 'screen_view':
      return screenName ?? 'none';
    case 'modal_open':
      return namedModal ?? fallbackId ?? 'none';
    case 'modal_close':
      return namedModal ?? fallbackId ?? 'none';
    case 'custom': {
      return customEventName ?? 'Custom event';
    }
    default:
      return fallbackId ?? humanizeEventType(eventType);
  }
}

function usesExplicitUiIdentifiersOnly(eventType: AnalyticsEventType): boolean {
  return (
    eventType === 'modal_open' ||
    eventType === 'modal_close' ||
    eventType === 'component_press'
  );
}

export interface AnalyticsCoreConfig {
  apiKey: string;
  batchSize?: number;
  flushIntervalMs?: number;
  logOnly?: boolean;
}

type QueuedEvent = AnalyticsEvent;

export class AnalyticsCore implements IAnalyticsCore {
  private readonly apiKey: string;
  private appVersion: string;
  private deviceModel: string | null = null;
  private osVersion: string | null = null;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly logOnly: boolean;
  /** Con API key de dev (`ak_dev__`) cada evento dispara flush en cuanto entra en la cola. */
  private readonly immediateFlush: boolean;

  private anonymousId: string;
  private sessionId: string | null = null;
  private engagementSessionId: string | null = null;
  private currentScreenName: string | null = null;
  private readonly queue: QueuedEvent[] = [];
  /**
   * Chains send passes so there are never two concurrent `flush` operations
   * (p. ej. `scheduleFlush` + `await flush()`), incluso durante lecturas nativas async.
   */
  private flushPassChain: Promise<void> = Promise.resolve();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  /** After an irreversible 4xx (for example, invalid API key): no more network or queueing. */
  private sendPermanentlyDisabled = false;

  /** `__unsafe_action__` without `state` yet: events (except screen_view) wait for screen resolution. */
  private navigationIntentPendingSinceMs: number | null = null;
  private navigationIntentTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly navigationIntentBuffer: Array<
    { type: AnalyticsEventType } & Record<string, unknown>
  > = [];
  private navigationIntentTimeoutListener: (() => void) | null = null;

  private readonly purchaseFlow = new PurchaseFlowTracker();
  private readonly surfaceContextHistory: SurfaceContextSnapshot[] = [];

  constructor(config: AnalyticsCoreConfig) {
    this.apiKey = config.apiKey;
    this.appVersion = '0.0.0';
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.logOnly = config.logOnly ?? false;
    this.immediateFlush = isDevApiKey(config.apiKey);
    this.anonymousId = generateId();
  }

  /**
   * App version, model, and OS from native (promises cached at module level).
   * Convoca antes de transportar o al iniciar el core para no etiquetar eventos con `0.0.0`.
   */
  private async refreshTransportMetadataFromNative(): Promise<void> {
    try {
      const nativeAppVersion = await getNativeAppVersion();
      if (nativeAppVersion) {
        this.appVersion = nativeAppVersion;
      }
    } catch (error) {
      console.warn(
        '[AUTO_ANALYTICS] Failed to read native app version. Using fallback value.',
        error
      );
    }

    try {
      const nativeDeviceModel = await getNativeDeviceModel();
      if (nativeDeviceModel) {
        this.deviceModel = nativeDeviceModel;
      }
    } catch (error) {
      console.warn(
        '[AUTO_ANALYTICS] Failed to read native device model.',
        error
      );
    }

    try {
      const nativeOsVersion = await getNativeOsVersion();
      if (nativeOsVersion) {
        this.osVersion = nativeOsVersion;
      }
    } catch (error) {
      console.warn('[AUTO_ANALYTICS] Failed to read native os version.', error);
    }
  }

  /**
   * Optional async initialization to hydrate anonymousId from native.
   * If native fails, it keeps the in-memory fallback without breaking the flow.
   */
  async init(): Promise<void> {
    await this.refreshTransportMetadataFromNative();

    try {
      const nativeAnonymousId = await SignalfoxReactNative.getAnonymousId();
      if (
        typeof nativeAnonymousId === 'string' &&
        nativeAnonymousId.length > 0
      ) {
        this.anonymousId = nativeAnonymousId;
      }
    } catch (error) {
      console.warn(
        '[AUTO_ANALYTICS] Failed to read native anonymousId. Using memory fallback.',
        error
      );
    }
  }

  identify(userId: string): void {
    this.anonymousId = userId;
  }

  startSession(): void {
    this.sessionId = generateId();
    this.engagementSessionId = generateId();
  }

  endSession(): void {
    this.sessionId = null;
    this.engagementSessionId = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  renewEngagementSession(): void {
    this.engagementSessionId = generateId();
  }

  getEngagementSessionId(): string | null {
    return this.engagementSessionId;
  }

  markNavigationIntentPending(): void {
    // Hard retention cap: if there is already a pending intent, do not extend the timeout.
    // Prevents bursts of actions (__unsafe_action__) from keeping events retained
    // indefinitely (for example, funnel step / flow_step_view on the first screen).
    if (this.navigationIntentPendingSinceMs !== null) {
      return;
    }
    const marker = Date.now();
    this.navigationIntentPendingSinceMs = marker;
    if (this.navigationIntentTimer) {
      clearTimeout(this.navigationIntentTimer);
      this.navigationIntentTimer = null;
    }
    this.navigationIntentTimer = setTimeout(() => {
      this.navigationIntentTimer = null;
      if (this.navigationIntentPendingSinceMs !== marker) {
        return;
      }
      this.navigationIntentPendingSinceMs = null;
      this.navigationIntentTimeoutListener?.();
      this.flushNavigationIntentBuffer();
    }, NAVIGATION_INTENT_BUFFER_MAX_MS);
  }

  clearNavigationIntentPending(): void {
    if (this.navigationIntentTimer) {
      clearTimeout(this.navigationIntentTimer);
      this.navigationIntentTimer = null;
    }
    this.navigationIntentPendingSinceMs = null;
    this.flushNavigationIntentBuffer();
  }

  setNavigationIntentTimeoutListener(listener: (() => void) | null): void {
    this.navigationIntentTimeoutListener =
      typeof listener === 'function' ? listener : null;
  }

  private flushNavigationIntentBuffer(): void {
    while (this.navigationIntentBuffer.length > 0) {
      const ev = this.navigationIntentBuffer.shift()!;
      this.processEvent(ev);
    }
    // If the buffer released events and they do not reach the batch size, still try to send them.
    if (this.queue.length > 0 && !this.sendPermanentlyDisabled) {
      this.scheduleFlush();
    }
  }

  private pickOptionalString(value: unknown): string | null {
    return trimOptionalString(value);
  }

  private parentModalSnapshotFromPayload(
    payload: Record<string, unknown>
  ): string | null {
    if (!Object.prototype.hasOwnProperty.call(payload, 'parent_modal')) {
      return null;
    }
    return trimOptionalString(payload.parent_modal);
  }

  private purchaseProductIdFromEvent(
    event: { type: AnalyticsEventType } & Record<string, unknown>
  ): string | null {
    const direct = this.pickOptionalString(
      (event as { productId?: unknown }).productId
    );
    if (direct) return direct;
    const payload =
      event.payload && typeof event.payload === 'object'
        ? (event.payload as Record<string, unknown>)
        : null;
    return this.pickOptionalString(payload?.productId);
  }

  private resolveScreenName(
    event: { type: AnalyticsEventType } & Record<string, unknown>,
    historicalSurface: SurfaceContextSnapshot | null = null
  ): string | null {
    const direct = this.pickOptionalString(event.screen_name);
    const payload =
      event.payload && typeof event.payload === 'object'
        ? (event.payload as Record<string, unknown>)
        : null;
    const payloadScreen =
      this.pickOptionalString(payload?.screen_name) ??
      this.pickOptionalString(payload?.screenName);
    const payloadCurrentScreen = this.pickOptionalString(
      payload?.currentScreen
    );
    const payloadPreviousScreen =
      this.pickOptionalString(payload?.previous_screen_name) ??
      this.pickOptionalString(payload?.previousScreen);

    if (event.type === 'modal_open') {
      return (
        payloadPreviousScreen ??
        direct ??
        payloadScreen ??
        payloadCurrentScreen ??
        historicalSurface?.screenName ??
        this.currentScreenName
      );
    }

    if (event.type === 'modal_close') {
      return (
        payloadCurrentScreen ??
        direct ??
        payloadScreen ??
        payloadPreviousScreen ??
        historicalSurface?.screenName ??
        this.currentScreenName
      );
    }

    if (event.type === 'screen_view') {
      return payloadScreen ?? direct ?? this.currentScreenName;
    }

    return (
      direct ??
      payloadScreen ??
      payloadCurrentScreen ??
      payloadPreviousScreen ??
      historicalSurface?.screenName ??
      this.currentScreenName ??
      null
    );
  }

  private resolveSurfaceContextAt(
    eventTimestamp: number
  ): SurfaceContextSnapshot | null {
    let best: SurfaceContextSnapshot | null = null;
    for (const candidate of this.surfaceContextHistory) {
      if (candidate.timestamp <= eventTimestamp) {
        if (!best || candidate.timestamp >= best.timestamp) {
          best = candidate;
        }
      }
    }
    return best;
  }

  private rememberSurfaceContext(snapshot: SurfaceContextSnapshot): void {
    this.surfaceContextHistory.push(snapshot);
    this.surfaceContextHistory.sort((a, b) => a.timestamp - b.timestamp);

    const minTimestamp = snapshot.timestamp - SURFACE_CONTEXT_HISTORY_WINDOW_MS;
    while (
      this.surfaceContextHistory.length > 0 &&
      this.surfaceContextHistory[0]!.timestamp < minTimestamp
    ) {
      this.surfaceContextHistory.shift();
    }
  }

  private processEvent(
    event: { type: AnalyticsEventType } & Record<string, unknown>
  ): void {
    if (this.sendPermanentlyDisabled) {
      if (isPurchaseFamilyEventType(event.type)) {
        console.warn(
          '[AUTO_ANALYTICS] purchase event dropped (transport disabled)',
          { type: event.type }
        );
      }
      return;
    }

    // Por defecto: momento en que el evento se materializa en la cola (tras el delay
    // for screen resolution if applicable). Integrations can set `timestamp`
    // (ms desde epoch) en el objeto pasado a trackEvent para anclar el instante real.
    const explicitTs = (event as { timestamp?: unknown }).timestamp;
    let eventTimestamp =
      typeof explicitTs === 'number' &&
      Number.isFinite(explicitTs) &&
      explicitTs > 0
        ? explicitTs
        : Date.now();

    const eventType = event.type;
    const terminalProductId = isPurchaseFlowTerminalEventType(eventType)
      ? this.purchaseProductIdFromEvent(event)
      : null;
    const terminalSurfaceContext = isPurchaseFlowTerminalEventType(eventType)
      ? this.purchaseFlow.resolveTerminal(eventTimestamp, terminalProductId)
      : null;

    if (
      isPurchaseFlowTerminalEventType(eventType) &&
      terminalSurfaceContext == null
    ) {
      console.warn(
        '[AUTO_ANALYTICS] purchase terminal dropped (no matching purchase_started)',
        {
          type: eventType,
          productId: terminalProductId,
        }
      );
      return;
    }

    if (isPurchaseFlowTerminalEventType(eventType)) {
      eventTimestamp = this.purchaseFlow.adjustedTerminalTimestamp(
        terminalSurfaceContext,
        eventTimestamp
      );
    } else if (
      eventType !== 'purchase_started' &&
      !isPurchaseFlowTerminalEventType(eventType)
    ) {
      this.purchaseFlow.markIntervening(eventTimestamp);
    }

    // We always attach the "parent" modal (last opened) to link UI hierarchies.
    // `reactNativeModalPatch` se encarga de mantener el stack y de que `modal_close`
    // use the previous modal (stack after the pop).
    const historicalSurface = this.resolveSurfaceContextAt(eventTimestamp);
    const parentModal = historicalSurface?.parentModal ?? getActiveModalId();
    const maybePayload = (event as { payload?: unknown }).payload;
    const nextPayload: Record<string, unknown> =
      maybePayload &&
      typeof maybePayload === 'object' &&
      !Array.isArray(maybePayload)
        ? (maybePayload as Record<string, unknown>)
        : {};

    // If an integration already calculated `parent_modal`, do not overwrite it.
    // Esto es importante en acciones "close" donde el stack puede cambiar
    // immediately after the event.
    if (typeof nextPayload.parent_modal === 'undefined') {
      nextPayload.parent_modal = parentModal;
    }

    const applyPurchaseTerminalSurface = terminalSurfaceContext != null;

    if (applyPurchaseTerminalSurface) {
      const snap = terminalSurfaceContext!;
      nextPayload.parent_modal = snap.parentModal;
    }

    (event as { payload?: unknown }).payload = nextPayload;

    const resolvedScreenName = applyPurchaseTerminalSurface
      ? terminalSurfaceContext!.screenName
      : this.resolveScreenName(event, historicalSurface);

    if (eventType === 'purchase_started') {
      const surfaceContext: PurchaseSurfaceContextSnapshot = {
        screenName: resolvedScreenName,
        parentModal: this.parentModalSnapshotFromPayload(nextPayload),
        productId: this.purchaseProductIdFromEvent(event),
        startedAt: eventTimestamp,
        firstInterveningAt: null,
      };
      this.purchaseFlow.start(surfaceContext);
    }

    if (isPurchaseFlowTerminalEventType(eventType)) {
      this.purchaseFlow.completeTerminal(terminalProductId);
    }
    const family = getCanonicalTriple(event.type).event_family;
    const explicitSignalFoxId =
      this.pickOptionalString(
        (event as { signalFoxNodeId?: unknown }).signalFoxNodeId
      ) ??
      this.pickOptionalString(
        (event as { signalFoxId?: unknown }).signalFoxId
      ) ??
      this.pickOptionalString((event as { target_id?: unknown }).target_id);
    const explicitSignalFoxDisplayName =
      this.pickOptionalString(
        (event as { signalFoxNodeDisplayName?: unknown }).signalFoxNodeDisplayName
      ) ??
      this.pickOptionalString(
        (event as { signalFoxDisplayName?: unknown }).signalFoxDisplayName
      ) ??
      this.pickOptionalString((event as { target_name?: unknown }).target_name);
    const usesOnlyExplicitIdentifiers = usesExplicitUiIdentifiersOnly(
      event.type
    );
    const signalFoxNodeIdComputed =
      explicitSignalFoxId ??
      (usesOnlyExplicitIdentifiers
        ? null
        : buildGenericSignalFoxId({
            family,
            screenName: resolvedScreenName,
            eventType: event.type,
            explicitSignalFoxId,
            stepName: this.pickOptionalString(
              (event as { step_name?: unknown }).step_name
            ),
          }));
    const signalFoxNodeId = nullIfEmptySignalFoxId(signalFoxNodeIdComputed);
    const signalFoxNodeDisplayName =
      explicitSignalFoxDisplayName ??
      (usesOnlyExplicitIdentifiers
        ? signalFoxNodeId
        : buildGenericDisplayName({
            eventType: event.type,
            screenName: resolvedScreenName,
            payload: nextPayload,
            fallbackId: signalFoxNodeId,
            customEventName: this.pickOptionalString(
              (event as { custom_event_name?: unknown }).custom_event_name
            ),
          }));

    const fullEvent: AnalyticsEvent = {
      ...event,
      type: event.type as AnalyticsEvent['type'],
      timestamp: eventTimestamp,
      session_id: this.sessionId ?? '',
      engagement_session_id: this.engagementSessionId ?? '',
      anonymous_id: this.anonymousId,
      platform: Platform.OS as 'ios' | 'android',
      app_version: this.appVersion,
      device_model: this.deviceModel,
      os_version: this.osVersion,
      // Network contract: backend expects signalFoxId/signalFoxDisplayName.
      signalFoxId: signalFoxNodeId,
      signalFoxDisplayName: signalFoxNodeDisplayName,
      ...(resolvedScreenName ? { screen_name: resolvedScreenName } : {}),
    } as AnalyticsEvent;

    if (
      resolvedScreenName &&
      !applyPurchaseTerminalSurface &&
      (eventType === 'screen_view' || historicalSurface == null)
    ) {
      this.currentScreenName = resolvedScreenName;
    }

    if (eventType === 'screen_view' || eventType === 'modal_open') {
      this.rememberSurfaceContext({
        screenName: resolvedScreenName,
        parentModal: getActiveModalId(),
        timestamp: eventTimestamp,
      });
    }

    this.queue.push(fullEvent);

    if (this.logOnly) {
      console.log('[AUTO_ANALYTICS]', fullEvent);
    }

    if (this.immediateFlush) {
      this.scheduleFlush();
    } else {
      if (this.queue.length >= this.batchSize) {
        this.scheduleFlush();
      }

      if (event.type === 'app_background') {
        this.scheduleFlush();
      }
    }
  }

  /** Automatic events (integrations). */
  trackEvent(
    event: { type: AnalyticsEventType } & Record<string, unknown>
  ): void {
    const bypassNavigationIntentBuffer =
      isPurchaseFamilyEventType(event.type) ||
      event.type === 'screen_view' ||
      event.type === 'modal_open' ||
      event.type === 'modal_close' ||
      event.type === 'app_open' ||
      event.type === 'app_foreground' ||
      event.type === 'app_background' ||
      event.type === 'session_start' ||
      event.type === 'session_end';

    if (
      this.navigationIntentPendingSinceMs !== null &&
      !bypassNavigationIntentBuffer
    ) {
      this.navigationIntentBuffer.push(event);
      return;
    }

    if (
      shouldDelayScreenResolution(event.type) &&
      EVENT_SCREEN_RESOLUTION_DELAY_MS > 0
    ) {
      setTimeout(() => {
        this.processEvent(event);
      }, EVENT_SCREEN_RESOLUTION_DELAY_MS);
      return;
    }

    this.processEvent(event);
  }

  /**
   * Evento custom libre (event_name=custom en backend).
   */
  track(name: string, properties?: Record<string, unknown>): void {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n) {
      console.warn('[AUTO_ANALYTICS] track() requires a non-empty name');
      return;
    }
    this.trackEvent({
      type: 'custom',
      custom_event_name: n,
      payload: properties ?? {},
    });
  }

  /** @deprecated Usa track() */
  sendEvent(name: string, properties: Record<string, unknown>): void {
    this.track(name, properties);
  }

  trackFunnelStep(params: FunnelStepParams): void {
    const funnelName =
      typeof params.funnelName === 'string' ? params.funnelName.trim() : '';
    const step =
      typeof params.signalFoxNodeId === 'string'
        ? params.signalFoxNodeId.trim()
        : '';
    const stepDisplayName =
      typeof params.signalFoxNodeDisplayName === 'string'
        ? params.signalFoxNodeDisplayName.trim()
        : '';
    if (!funnelName || !step) {
      console.warn(
        '[AUTO_ANALYTICS] trackFunnelStep requires non-empty funnelName and signalFoxNodeId'
      );
      return;
    }

    const ev: Record<string, unknown> = {
      type: 'flow_step_view',
      flow_name: funnelName,
      signalFoxNodeId: step,
      ...(stepDisplayName ? { signalFoxNodeDisplayName: stepDisplayName } : {}),
      step_name: step,
      payload: {},
    };
    if (
      typeof params.stepIndex === 'number' &&
      Number.isFinite(params.stepIndex)
    ) {
      ev.step_index = params.stepIndex;
    }

    this.trackEvent(
      ev as { type: AnalyticsEventType } & Record<string, unknown>
    );
  }

  /**
   * Semantic event: internal subview within a screen.
   * It does not replace trackFunnelStep (linear funnels), but rather active screen subareas.
   */
  trackSubview(params: SubviewParams): void {
    const subviewName =
      typeof params.signalFoxNodeId === 'string'
        ? params.signalFoxNodeId.trim()
        : '';
    const subviewDisplayName =
      typeof params.signalFoxNodeDisplayName === 'string'
        ? params.signalFoxNodeDisplayName.trim()
        : '';

    if (!subviewName) {
      console.warn(
        '[AUTO_ANALYTICS] trackSubview requires a non-empty signalFoxNodeId'
      );
      return;
    }

    this.trackEvent({
      type: 'subview_view',
      signalFoxNodeId: subviewName,
      ...(subviewDisplayName
        ? { signalFoxNodeDisplayName: subviewDisplayName }
        : {}),
      target_type: 'subview',
      flow_name: null,
      step_name: null,
      step_index: null,
      payload: {},
    });
  }

  /** Background send; errors are already recorded in `sendBatch` / `sendEvents`. */
  private scheduleFlush(): void {
    this.flush().catch(() => {
      /* fire-and-forget */
    });
  }

  async flush(): Promise<void> {
    const run = () => this.performFlushPass();
    const job = this.flushPassChain.then(run);
    this.flushPassChain = job.catch(() => {});
    await job;
  }

  private async performFlushPass(): Promise<void> {
    if (this.sendPermanentlyDisabled) return;
    if (this.queue.length === 0) return;

    if (this.logOnly) {
      this.queue.splice(0, this.queue.length);
      return;
    }

    await this.refreshTransportMetadataFromNative();

    while (this.queue.length > 0) {
      const batch = this.queue.slice(0, this.batchSize);
      if (!batch.length) break;

      const sent = await this.sendBatch(batch);
      if (!sent) break;

      this.queue.splice(0, batch.length);
    }

    if (
      this.immediateFlush &&
      this.queue.length > 0 &&
      !this.sendPermanentlyDisabled
    ) {
      this.scheduleFlush();
    }
  }

  private mergeLatestTransportFields(event: QueuedEvent): AnalyticsEvent {
    return {
      ...event,
      app_version: this.appVersion,
      device_model: this.deviceModel ?? event.device_model,
      os_version: this.osVersion ?? event.os_version ?? null,
    } as AnalyticsEvent;
  }

  private async sendBatch(events: QueuedEvent[]): Promise<boolean> {
    try {
      if (!events.length) return true;
      const dtoEvents = events.map((e) =>
        toBackendEventDto(this.mergeLatestTransportFields(e))
      );
      await sendEvents({
        apiKey: this.apiKey,
        events: dtoEvents,
      });

      console.log(`[AUTO_ANALYTICS] Sent batch (${events.length})`);
      return true;
    } catch (e) {
      if (
        e instanceof SignalFoxRequestError &&
        isPermanentHttpSendFailure(e.status)
      ) {
        this.disableSendingPermanently(e.status, e);
        return false;
      }
      console.warn(
        '[AUTO_ANALYTICS] Failed to send batch, keeping events in queue',
        e
      );
      return false;
    }
  }

  private disableSendingPermanently(status: number, cause: unknown): void {
    if (this.sendPermanentlyDisabled) {
      return;
    }
    this.sendPermanentlyDisabled = true;
    const dropped = this.queue.length;
    this.queue.splice(0, this.queue.length);
    this.stopFlushTimer();
    console.warn(
      `[AUTO_ANALYTICS] Transport disabled after HTTP ${status}; dropped ${dropped} queued event(s). Further analytics will not be sent until a new AnalyticsCore is created.`,
      cause
    );
  }

  startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.scheduleFlush();
    }, this.flushIntervalMs);
  }

  stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  destroy(): void {
    this.stopFlushTimer();
    this.clearNavigationIntentPending();
    this.purchaseFlow.reset();
    this.surfaceContextHistory.splice(0, this.surfaceContextHistory.length);
    this.scheduleFlush();
  }
}
