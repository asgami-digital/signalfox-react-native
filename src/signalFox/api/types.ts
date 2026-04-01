/**
 * DTO alineado con el backend (ingesta canónica).
 */
export interface BackendEventDto {
  event_id?: string;
  app_id?: string | null;
  environment?: string | null;
  anonymous_id?: string | null;
  session_id?: string | null;

  event_name: string;
  event_family: string;
  event_action: string;

  event_timestamp?: string | null;

  platform?: 'ios' | 'android' | 'web' | null;
  app_version?: string | null;

  screen_name?: string | null;
  previous_screen_name?: string | null;
  navigator_context?: string | null;

  target_id?: string | null;
  target_name?: string | null;
  target_type?: string | null;

  flow_name?: string | null;
  step_name?: string | null;
  step_index?: number | null;

  country?: string | null;
  device_model?: string | null;
  os_version?: string | null;

  schema_version?: number;
  /** Solo extras; no duplicar columnas de primer nivel. */
  properties_json?: Record<string, unknown> | null;
}

export interface BackendEventsBulkDto {
  events: BackendEventDto[];
}
