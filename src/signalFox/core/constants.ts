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
export const EVENT_SCREEN_RESOLUTION_DELAY_MS = 0;

/**
 * Tras `__unsafe_action__` sin `state` aún: máximo de espera antes de adjudicar
 * `screen_name` a eventos retenidos (navegación cancelada o sin cambio de rama).
 */
export const NAVIGATION_INTENT_BUFFER_MAX_MS = 2000;

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

/**
 * Desfase respecto al primer evento no terminal entre `purchase_started` y el cierre del flujo,
 * para que `purchase_completed` / `cancelled` / `failed` queden anclados justo antes en la línea de tiempo.
 */
export const PURCHASE_TERMINAL_TIMESTAMP_OFFSET_MS = 10;

/** Cierre lógico del flujo iniciado con `purchase_started` (RevenueCat / bridge JS). */
export function isPurchaseFlowTerminalEventType(
  eventType: AnalyticsEventType
): boolean {
  return (
    eventType === 'purchase_completed' ||
    eventType === 'purchase_cancelled' ||
    eventType === 'purchase_failed'
  );
}

/**
 * Garantiza startedTs < resultado < firstInterveningTs cuando hay margen en ms enteros.
 * Si firstInterveningTs - offset cae en o antes de startedTs, usa el punto medio (floor).
 */
export function computePurchaseTerminalAdjustedTimestamp(
  startedTs: number,
  firstInterveningTs: number
): number {
  if (firstInterveningTs <= startedTs) {
    return startedTs;
  }
  const candidate =
    firstInterveningTs - PURCHASE_TERMINAL_TIMESTAMP_OFFSET_MS;
  if (candidate > startedTs) {
    return candidate;
  }
  let mid = Math.floor((startedTs + firstInterveningTs) / 2);
  if (mid <= startedTs) {
    mid = startedTs + 1;
  }
  if (mid >= firstInterveningTs) {
    mid = firstInterveningTs - 1;
  }
  if (mid <= startedTs) {
    return startedTs;
  }
  return mid;
}
