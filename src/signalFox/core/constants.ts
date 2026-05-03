import type { AnalyticsEventType } from '../types/events';

/** Development API key prefix: send immediately without relying on the batch/timer. */
export const DEV_API_KEY_PREFIX = 'ak_dev__';

export function isDevApiKey(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.startsWith(DEV_API_KEY_PREFIX);
}

export const DEFAULT_BATCH_SIZE = 10;
export const DEFAULT_FLUSH_INTERVAL_MS = 30_000;

/**
 * Short delay to let `screen_view` update the active screen
 * before assigning `screen_name` to the rest (including the purchase family).
 */
export const EVENT_SCREEN_RESOLUTION_DELAY_MS = 0;

/**
 * After `__unsafe_action__` while `state` is still unavailable: maximum wait time before assigning
 * `screen_name` to retained events (canceled navigation or no branch change).
 */
export const NAVIGATION_INTENT_BUFFER_MAX_MS = 2000;

/** Foreground after this inactivity window starts a new engagement session. */
export const ENGAGEMENT_SESSION_INACTIVITY_MS = 30 * 60 * 1000;

/** Enough to resolve delayed purchase/modal events against their original UI surface. */
export const SURFACE_CONTEXT_HISTORY_WINDOW_MS = 5 * 60 * 1000;

/** Only type processed without waiting: sets `currentScreenName` before the rest. */
const NO_SCREEN_RESOLUTION_DELAY_TYPES: ReadonlySet<AnalyticsEventType> =
  new Set<AnalyticsEventType>(['screen_view']);

/** Events emitted by the native purchase bridge (logs / heuristics). */
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
 * Offset relative to the first non-terminal event between `purchase_started` and the flow close,
 * so `purchase_completed` / `cancelled` / `failed` remain anchored just before it in the timeline.
 */
export const PURCHASE_TERMINAL_TIMESTAMP_OFFSET_MS = 10;

/**
 * Keep recent `purchase_started` attribution available for late or slightly
 * desynchronized terminal events from the same SKU.
 */
export const PURCHASE_STARTED_ATTRIBUTION_WINDOW_MS = 10_000;

/** Logical close of the flow started with `purchase_started` (RevenueCat / JS bridge). */
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
 * If firstInterveningTs - offset falls on or before startedTs, use the midpoint (floor).
 */
export function computePurchaseTerminalAdjustedTimestamp(
  startedTs: number,
  firstInterveningTs: number
): number {
  if (firstInterveningTs <= startedTs) {
    return startedTs;
  }
  const candidate = firstInterveningTs - PURCHASE_TERMINAL_TIMESTAMP_OFFSET_MS;
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
