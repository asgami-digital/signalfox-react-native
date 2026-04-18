import type { AnalyticsEvent } from '../types/events';
import type { BackendEventDto } from './types';
import { getCanonicalTriple } from './canonicalTaxonomy';

const SCHEMA_VERSION = 2;

/** Campos que van en columnas; no deben repetirse en properties_json. */
const COLUMN_KEYS = new Set([
  'screen_name',
  'previous_screen_name',
  'navigator_context',
  'parent_modal',
  'signalFoxId',
  'signalFoxDisplayName',
  'target_id',
  'target_name',
  'target_type',
  'flow_name',
  'step_name',
  'step_index',
]);

function generateEventId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const ms = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Date(ms).toISOString();
}

function pickOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Nunca enviar `signalFoxId` (ni `target_id` equivalente) como cadena vacía. */
function signalFoxIdOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function pickPlatform(value: unknown): 'ios' | 'android' | 'web' | null {
  if (value === 'ios' || value === 'android' || value === 'web') return value;
  return null;
}

function getPayload(
  event: Record<string, unknown>
): Record<string, unknown> | null {
  const p = event.payload;
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
}

function navigatorContextToString(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return null;
  }
}

function stripColumnKeys(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (COLUMN_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Construye properties_json solo con datos extra (p. ej. payload anidado sin duplicar columnas).
 */
function mergePayloadAsExtras(
  payload: Record<string, unknown> | null,
  stripPayloadFields?: string[]
): Record<string, unknown> {
  if (!payload) return {};
  let p = stripColumnKeys({ ...payload });
  if (stripPayloadFields?.length) {
    for (const f of stripPayloadFields) {
      delete p[f];
    }
  }
  return p;
}

export function toBackendEventDto(event: AnalyticsEvent): BackendEventDto {
  const raw = event as unknown as Record<string, unknown>;
  const internalType = String(raw.type ?? 'custom');
  const triple = getCanonicalTriple(internalType);
  const payload = getPayload(raw);
  const signalFoxId =
    pickOptionalString(raw.signalFoxId) ?? pickOptionalString(raw.target_id);
  const signalFoxDisplayName =
    pickOptionalString(raw.signalFoxDisplayName) ??
    pickOptionalString(raw.target_name);

  const base: BackendEventDto = {
    event_id: generateEventId(),
    anonymous_id: pickOptionalString(event.anonymous_id),
    session_id: pickOptionalString(event.session_id),
    event_name: triple.event_name,
    event_family: String(triple.event_family),
    event_action: triple.event_action,
    event_timestamp: toIsoTimestamp(event.timestamp),
    platform: pickPlatform(event.platform),
    app_version: pickOptionalString(event.app_version),
    schema_version: SCHEMA_VERSION,
    country: null,
    device_model: pickOptionalString(raw.device_model),
    os_version: pickOptionalString(raw.os_version),
    signalFoxId: signalFoxId,
    signalFoxDisplayName: signalFoxDisplayName ?? signalFoxId,
    target_id: signalFoxId,
    target_name: signalFoxDisplayName ?? signalFoxId,
    properties_json: null,
  };

  // Campo base/top-level (no dentro de properties_json).
  base.parent_modal = pickOptionalString(payload?.parent_modal);

  switch (internalType) {
    case 'screen_view': {
      const sn =
        pickOptionalString(raw.screen_name) ??
        pickOptionalString(payload?.screen_name) ??
        pickOptionalString(payload?.screenName);
      const prev =
        pickOptionalString(payload?.previous_screen_name) ??
        pickOptionalString(payload?.previousScreen);
      const navStr = navigatorContextToString(payload?.navigator_context);
      base.screen_name = sn;
      base.previous_screen_name = prev;
      base.navigator_context = navStr;
      base.properties_json = cleanProps(
        mergePayloadAsExtras(payload, [
          'screen_name',
          'previous_screen_name',
          'navigator_context',
          'screenName',
          'previousScreen',
        ])
      );
      break;
    }
    case 'subview_view': {
      const sn =
        pickOptionalString(raw.screen_name) ??
        pickOptionalString(payload?.screen_name) ??
        pickOptionalString(payload?.screenName);
      const subview =
        pickOptionalString(raw.signalFoxId) ??
        pickOptionalString(raw.target_id) ??
        pickOptionalString(payload?.subview_name) ??
        pickOptionalString(payload?.subviewName);
      const subviewDisplayName =
        pickOptionalString(raw.signalFoxDisplayName) ??
        pickOptionalString(raw.target_name) ??
        subview;
      base.screen_name = sn;
      base.target_id = subview;
      base.target_name = subviewDisplayName;
      base.target_type = 'subview';
      base.flow_name = null;
      base.step_name = null;
      base.step_index = null;
      base.properties_json = cleanProps(
        mergePayloadAsExtras(payload, [
          'subview_name',
          'subviewName',
          'screen_name',
          'screenName',
          'target_id',
          'target_name',
          'target_type',
        ])
      );
      break;
    }
    case 'modal_open':
    case 'modal_close': {
      const targetId =
        pickOptionalString(raw.signalFoxId) ??
        pickOptionalString(raw.target_id) ??
        pickOptionalString(raw.modal_name);
      const targetName =
        pickOptionalString(raw.signalFoxDisplayName) ??
        pickOptionalString(raw.target_name) ??
        targetId;
      base.screen_name =
        pickOptionalString(raw.screen_name) ??
        (internalType === 'modal_open'
          ? pickOptionalString(payload?.previous_screen_name) ??
            pickOptionalString(payload?.previousScreen)
          : pickOptionalString(payload?.currentScreen) ??
            pickOptionalString(payload?.screen_name));
      base.target_id = targetId;
      base.target_name = targetName;
      base.target_type = 'modal';
      base.properties_json = cleanProps(
        mergePayloadAsExtras(payload, [
          'modalName',
          'previousScreen',
          'currentScreen',
        ])
      );
      break;
    }
    case 'component_press': {
      base.screen_name = pickOptionalString(raw.screen_name);
      base.target_id =
        pickOptionalString(raw.signalFoxId) ??
        pickOptionalString(raw.target_id);
      base.target_name =
        pickOptionalString(raw.signalFoxDisplayName) ??
        pickOptionalString(raw.target_name);
      base.target_type = pickOptionalString(raw.target_type) ?? 'unknown';
      base.properties_json = cleanProps(mergePayloadAsExtras(payload));
      break;
    }
    case 'flow_step_view': {
      base.screen_name = pickOptionalString(raw.screen_name);
      base.flow_name = pickOptionalString(raw.flow_name);
      base.step_name =
        pickOptionalString(raw.step_name) ??
        pickOptionalString(raw.signalFoxId);
      base.target_id =
        pickOptionalString(raw.signalFoxId) ??
        pickOptionalString(raw.target_id);
      base.target_name =
        pickOptionalString(raw.signalFoxDisplayName) ??
        pickOptionalString(raw.target_name) ??
        base.step_name;
      base.step_index =
        typeof raw.step_index === 'number' && Number.isFinite(raw.step_index)
          ? (raw.step_index as number)
          : null;
      base.target_type = 'flow_step';
      base.properties_json = cleanProps(mergePayloadAsExtras(payload));
      break;
    }
    case 'custom': {
      const customName = pickOptionalString(raw.custom_event_name);
      const userPayload =
        raw.payload && typeof raw.payload === 'object' && raw.payload
          ? { ...(raw.payload as Record<string, unknown>) }
          : {};
      // Evitamos duplicar/meterlo dentro de properties_json.
      delete (userPayload as Record<string, unknown>).parent_modal;

      base.properties_json = cleanProps({
        ...(customName ? { custom_event_name: customName } : {}),
        payload: userPayload,
      });
      base.screen_name = pickOptionalString(raw.screen_name);
      break;
    }
    default: {
      // purchase_*, lifecycle (sin payload rico), etc.
      base.target_id =
        pickOptionalString(raw.signalFoxId) ??
        pickOptionalString(raw.target_id) ??
        base.target_id;
      base.target_name =
        pickOptionalString(raw.signalFoxDisplayName) ??
        pickOptionalString(raw.target_name) ??
        base.target_name;
      if (internalType.startsWith('purchase_')) {
        base.screen_name = pickOptionalString(raw.screen_name);
      } else {
        base.screen_name = pickOptionalString(raw.screen_name);
      }
      base.properties_json = cleanProps(mergePayloadAsExtras(payload));
      break;
    }
  }

  base.signalFoxId = signalFoxIdOrNull(base.signalFoxId);
  base.target_id = signalFoxIdOrNull(base.target_id);

  return base;
}

function cleanProps(
  p: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!p || Object.keys(p).length === 0) return null;
  return p;
}
