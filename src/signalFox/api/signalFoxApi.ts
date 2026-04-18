import type { BackendEventDto, BackendEventsBulkDto } from './types';

// TODO: externalizar en config de entorno.
const BASE_URL = 'https://api-dev.signalfox.io';
const BULK_EVENTS_PATH = '/analytics/events/bulk';

export class SignalFoxRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SignalFoxRequestError';
    this.status = status;
  }
}

/**
 * 4xx que no tiene sentido reintentar sin cambiar API key, URL o el propio SDK.
 * Se excluyen 408 (timeout ambiguo) y 429 (rate limit), que pueden recuperarse.
 */
export function isPermanentHttpSendFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export async function sendEvents(params: {
  apiKey: string;
  events: BackendEventDto[];
}): Promise<void> {
  const { apiKey, events } = params;
  if (!events.length) return;

  const body: BackendEventsBulkDto = { events };

  console.log(
    `[AUTO_ANALYTICS] Sending ${events.length} event(s) -> ${BASE_URL}${BULK_EVENTS_PATH}`
  );
  const response = await fetch(`${BASE_URL}${BULK_EVENTS_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'test': 'ESTA ES LA PRUEBA 3',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const detail = errorText ? ` - ${errorText}` : '';
    const message = `SignalFox request failed: ${response.status} ${response.statusText}${detail}`;
    throw new SignalFoxRequestError(response.status, message);
  }
}

export { BASE_URL, BULK_EVENTS_PATH };
