import type {
  AnalyticsEventType,
  FunnelStepParams,
  SubviewParams,
} from './events';

export interface SignalFoxIntegrationCore {
  /** Flushes the queue and sends pending events to the backend. */
  flush(): Promise<void>;
  trackFunnelStep(params: FunnelStepParams): void;
  trackSubview(params: SubviewParams): void;

  /**
   * Navigation integrations (React Navigation / Expo Router): retain events
   * (excepto `screen_view`) hasta `clearNavigationIntentPending` o hasta
   * `NAVIGATION_INTENT_BUFFER_MAX_MS` sin resolver.
   */
  markNavigationIntentPending?(): void;
  clearNavigationIntentPending?(): void;
  /** Llamado solo al vencer el timeout del buffer; p. ej. para limpiar `pendingNavigationTimestamp` local. */
  setNavigationIntentTimeoutListener?(listener: (() => void) | null): void;

  /** Starts a new engagement session while keeping the app-cycle session id. */
  renewEngagementSession?(): void;
}

/**
 * Minimal internal interface used by built-in integrations.
 */
export interface IAnalyticsCore extends SignalFoxIntegrationCore {
  /** Automatic events (lifecycle, navigation, RN patches, purchases). */
  trackEvent(
    event: { type: AnalyticsEventType } & Record<string, unknown>
  ): void;
}

/** Contexto opcional pasado por `SignalFox.init()` al montar integraciones. */
export interface AnalyticsIntegrationSetupContext {
  allIntegrations: ReadonlyArray<AnalyticsIntegration>;
}

export interface AnalyticsIntegration {
  name: string;
  setup(
    core: SignalFoxIntegrationCore,
    context?: AnalyticsIntegrationSetupContext
  ): () => void;
}
