jest.mock('../../../NativeSignalfoxReactNative', () => ({
  default: {
    getAppVersion: jest.fn(() => Promise.resolve('1.0.0')),
    getAnonymousId: jest.fn(() => Promise.resolve('test-anon')),
    getDeviceModel: jest.fn(() => Promise.resolve('jest-device')),
    getOsVersion: jest.fn(() => Promise.resolve('jest-os')),
  },
}));

import { AnalyticsCore } from '../AnalyticsCore';
import { sendEvents } from '../../api/signalFoxApi';

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

describe('AnalyticsCore identifiers', () => {
  beforeEach(() => {
    mockedSendEvents.mockClear();
  });

  it('genera signalFoxId y displayName legibles para eventos de lifecycle', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    core.trackEvent({ type: 'app_open' });
    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
    const batch = mockedSendEvents.mock.calls[0]?.[0];
    const dto = batch?.events?.[0];

    expect(dto?.signalFoxId).toBe('app_open');
    expect(dto?.signalFoxDisplayName).toBe('App opened');
    expect(dto?.target_id).toBe('app_open');
    expect(dto?.target_name).toBe('App opened');
  });

  it('sends engagement_session_id and renews it independently from session_id', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    core.trackEvent({ type: 'app_open' });
    await core.flush();

    const firstDto = mockedSendEvents.mock.calls[0]?.[0].events?.[0];
    mockedSendEvents.mockClear();

    core.renewEngagementSession();
    core.trackEvent({ type: 'app_foreground' });
    await core.flush();

    const secondDto = mockedSendEvents.mock.calls[0]?.[0].events?.[0];
    expect(firstDto?.session_id).toBeTruthy();
    expect(firstDto?.engagement_session_id).toBeTruthy();
    expect(secondDto?.session_id).toBe(firstDto?.session_id);
    expect(secondDto?.engagement_session_id).toBeTruthy();
    expect(secondDto?.engagement_session_id).not.toBe(
      firstDto?.engagement_session_id
    );
  });

  it('keeps explicit displayName and leaves signalFoxId as null for modals without an explicit id', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    core.trackEvent({
      type: 'modal_open',
      signalFoxDisplayName: 'RevenueCat Paywall',
      target_type: 'modal',
      payload: {
        modalName: 'RevenueCat Paywall',
        source: 'react_native_modal',
        kind: 'component_modal',
      },
    } as any);
    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
    const batch = mockedSendEvents.mock.calls[0]?.[0];
    const dto = batch?.events?.[0];

    expect(dto?.signalFoxId).toBeNull();
    expect(dto?.signalFoxDisplayName).toBe('RevenueCat Paywall');
    expect(dto?.target_id).toBeNull();
    expect(dto?.target_name).toBe('RevenueCat Paywall');
  });

  it('leaves signalFoxId and displayName as null for component_press without an explicit identifier', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    core.trackEvent({
      type: 'component_press',
      target_type: 'touchable',
      payload: {
        source: 'react_native_touchable',
        rnComponent: 'Pressable',
      },
    } as any);
    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
    const batch = mockedSendEvents.mock.calls[0]?.[0];
    const dto = batch?.events?.[0];

    expect(dto?.signalFoxId).toBeNull();
    expect(dto?.signalFoxDisplayName).toBeNull();
    expect(dto?.target_id).toBeNull();
    expect(dto?.target_name).toBeNull();
  });

  it('uses step_name from flow_step_view events sent to the backend', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    core.trackEvent({
      type: 'flow_step_view',
      flow_name: 'checkout',
      step_name: 'payment_method',
      payload: {},
    } as any);
    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
    const batch = mockedSendEvents.mock.calls[0]?.[0];
    const dto = batch?.events?.[0];

    expect(dto?.signalFoxId).toBe('payment_method');
    expect(dto?.target_id).toBe('payment_method');
    expect(dto?.step_name).toBe('payment_method');
  });

  it('does not let modal_close context override the current screen for subsequent events', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    core.trackEvent({
      type: 'screen_view',
      payload: { screen_name: 'onboardinggenerateplan' },
      timestamp: 1_000,
    } as any);

    core.trackEvent({
      type: 'modal_open',
      target_type: 'modal',
      payload: {
        source: 'react_native_modal',
        kind: 'component_modal',
        modalName: 'paywall',
        previous_screen_name: 'onboardinggenerateplan',
      },
      timestamp: 1_100,
    } as any);

    core.trackEvent({
      type: 'screen_view',
      payload: { screen_name: 'plan' },
      timestamp: 1_200,
    } as any);

    // Some client apps navigate first and close modal milliseconds later.
    // The close event can legitimately still carry the old screen in payload.
    core.trackEvent({
      type: 'modal_close',
      target_type: 'modal',
      payload: {
        source: 'react_native_modal',
        kind: 'component_modal',
        modalName: 'paywall',
        previous_screen_name: 'onboardinggenerateplan',
        currentScreen: 'onboardinggenerateplan',
        screen_name: 'onboardinggenerateplan',
      },
      timestamp: 1_201,
    } as any);

    core.trackEvent({
      type: 'subview_view',
      signalFoxId: 'plan-view-today',
      payload: {},
      timestamp: 1_202,
    } as any);

    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
    const sentEvents = mockedSendEvents.mock.calls[0]?.[0].events ?? [];
    const lastEvent = sentEvents[sentEvents.length - 1];

    expect(lastEvent?.event_name).toBe('subview_view');
    expect(lastEvent?.screen_name).toBe('plan');
  });
});
