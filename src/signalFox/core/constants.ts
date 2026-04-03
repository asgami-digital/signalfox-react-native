import type { AnalyticsEventType } from '../types/events';

/** Prefijo de API keys de desarrollo: envío inmediato sin depender del batch/timer. */
export const DEV_API_KEY_PREFIX = 'ak_dev__';

export function isDevApiKey(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.startsWith(DEV_API_KEY_PREFIX);
}

export const DEFAULT_BATCH_SIZE = 10;
export const DEFAULT_FLUSH_INTERVAL_MS = 30_000;

/**
 * Delay corto para dejar que `screen_view` actualice la pantalla activa
 * antes de adjudicar `screen_name` al resto (modales, lifecycle, taps, compras, etc.).
 */
export const EVENT_SCREEN_RESOLUTION_DELAY_MS = 100;

export function shouldDelayScreenResolution(
  eventType: AnalyticsEventType
): boolean {
  return eventType !== 'screen_view';
}
