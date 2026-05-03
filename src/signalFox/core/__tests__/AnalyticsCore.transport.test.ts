jest.mock('../../../NativeSignalfoxReactNative', () => ({
  default: {
    getAppVersion: jest.fn(() => Promise.resolve('1.0.0')),
    getAnonymousId: jest.fn(() => Promise.resolve('test-anon')),
    startNativePurchaseAnalytics: jest.fn(() => Promise.resolve()),
    stopNativePurchaseAnalytics: jest.fn(() => Promise.resolve()),
    reconcileNativePurchases: jest.fn(() => Promise.resolve()),
  },
}));

import { AnalyticsCore } from '../AnalyticsCore';
import { sendEvents, SignalFoxRequestError } from '../../api/signalFoxApi';

jest.mock('../../api/signalFoxApi', () => {
  const actual = jest.requireActual<typeof import('../../api/signalFoxApi')>(
    '../../api/signalFoxApi'
  );
  return {
    ...actual,
    sendEvents: jest.fn(),
  };
});

const mockedSendEvents = sendEvents as jest.MockedFunction<typeof sendEvents>;

describe('AnalyticsCore transport failures', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedSendEvents.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('disables transport and drops queue on permanent HTTP error (401)', async () => {
    mockedSendEvents.mockRejectedValue(
      new SignalFoxRequestError(401, 'Unauthorized')
    );

    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 5,
    });
    core.startSession();
    core.track('ev1', { a: 1 });
    core.track('ev2', { b: 2 });
    await jest.runAllTimersAsync();

    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);

    core.track('ev3', {});
    await jest.runAllTimersAsync();
    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
  });

  it('retries after 429 then sends', async () => {
    mockedSendEvents
      .mockRejectedValueOnce(new SignalFoxRequestError(429, 'Too Many'))
      .mockResolvedValueOnce(undefined);

    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();
    core.track('x', {});
    await jest.runAllTimersAsync();

    await core.flush();
    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(2);
  });

  it('retries after generic network error', async () => {
    mockedSendEvents
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);

    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();
    core.track('x', {});
    await jest.runAllTimersAsync();

    await core.flush();
    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(2);
  });
});
