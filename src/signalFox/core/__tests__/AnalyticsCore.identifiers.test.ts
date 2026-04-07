jest.mock('../../../NativeSignalfoxReactNative', () => ({
  default: {
    getAppVersion: jest.fn(() => Promise.resolve('1.0.0')),
    getAnonymousId: jest.fn(() => Promise.resolve('test-anon')),
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

    expect(dto?.target_id).toBe('lifecycle|unknown|none|app_open');
    expect(dto?.target_name).toBe('Aplicacion abierta');
  });

  it('mantiene displayName explicito y construye signalFoxId para modales sin id explicito', async () => {
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

    expect(dto?.target_id).toBe('modal|unknown|none|modal_open');
    expect(dto?.target_name).toBe('RevenueCat Paywall');
  });
});
