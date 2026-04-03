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
}

export interface AnalyticsIntegration {
  name: string;
  setup(core: IAnalyticsCore): () => void;
}
