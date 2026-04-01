import type { AnalyticsEventType } from '../types/events';

/** Prefijo de API keys de desarrollo: envío inmediato sin depender del batch/timer. */
export const DEV_API_KEY_PREFIX = 'ak_dev__';

export function isDevApiKey(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.startsWith(DEV_API_KEY_PREFIX);
}

export const DEFAULT_BATCH_SIZE = 10;
export const DEFAULT_FLUSH_INTERVAL_MS = 30_000;

/**
 * Delay corto para dejar que la navegación asiente la screen activa
 * antes de adjudicarla a eventos no-nav.
 */
export const EVENT_SCREEN_RESOLUTION_DELAY_MS = 50;

const NAVIGATION_EVENT_TYPES: ReadonlySet<AnalyticsEventType> =
  new Set<AnalyticsEventType>(['screen_view', 'modal_open', 'modal_close']);

const LIFECYCLE_EVENT_TYPES: ReadonlySet<AnalyticsEventType> =
  new Set<AnalyticsEventType>([
    'app_open',
    'app_foreground',
    'app_background',
    'session_start',
    'session_end',
  ]);

export function shouldDelayScreenResolution(
  eventType: AnalyticsEventType
): boolean {
  if (eventType === 'component_press') return false;
  if (NAVIGATION_EVENT_TYPES.has(eventType)) return false;
  if (LIFECYCLE_EVENT_TYPES.has(eventType)) return false;
  return true;
}
