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
 * antes de adjudicar `screen_name` al resto (incluida la familia de compras).
 */
export const EVENT_SCREEN_RESOLUTION_DELAY_MS = 100;

/** Único tipo que procesa sin esperar: fija `currentScreenName` antes que los demás. */
const NO_SCREEN_RESOLUTION_DELAY_TYPES: ReadonlySet<AnalyticsEventType> =
  new Set<AnalyticsEventType>(['screen_view']);

/** Eventos emitidos por el bridge nativo de compras (logs / heurísticas). */
export const PURCHASE_FAMILY_EVENT_TYPES: ReadonlySet<AnalyticsEventType> =
  new Set<AnalyticsEventType>([
    'purchase_started',
    'purchase_cancelled',
    'purchase_completed',
    'purchase_failed',
    'subscription_started',
    'trial_started',
    'restore_completed',
    'purchase_state_reconciled',
  ]);

export function isPurchaseFamilyEventType(
  eventType: AnalyticsEventType
): boolean {
  return PURCHASE_FAMILY_EVENT_TYPES.has(eventType);
}

export function shouldDelayScreenResolution(
  eventType: AnalyticsEventType
): boolean {
  return !NO_SCREEN_RESOLUTION_DELAY_TYPES.has(eventType);
}
