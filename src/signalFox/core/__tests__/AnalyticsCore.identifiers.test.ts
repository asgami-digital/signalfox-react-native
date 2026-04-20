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

  it('uses the trackStep id for flow_step_view', async () => {
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
});
