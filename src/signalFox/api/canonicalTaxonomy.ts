/**
 * Canonical taxonomy: event_name, event_family, event_action.
 * Must match the backend contract.
 *
 * Rule: the (`event_family`, `event_action`) pair must be **unique** per event type
 * (do not reuse the same action for another `event_name` within the same family).
 */

export enum EventFamily {
  Lifecycle = 'lifecycle',
  Screen = 'screen',
  Subview = 'subview',
  Modal = 'modal',
  Component = 'component',
  Flow = 'flow',
  Purchase = 'purchase',
  Custom = 'custom',
}

export type CanonicalTriple = {
  event_name: string;
  event_family: EventFamily;
  event_action: string;
};

const TAXONOMY_BY_TYPE: Record<string, CanonicalTriple> = {
  app_open: {
    event_name: 'app_open',
    event_family: EventFamily.Lifecycle,
    event_action: 'open',
  },
  app_foreground: {
    event_name: 'app_foreground',
    event_family: EventFamily.Lifecycle,
    event_action: 'foreground',
  },
  app_background: {
    event_name: 'app_background',
    event_family: EventFamily.Lifecycle,
    event_action: 'background',
  },
  session_start: {
    event_name: 'session_start',
    event_family: EventFamily.Lifecycle,
    event_action: 'start',
  },
  session_end: {
    event_name: 'session_end',
    event_family: EventFamily.Lifecycle,
    event_action: 'end',
  },
  screen_view: {
    event_name: 'screen_view',
    event_family: EventFamily.Screen,
    event_action: 'view',
  },
  subview_view: {
    event_name: 'subview_view',
    event_family: EventFamily.Subview,
    event_action: 'view',
  },
  modal_open: {
    event_name: 'modal_open',
    event_family: EventFamily.Modal,
    event_action: 'open',
  },
  modal_close: {
    event_name: 'modal_close',
    event_family: EventFamily.Modal,
    event_action: 'close',
  },
  component_press: {
    event_name: 'component_press',
    event_family: EventFamily.Component,
    event_action: 'press',
  },
  flow_step_view: {
    event_name: 'flow_step_view',
    event_family: EventFamily.Flow,
    event_action: 'view',
  },
  custom: {
    event_name: 'custom',
    event_family: EventFamily.Custom,
    event_action: 'track',
  },
  purchase_started: {
    event_name: 'purchase_started',
    event_family: EventFamily.Purchase,
    event_action: 'started',
  },
  purchase_completed: {
    event_name: 'purchase_completed',
    event_family: EventFamily.Purchase,
    event_action: 'completed',
  },
  purchase_failed: {
    event_name: 'purchase_failed',
    event_family: EventFamily.Purchase,
    event_action: 'failed',
  },
  purchase_cancelled: {
    event_name: 'purchase_cancelled',
    event_family: EventFamily.Purchase,
    event_action: 'cancelled',
  },
  subscription_started: {
    event_name: 'subscription_started',
    event_family: EventFamily.Purchase,
    event_action: 'subscription',
  },
  trial_started: {
    event_name: 'trial_started',
    event_family: EventFamily.Purchase,
    event_action: 'trial',
  },
  restore_completed: {
    event_name: 'restore_completed',
    event_family: EventFamily.Purchase,
    event_action: 'restored',
  },
};

export function getCanonicalTriple(internalType: string): CanonicalTriple {
  const t = TAXONOMY_BY_TYPE[internalType];
  if (t) return t;
  return {
    event_name: internalType,
    event_family: EventFamily.Custom,
    event_action: 'track',
  };
}
