import type { BackendEventDto, BackendEventsBulkDto } from './types';

// TODO: externalizar en config de entorno.
const BASE_URL = 'https://api-dev.signalfox.io';
const BULK_EVENTS_PATH = '/analytics/events/bulk';

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
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `SignalFox request failed: ${response.status} ${response.statusText}${
        errorText ? ` - ${errorText}` : ''
      }`
    );
  }
}

export { BASE_URL, BULK_EVENTS_PATH };
