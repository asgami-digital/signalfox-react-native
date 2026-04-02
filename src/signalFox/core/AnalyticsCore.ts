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
import { sendEvents } from '../api/signalFoxApi';
import { toBackendEventDto } from '../api/eventMapper';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_FLUSH_INTERVAL_MS,
  EVENT_SCREEN_RESOLUTION_DELAY_MS,
  isDevApiKey,
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

  private pickOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
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
    event: { type: AnalyticsEventType } & Record<string, unknown>,
    eventTimestamp: number
  ): void {
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

    const fullEvent: AnalyticsEvent = {
      ...event,
      type: event.type as AnalyticsEvent['type'],
      timestamp: eventTimestamp,
      session_id: this.sessionId ?? '',
      anonymous_id: this.anonymousId,
      platform: Platform.OS as 'ios' | 'android',
      app_version: this.appVersion,
      ...(resolvedScreenName ? { screen_name: resolvedScreenName } : {}),
    } as AnalyticsEvent;

    if (resolvedScreenName) {
      this.currentScreenName = resolvedScreenName;
    }

    this.queue.push(fullEvent);

    if (this.logOnly) {
      console.log('[AUTO_ANALYTICS]', fullEvent);
    }

    if (this.immediateFlush) {
      void this.flush();
    } else {
      if (this.queue.length >= this.batchSize) {
        void this.flush();
      }

      if (event.type === 'app_background') {
        void this.flush();
      }
    }
  }

  /** Eventos automáticos (integraciones). */
  trackEvent(
    event: { type: AnalyticsEventType } & Record<string, unknown>
  ): void {
    const eventTimestamp = Date.now();
    if (event.type === 'app_background') {
      console.log('[AUTO_ANALYTICS] app_background received', {
        ts_ms: eventTimestamp,
        ts_iso: new Date(eventTimestamp).toISOString(),
      });
    }

    if (
      shouldDelayScreenResolution(event.type) &&
      EVENT_SCREEN_RESOLUTION_DELAY_MS > 0
    ) {
      setTimeout(() => {
        this.processEvent(event, eventTimestamp);
      }, EVENT_SCREEN_RESOLUTION_DELAY_MS);
      return;
    }

    this.processEvent(event, eventTimestamp);
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
    const step =
      typeof params.step_name === 'string' ? params.step_name.trim() : '';
    if (!flow || !step) {
      console.warn(
        '[AUTO_ANALYTICS] trackStep requires non-empty flow_name and step_name'
      );
      return;
    }

    const ev: Record<string, unknown> = {
      type: 'flow_step_view',
      flow_name: flow,
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
    const subviewName = typeof params === 'string' ? params.trim() : '';

    if (!subviewName) {
      console.warn('[AUTO_ANALYTICS] trackSubview requires a non-empty string');
      return;
    }

    this.trackEvent({
      type: 'subview_view',
      target_id: subviewName,
      target_name: subviewName,
      target_type: 'subview',
      flow_name: null,
      step_name: null,
      step_index: null,
      payload: {},
    });
  }

  async flush(): Promise<void> {
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
      if (this.immediateFlush && this.queue.length > 0) {
        void this.flush();
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
      console.warn(
        '[AUTO_ANALYTICS] Failed to send batch, keeping events in queue',
        e
      );
      return false;
    }
  }

  startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
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
    void this.flush();
  }
}
