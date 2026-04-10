jest.mock('../../../NativeSignalfoxReactNative', () => ({
  default: {
    getAppVersion: jest.fn(() => Promise.resolve('1.0.0')),
    getAnonymousId: jest.fn(() => Promise.resolve('test-anon')),
  },
}));

import { AnalyticsCore } from '../AnalyticsCore';
import { sendEvents } from '../../api/signalFoxApi';
import { NAVIGATION_INTENT_BUFFER_MAX_MS } from '../constants';

jest.mock('../../api/signalFoxApi', () => {
  const actual = jest.requireActual<typeof import('../../api/signalFoxApi')>(
    '../../api/signalFoxApi'
  );
  return {
    ...actual,
    sendEvents: jest.fn(() => Promise.resolve()),
  };
});

const mockedSendEvents = sendEvents as jest.MockedFunction<typeof sendEvents>;

describe('AnalyticsCore navigation intent buffer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedSendEvents.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retiene track() hasta clearNavigationIntentPending y conserva timestamp explícito', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();
    core.markNavigationIntentPending();
    const ts = 1_700_000_000_000;
    core.trackEvent({
      type: 'custom',
      custom_event_name: 'tap',
      payload: {},
      timestamp: ts,
    });
    await core.flush();
    expect(mockedSendEvents).not.toHaveBeenCalled();

    core.clearNavigationIntentPending();
    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
    const firstCall = mockedSendEvents.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sendPayload = firstCall![0];
    expect(sendPayload.events?.[0]).toBeDefined();
    const dto = sendPayload.events![0] as {
      event_timestamp?: string | null;
    };
    expect(dto.event_timestamp).toBe(new Date(ts).toISOString());
  });

  it('modal_open no se retiene con navigation intent pendiente', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();
    core.markNavigationIntentPending();
    core.trackEvent({
      type: 'modal_open',
      target_type: 'modal',
      payload: {
        modalName: 'test',
        source: 'react_native_modal',
        kind: 'component_modal',
      },
    } as any);
    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
    const sendPayload = mockedSendEvents.mock.calls[0]![0];
    expect(sendPayload.events?.[0]?.event_name).toBe('modal_open');
  });

  it('screen_view no se retiene y actualiza pantalla antes del flush del buffer', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();
    core.trackEvent({
      type: 'screen_view',
      payload: { screen_name: 'Home' },
    });
    await core.flush();
    mockedSendEvents.mockClear();

    core.markNavigationIntentPending();
    core.trackEvent({
      type: 'custom',
      custom_event_name: 'during_nav',
      payload: {},
    });
    core.trackEvent({
      type: 'screen_view',
      payload: { screen_name: 'Detail' },
    });
    core.clearNavigationIntentPending();
    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
    const secondBatchCall = mockedSendEvents.mock.calls[0];
    expect(secondBatchCall).toBeDefined();
    const sendPayload = secondBatchCall![0];
    expect(sendPayload.events).toBeDefined();
    const events = sendPayload.events as Array<{
      event_name?: string;
      screen_name?: string | null;
    }>;
    const order = events.map((e) => e.event_name);
    expect(order).toEqual(['screen_view', 'custom']);
    const during = events.find((e) => e.event_name === 'custom');
    expect(during?.screen_name).toBe('Detail');
  });

  it('tras timeout vacía el buffer sin clearNavigationIntentPending', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();
    const onTimeout = jest.fn();
    core.setNavigationIntentTimeoutListener(onTimeout);

    core.markNavigationIntentPending();
    core.track('held', {});
    await core.flush();
    expect(mockedSendEvents).not.toHaveBeenCalled();

    jest.advanceTimersByTime(NAVIGATION_INTENT_BUFFER_MAX_MS);
    await core.flush();

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
  });

  it('no extiende indefinidamente el timeout si markNavigationIntentPending se repite', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();
    const onTimeout = jest.fn();
    core.setNavigationIntentTimeoutListener(onTimeout);

    core.markNavigationIntentPending();
    core.trackStep({
      flow_name: 'onboarding',
      id: 'welcome',
      displayName: 'Welcome',
    });
    await core.flush();
    expect(mockedSendEvents).not.toHaveBeenCalled();

    jest.advanceTimersByTime(Math.floor(NAVIGATION_INTENT_BUFFER_MAX_MS / 2));
    core.markNavigationIntentPending();
    jest.advanceTimersByTime(
      NAVIGATION_INTENT_BUFFER_MAX_MS - Math.floor(NAVIGATION_INTENT_BUFFER_MAX_MS / 2)
    );
    await core.flush();

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
    const sent = mockedSendEvents.mock.calls[0]![0].events ?? [];
    expect(sent[0]?.event_name).toBe('flow_step_view');
  });
});
