/**
 * Tipos de eventos internos (SDK) → se mapean a DTO canónico en eventMapper.
 */

export type AnalyticsEventType =
  | 'app_open'
  | 'app_background'
  | 'app_foreground'
  | 'session_start'
  | 'session_end'
  | 'screen_view'
  | 'subview_view'
  | 'flow_step_view'
  | 'custom'
  | 'modal_open'
  | 'modal_close'
  | 'component_press'
  | 'purchase_started'
  | 'purchase_cancelled'
  | 'purchase_completed'
  | 'purchase_failed'
  | 'subscription_started'
  | 'trial_started'
  | 'restore_completed';

/** Propiedades base presentes en todos los eventos */
export interface BaseAnalyticsEvent {
  type: AnalyticsEventType;
  timestamp: number;
  session_id: string;
  anonymous_id: string;
  platform: 'ios' | 'android';
  app_version?: string;
}

export interface ScreenViewEvent extends BaseAnalyticsEvent {
  type: 'screen_view';
  payload: {
    screen_name: string;
    previous_screen_name?: string | null;
    navigator_context?: unknown;
    parent_modal?: string | null;
  };
}

export interface ModalEventPayload {
  modalName: string | null;
  source: 'react_navigation' | 'react_native_modal';
  kind: 'screen_modal' | 'component_modal';
  previous_screen_name?: string | null;
  previousScreen?: string | null;
  currentScreen?: string | null;
  screen_name?: string | null;
  presentation?: string | null;
  parent_modal?: string | null;
}

export interface ModalEvent extends BaseAnalyticsEvent {
  type: 'modal_open' | 'modal_close';
  target_id: string | null;
  target_name: string | null;
  target_type: 'modal';
  payload: ModalEventPayload;
}

export interface ComponentPressPayload {
  source: 'react_native_touchable';
  rnComponent: string;
  parent_modal?: string | null;
}

export interface ComponentPressEvent extends BaseAnalyticsEvent {
  type: 'component_press';
  target_id: string | null;
  target_name: string | null;
  target_type: 'button' | 'touchable' | 'tab' | 'unknown';
  payload: ComponentPressPayload;
}

export type FlowStepParams = {
  flow_name: string;
  step_name: string;
  step_index?: number;
  /** Si se omite, se usa la pantalla actual del core (puede ser null en el primer render). */
  screen_name?: string;
};

export type SubviewParams = string;

export interface SubviewViewEvent extends BaseAnalyticsEvent {
  type: 'subview_view';
  target_id: string;
  target_name: string;
  target_type: 'subview';
  flow_name: null;
  step_name: null;
  step_index: null;
  payload: Record<string, unknown>;
}

export interface FlowStepViewEvent extends BaseAnalyticsEvent {
  type: 'flow_step_view';
  flow_name: string;
  step_name: string;
  step_index?: number;
  payload?: Record<string, unknown>;
}

export interface CustomEvent extends BaseAnalyticsEvent {
  type: 'custom';
  custom_event_name: string;
  payload: Record<string, unknown>;
}

export type AnalyticsEvent =
  | ScreenViewEvent
  | SubviewViewEvent
  | ModalEvent
  | ComponentPressEvent
  | FlowStepViewEvent
  | CustomEvent
  | (BaseAnalyticsEvent & { type: AnalyticsEventType; payload?: unknown });
