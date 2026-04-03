/**
 * Taxonomía canónica: event_name, event_family, event_action.
 * Debe coincidir con el contrato del backend.
 */

export type EventFamily =
  | 'lifecycle'
  | 'screen'
  | 'subview'
  | 'modal'
  | 'component'
  | 'flow'
  | 'purchase'
  | 'custom';

export type CanonicalTriple = {
  event_name: string;
  event_family: EventFamily | string;
  event_action: string;
};

const TAXONOMY_BY_TYPE: Record<string, CanonicalTriple> = {
  app_open: {
    event_name: 'app_open',
    event_family: 'lifecycle',
    event_action: 'open',
  },
  app_foreground: {
    event_name: 'app_foreground',
    event_family: 'lifecycle',
    event_action: 'foreground',
  },
  app_background: {
    event_name: 'app_background',
    event_family: 'lifecycle',
    event_action: 'background',
  },
  session_start: {
    event_name: 'session_start',
    event_family: 'lifecycle',
    event_action: 'start',
  },
  session_end: {
    event_name: 'session_end',
    event_family: 'lifecycle',
    event_action: 'end',
  },
  screen_view: {
    event_name: 'screen_view',
    event_family: 'screen',
    event_action: 'view',
  },
  subview_view: {
    event_name: 'subview_view',
    event_family: 'subview',
    event_action: 'view',
  },
  modal_open: {
    event_name: 'modal_open',
    event_family: 'modal',
    event_action: 'open',
  },
  modal_close: {
    event_name: 'modal_close',
    event_family: 'modal',
    event_action: 'close',
  },
  component_press: {
    event_name: 'component_press',
    event_family: 'component',
    event_action: 'press',
  },
  flow_step_view: {
    event_name: 'flow_step_view',
    event_family: 'flow',
    event_action: 'view',
  },
  custom: {
    event_name: 'custom',
    event_family: 'custom',
    event_action: 'track',
  },
  purchase_started: {
    event_name: 'purchase_started',
    event_family: 'purchase',
    event_action: 'started',
  },
  purchase_completed: {
    event_name: 'purchase_completed',
    event_family: 'purchase',
    event_action: 'completed',
  },
  purchase_failed: {
    event_name: 'purchase_failed',
    event_family: 'purchase',
    event_action: 'failed',
  },
  purchase_cancelled: {
    event_name: 'purchase_cancelled',
    event_family: 'purchase',
    event_action: 'cancelled',
  },
  subscription_started: {
    event_name: 'subscription_started',
    event_family: 'purchase',
    event_action: 'started',
  },
  trial_started: {
    event_name: 'trial_started',
    event_family: 'purchase',
    event_action: 'started',
  },
  restore_completed: {
    event_name: 'restore_completed',
    event_family: 'purchase',
    event_action: 'completed',
  },
  purchase_state_reconciled: {
    event_name: 'purchase_state_reconciled',
    event_family: 'purchase',
    event_action: 'reconciled',
  },
};

export function getCanonicalTriple(internalType: string): CanonicalTriple {
  const t = TAXONOMY_BY_TYPE[internalType];
  if (t) return t;
  return {
    event_name: internalType,
    event_family: 'custom',
    event_action: 'track',
  };
}
