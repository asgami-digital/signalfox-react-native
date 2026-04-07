/**
 * Núcleo del sistema de auto-analytics.
 * Gestiona sesiones, cola de eventos, envío en batch y trackEvent().
 */

import { Platform } from 'react-native';
import SignalfoxReactNative from '../../NativeSignalfoxReactNative';
import type {
  AnalyticsEvent,
  AnalyticsEventType,
  FlowStepParams,
  SubviewParams,
} from '../types/events';
import type { IAnalyticsCore } from '../types/integration';
import {
  isPermanentHttpSendFailure,
  sendEvents,
  SignalFoxRequestError,
} from '../api/signalFoxApi';
import { getCanonicalTriple } from '../api/canonicalTaxonomy';
import { toBackendEventDto } from '../api/eventMapper';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_FLUSH_INTERVAL_MS,
  EVENT_SCREEN_RESOLUTION_DELAY_MS,
  isDevApiKey,
  isPurchaseFamilyEventType,
  NAVIGATION_INTENT_BUFFER_MAX_MS,
  shouldDelayScreenResolution,
} from './constants';
import { getActiveModalId } from './modalStack';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

let cachedNativeAppVersion: string | null = null;
let nativeAppVersionPromise: Promise<string | null> | null = null;

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

function trimOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function humanizeEventType(type: string): string {
  return type
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildGenericSignalFoxId(params: {
  family: string;
  screenName: string | null;
  parentModal: string | null;
  eventType: string;
}): string {
  const { family, screenName, parentModal, eventType } = params;
  return [
    family,
    screenName ?? 'unknown',
    parentModal ?? 'none',
    eventType,
  ].join('|');
}

function buildGenericDisplayName(params: {
  eventType: AnalyticsEventType;
  screenName: string | null;
  payload: Record<string, unknown>;
  fallbackId: string | null;
  customEventName: string | null;
}): string {
  const { eventType, screenName, payload, fallbackId, customEventName } = params;
  const payloadDisplay = trimOptionalString(payload.analyticsDisplayName);
  if (payloadDisplay) {
    return payloadDisplay;
  }

  const namedModal =
    trimOptionalString(payload.paywall_name) ?? trimOptionalString(payload.modalName);

  switch (eventType) {
    case 'app_open':
      return 'Aplicacion abierta';
    case 'app_foreground':
      return 'Aplicacion en primer plano';
    case 'app_background':
      return 'Aplicacion en segundo plano';
    case 'session_start':
      return 'Sesion iniciada';
    case 'session_end':
      return 'Sesion finalizada';
    case 'screen_view':
      return screenName ? `Pantalla vista: ${screenName}` : 'Pantalla vista';
    case 'modal_open':
      return namedModal ? `Modal abierto: ${namedModal}` : 'Modal abierto';
    case 'modal_close':
      return namedModal ? `Modal cerrado: ${namedModal}` : 'Modal cerrado';
    case 'custom': {
      return customEventName ? `Evento custom: ${customEventName}` : 'Evento custom';
    }
    default:
      return fallbackId ?? humanizeEventType(eventType);
  }
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
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly logOnly: boolean;
  /** Con API key de dev (`ak_dev__`) cada evento dispara flush en cuanto entra en la cola. */
  private readonly immediateFlush: boolean;

  private anonymousId: string;
  private sessionId: string | null = null;
  private currentScreenName: string | null = null;
  private readonly queue: QueuedEvent[] = [];
  private isFlushing = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  /** Tras un 4xx irreversible (p. ej. API key inválida): no más red ni cola. */
  private sendPermanentlyDisabled = false;

  /** `__unsafe_action__` sin `state` aún: eventos (≠ screen_view) esperan resolución de pantalla. */
  private navigationIntentPendingSinceMs: number | null = null;
  private navigationIntentTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly navigationIntentBuffer: Array<
    { type: AnalyticsEventType } & Record<string, unknown>
  > = [];
  private navigationIntentTimeoutListener: (() => void) | null = null;

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
   * Inicialización asíncrona opcional para hidratar anonymousId desde nativo.
   * Si nativo falla, mantiene fallback en memoria sin romper el flujo.
   */
  async init(): Promise<void> {
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
  }

  endSession(): void {
    this.sessionId = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  markNavigationIntentPending(): void {
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
  }

  private pickOptionalString(value: unknown): string | null {
    return trimOptionalString(value);
  }

  private resolveScreenName(
    event: { type: AnalyticsEventType } & Record<string, unknown>
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
        this.currentScreenName
      );
    }

    if (event.type === 'modal_close') {
      return (
        payloadCurrentScreen ??
        direct ??
        payloadScreen ??
        payloadPreviousScreen ??
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
      this.currentScreenName
    );
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
    // de resolución de pantalla si aplica). Las integraciones pueden fijar `timestamp`
    // (ms desde epoch) en el objeto pasado a trackEvent para anclar el instante real.
    const explicitTs = (event as { timestamp?: unknown }).timestamp;
    const eventTimestamp =
      typeof explicitTs === 'number' &&
      Number.isFinite(explicitTs) &&
      explicitTs > 0
        ? explicitTs
        : Date.now();

    // Siempre adjuntamos el modal "padre" (último abierto) para enlazar jerarquías de UI.
    // `reactNativeModalPatch` se encarga de mantener el stack y de que `modal_close`
    // use el modal anterior (stack después del pop).
    const parentModal = getActiveModalId();
    const maybePayload = (event as { payload?: unknown }).payload;
    const nextPayload: Record<string, unknown> =
      maybePayload &&
      typeof maybePayload === 'object' &&
      !Array.isArray(maybePayload)
        ? (maybePayload as Record<string, unknown>)
        : {};

    // Si una integración ya calculó `parent_modal`, no lo sobrescribimos.
    // Esto es importante en acciones "close" donde el stack puede cambiar
    // inmediatamente después del evento.
    if (typeof nextPayload.parent_modal === 'undefined') {
      nextPayload.parent_modal = parentModal;
    }
    (event as { payload?: unknown }).payload = nextPayload;

    const resolvedScreenName = this.resolveScreenName(event);
    const family = String(getCanonicalTriple(event.type).event_family);
    const explicitSignalFoxId =
      this.pickOptionalString((event as { signalFoxId?: unknown }).signalFoxId) ??
      this.pickOptionalString((event as { target_id?: unknown }).target_id);
    const explicitSignalFoxDisplayName =
      this.pickOptionalString(
        (event as { signalFoxDisplayName?: unknown }).signalFoxDisplayName
      ) ??
      this.pickOptionalString((event as { target_name?: unknown }).target_name);
    const signalFoxId =
      explicitSignalFoxId ??
      buildGenericSignalFoxId({
        family,
        screenName: resolvedScreenName,
        parentModal,
        eventType: event.type,
      });
    const signalFoxDisplayName =
      explicitSignalFoxDisplayName ??
      buildGenericDisplayName({
        eventType: event.type,
        screenName: resolvedScreenName,
        payload: nextPayload,
        fallbackId: signalFoxId,
        customEventName: this.pickOptionalString(
          (event as { custom_event_name?: unknown }).custom_event_name
        ),
      });

    const fullEvent: AnalyticsEvent = {
      ...event,
      type: event.type as AnalyticsEvent['type'],
      timestamp: eventTimestamp,
      session_id: this.sessionId ?? '',
      anonymous_id: this.anonymousId,
      platform: Platform.OS as 'ios' | 'android',
      app_version: this.appVersion,
      signalFoxId,
      signalFoxDisplayName,
      ...(resolvedScreenName ? { screen_name: resolvedScreenName } : {}),
    } as AnalyticsEvent;

    if (resolvedScreenName) {
      this.currentScreenName = resolvedScreenName;
    }

    this.queue.push(fullEvent);

    if (isPurchaseFamilyEventType(event.type)) {
      console.log('[AUTO_ANALYTICS] purchase event queued', {
        type: event.type,
        screen_name: resolvedScreenName,
        timestamp: eventTimestamp,
      });
    }

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

  /** Eventos automáticos (integraciones). */
  trackEvent(
    event: { type: AnalyticsEventType } & Record<string, unknown>
  ): void {
    if (event.type === 'app_background') {
      const receivedAt = Date.now();
      console.log('[AUTO_ANALYTICS] app_background received', {
        ts_ms: receivedAt,
        ts_iso: new Date(receivedAt).toISOString(),
      });
    }

    if (
      this.navigationIntentPendingSinceMs !== null &&
      event.type !== 'screen_view'
    ) {
      this.navigationIntentBuffer.push(event);
      return;
    }

    if (
      shouldDelayScreenResolution(event.type) &&
      EVENT_SCREEN_RESOLUTION_DELAY_MS > 0
    ) {
      if (isPurchaseFamilyEventType(event.type)) {
        console.log(
          '[AUTO_ANALYTICS] purchase event: waiting screen-resolution delay',
          {
            type: event.type,
            delayMs: EVENT_SCREEN_RESOLUTION_DELAY_MS,
            currentScreenName: this.currentScreenName,
          }
        );
      }
      setTimeout(() => {
        if (isPurchaseFamilyEventType(event.type)) {
          console.log(
            '[AUTO_ANALYTICS] purchase event: delay elapsed, processing',
            {
              type: event.type,
              currentScreenName: this.currentScreenName,
            }
          );
        }
        this.processEvent(event);
      }, EVENT_SCREEN_RESOLUTION_DELAY_MS);
      return;
    }

    if (isPurchaseFamilyEventType(event.type)) {
      console.log('[AUTO_ANALYTICS] purchase event: processing immediately', {
        type: event.type,
        currentScreenName: this.currentScreenName,
      });
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

  trackStep(params: FlowStepParams): void {
    const flow =
      typeof params.flow_name === 'string' ? params.flow_name.trim() : '';
    const step = typeof params.id === 'string' ? params.id.trim() : '';
    const stepDisplayName =
      typeof params.displayName === 'string' ? params.displayName.trim() : '';
    if (!flow || !step) {
      console.warn(
        '[AUTO_ANALYTICS] trackStep requires non-empty flow_name and id'
      );
      return;
    }

    const ev: Record<string, unknown> = {
      type: 'flow_step_view',
      flow_name: flow,
      signalFoxId: step,
      ...(stepDisplayName ? { signalFoxDisplayName: stepDisplayName } : {}),
      step_name: step,
      payload: {},
    };
    if (
      typeof params.step_index === 'number' &&
      Number.isFinite(params.step_index)
    ) {
      ev.step_index = params.step_index;
    }
    const explicitScreen =
      typeof params.screen_name === 'string' ? params.screen_name.trim() : '';
    if (explicitScreen.length > 0) {
      ev.screen_name = explicitScreen;
    }

    this.trackEvent(
      ev as { type: AnalyticsEventType } & Record<string, unknown>
    );
  }

  /**
   * Evento semántico: sub-vista interna dentro de una pantalla.
   * No reemplaza trackStep (flujos lineales), sino subáreas activas de la screen.
   */
  trackSubview(params: SubviewParams): void {
    const subviewName = typeof params.id === 'string' ? params.id.trim() : '';
    const subviewDisplayName =
      typeof params.displayName === 'string' ? params.displayName.trim() : '';

    if (!subviewName) {
      console.warn('[AUTO_ANALYTICS] trackSubview requires a non-empty id');
      return;
    }

    this.trackEvent({
      type: 'subview_view',
      signalFoxId: subviewName,
      ...(subviewDisplayName
        ? { signalFoxDisplayName: subviewDisplayName }
        : {}),
      target_type: 'subview',
      flow_name: null,
      step_name: null,
      step_index: null,
      payload: {},
    });
  }

  /** Envío en segundo plano; errores ya se registran en `sendBatch` / `sendEvents`. */
  private scheduleFlush(): void {
    this.flush().catch(() => {
      /* fire-and-forget */
    });
  }

  async flush(): Promise<void> {
    if (this.sendPermanentlyDisabled) return;
    if (this.isFlushing) return;
    if (this.queue.length === 0) return;

    if (this.logOnly) {
      this.queue.splice(0, this.queue.length);
      return;
    }

    this.isFlushing = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.slice(0, this.batchSize);
        if (!batch.length) break;

        const sent = await this.sendBatch(batch);
        if (!sent) break;

        this.queue.splice(0, batch.length);
      }
    } finally {
      this.isFlushing = false;
      if (
        this.immediateFlush &&
        this.queue.length > 0 &&
        !this.sendPermanentlyDisabled
      ) {
        this.scheduleFlush();
      }
    }
  }

  private async sendBatch(events: QueuedEvent[]): Promise<boolean> {
    try {
      if (!events.length) return true;
      const dtoEvents = events.map(toBackendEventDto);
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
    this.scheduleFlush();
  }
}
