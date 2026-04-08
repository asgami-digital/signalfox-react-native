import type {
  AnalyticsEventType,
  FlowStepParams,
  SubviewParams,
} from './events';

/**
 * Interfaz mínima que el core expone a las integraciones.
 */
export interface IAnalyticsCore {
  /** Vacía la cola y envía eventos pendientes al backend. */
  flush(): Promise<void>;
  /** Eventos automáticos (lifecycle, navegación, parches RN, compras). */
  trackEvent(
    event: { type: AnalyticsEventType } & Record<string, unknown>
  ): void;
  /**
   * Evento custom libre (event_name=custom, custom_event_name en properties_json).
   */
  track(name: string, properties?: Record<string, unknown>): void;
  /** @deprecated usar track() */
  sendEvent?(name: string, properties: Record<string, unknown>): void;
  trackStep(params: FlowStepParams): void;
  trackSubview(params: SubviewParams): void;

  /**
   * React Navigation: retiene eventos (excepto `screen_view`) hasta `clearNavigationIntentPending`
   * o hasta `NAVIGATION_INTENT_BUFFER_MAX_MS` sin resolver.
   */
  markNavigationIntentPending?(): void;
  clearNavigationIntentPending?(): void;
  /** Llamado solo al vencer el timeout del buffer; p. ej. para limpiar `pendingNavigationTimestamp` local. */
  setNavigationIntentTimeoutListener?(listener: (() => void) | null): void;
}

/** Contexto opcional pasado por `SignalFoxProvider` al montar integraciones. */
export interface AnalyticsIntegrationSetupContext {
  allIntegrations: ReadonlyArray<AnalyticsIntegration>;
}

export interface AnalyticsIntegration {
  name: string;
  setup(
    core: IAnalyticsCore,
    context?: AnalyticsIntegrationSetupContext
  ): () => void;
}
