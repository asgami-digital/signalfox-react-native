jest.mock('../../../NativeSignalfoxReactNative', () => ({
  default: {
    getAppVersion: jest.fn(() => Promise.resolve('1.0.0')),
    getAnonymousId: jest.fn(() => Promise.resolve('test-anon')),
    getDeviceModel: jest.fn(() => Promise.resolve('jest-device')),
    getOsVersion: jest.fn(() => Promise.resolve('jest-os')),
  },
}));

import { AnalyticsCore } from '../AnalyticsCore';
import { modalStackPush, resetModalStack } from '../modalStack';
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

function isoToMs(iso: string | null | undefined): number {
  if (iso == null || iso === '') return NaN;
  return new Date(iso).getTime();
}

describe('AnalyticsCore purchase flow timestamps', () => {
  beforeEach(() => {
    mockedSendEvents.mockClear();
    resetModalStack();
  });

  afterEach(() => {
    resetModalStack();
  });

  it('retrocede purchase_completed 10 ms antes del primer evento intermedio', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    core.trackEvent({
      type: 'purchase_started',
      timestamp: 1_700_000_000_000,
      payload: {},
    } as any);
    core.trackEvent({
      type: 'screen_view',
      timestamp: 1_700_000_000_100,
      payload: { screen_name: 'Premium' },
    } as any);
    core.trackEvent({
      type: 'purchase_completed',
      timestamp: 1_700_000_000_500,
      payload: {},
    } as any);

    await core.flush();

    expect(mockedSendEvents).toHaveBeenCalledTimes(1);
    const batch = mockedSendEvents.mock.calls[0]![0];
    const events = batch.events as Array<{
      event_name?: string;
      event_timestamp?: string | null;
    }>;
    const completed = events.find((e) => e.event_name === 'purchase_completed');
    expect(completed).toBeDefined();
    expect(isoToMs(completed!.event_timestamp)).toBe(1_700_000_000_090);
  });

  it('if -10 ms falls before started, it uses the midpoint between started and the intermediate event', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    const t0 = 1_700_000_000_000;
    core.trackEvent({
      type: 'purchase_started',
      timestamp: t0,
      payload: {},
    } as any);
    core.trackEvent({
      type: 'component_press',
      timestamp: t0 + 5,
      payload: {},
      signalFoxId: 'b',
      target_type: 'button',
    } as any);
    core.trackEvent({
      type: 'purchase_failed',
      timestamp: t0 + 200,
      payload: {},
    } as any);

    await core.flush();

    const batch = mockedSendEvents.mock.calls[0]![0];
    const events = batch.events as Array<{
      event_name?: string;
      event_timestamp?: string | null;
    }>;
    const failed = events.find((e) => e.event_name === 'purchase_failed');
    expect(failed).toBeDefined();
    expect(isoToMs(failed!.event_timestamp)).toBe(
      Math.floor((t0 + (t0 + 5)) / 2)
    );
  });

  it('without intermediate events, it keeps the terminal timestamp', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    const tDone = 1_700_000_000_777;
    core.trackEvent({
      type: 'purchase_started',
      timestamp: 1_700_000_000_000,
      payload: {},
    } as any);
    core.trackEvent({
      type: 'purchase_cancelled',
      timestamp: tDone,
      payload: {},
    } as any);

    await core.flush();

    const batch = mockedSendEvents.mock.calls[0]![0];
    const events = batch.events as Array<{
      event_name?: string;
      event_timestamp?: string | null;
    }>;
    const cancelled = events.find((e) => e.event_name === 'purchase_cancelled');
    expect(isoToMs(cancelled!.event_timestamp)).toBe(tDone);
  });

  it('drops purchase terminal events that do not match any purchase_started flow', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    core.trackEvent({
      type: 'screen_view',
      timestamp: 1_700_000_000_000,
      payload: { screen_name: 'Pricing' },
    } as any);
    core.trackEvent({
      type: 'purchase_completed',
      timestamp: 1_700_000_000_100,
      payload: { productId: 'pro_monthly' },
    } as any);

    await core.flush();

    const batch = mockedSendEvents.mock.calls[0]![0];
    const events = batch.events as Array<{
      event_name?: string;
    }>;

    expect(events.map((event) => event.event_name)).toEqual(['screen_view']);
  });

  it('purchase_completed y purchase_failed comparten screen_name y parent_modal del purchase_started', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    core.trackEvent({
      type: 'screen_view',
      timestamp: 1_700_000_000_000,
      payload: { screen_name: 'PaywallHost' },
    } as any);
    modalStackPush('revenuecat-paywall');

    core.trackEvent({
      type: 'purchase_started',
      timestamp: 1_700_000_000_050,
      payload: {},
    } as any);

    resetModalStack();
    core.trackEvent({
      type: 'screen_view',
      timestamp: 1_700_000_000_200,
      payload: { screen_name: 'HomeAfterDismiss' },
    } as any);

    core.trackEvent({
      type: 'purchase_completed',
      timestamp: 1_700_000_000_400,
      payload: {},
    } as any);
    core.trackEvent({
      type: 'purchase_started',
      timestamp: 1_700_000_000_500,
      payload: {},
    } as any);
    core.trackEvent({
      type: 'purchase_failed',
      timestamp: 1_700_000_000_600,
      payload: {},
    } as any);

    await core.flush();

    const batch = mockedSendEvents.mock.calls[0]![0];
    const events = batch.events as Array<{
      event_name?: string;
      screen_name?: string | null;
      parent_modal?: string | null;
    }>;

    const firstStarted = events.find(
      (e) => e.event_name === 'purchase_started'
    );
    const completed = events.find((e) => e.event_name === 'purchase_completed');
    expect(firstStarted?.screen_name).toBe('PaywallHost');
    expect(firstStarted?.parent_modal).toBe('revenuecat-paywall');
    expect(completed?.screen_name).toBe('PaywallHost');
    expect(completed?.parent_modal).toBe('revenuecat-paywall');

    const secondStarted = events.filter(
      (e) => e.event_name === 'purchase_started'
    )[1];
    const failed = events.find((e) => e.event_name === 'purchase_failed');
    expect(secondStarted?.screen_name).toBe('HomeAfterDismiss');
    expect(secondStarted?.parent_modal).toBeNull();
    expect(failed?.screen_name).toBe('HomeAfterDismiss');
    expect(failed?.parent_modal).toBeNull();
  });

  it('reuses the matching purchase_started surface for 10 seconds when another purchase_started overwrote the pending one', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    const t0 = 1_700_000_000_000;
    core.trackEvent({
      type: 'screen_view',
      timestamp: t0,
      payload: { screen_name: 'Pricing' },
    } as any);
    core.trackEvent({
      type: 'purchase_started',
      timestamp: t0 + 50,
      payload: { productId: 'pro_monthly' },
    } as any);

    core.trackEvent({
      type: 'screen_view',
      timestamp: t0 + 100,
      payload: { screen_name: 'Settings' },
    } as any);
    core.trackEvent({
      type: 'purchase_started',
      timestamp: t0 + 150,
      payload: { productId: 'pro_yearly' },
    } as any);

    core.trackEvent({
      type: 'screen_view',
      timestamp: t0 + 200,
      payload: { screen_name: 'Home' },
    } as any);
    core.trackEvent({
      type: 'purchase_completed',
      timestamp: t0 + 500,
      payload: { productId: 'pro_monthly' },
    } as any);

    await core.flush();

    const batch = mockedSendEvents.mock.calls[0]![0];
    const events = batch.events as Array<{
      event_name?: string;
      screen_name?: string | null;
    }>;
    const completed = events.find((e) => e.event_name === 'purchase_completed');
    expect(completed?.screen_name).toBe('Pricing');
  });

  it('resolves delayed purchase_started against the original timestamp surface', async () => {
    const core = new AnalyticsCore({
      apiKey: 'ak_prod_test',
      batchSize: 10,
    });
    core.startSession();

    const t0 = 1_700_000_000_000;
    core.trackEvent({
      type: 'screen_view',
      timestamp: t0,
      payload: { screen_name: 'PaywallHost' },
    } as any);
    core.trackEvent({
      type: 'screen_view',
      timestamp: t0 + 200,
      payload: { screen_name: 'HomeAfterDismiss' },
    } as any);

    modalStackPush('RevenueCat Paywall');
    core.trackEvent({
      type: 'modal_open',
      timestamp: t0 + 50,
      signalFoxDisplayName: 'RevenueCat Paywall',
      target_type: 'modal',
      payload: {
        modalName: 'RevenueCat Paywall',
        source: 'react_native_modal',
        kind: 'component_modal',
      },
    } as any);

    core.trackEvent({
      type: 'purchase_started',
      timestamp: t0 + 100,
      payload: { productId: 'pro_monthly' },
    } as any);

    resetModalStack();
    core.trackEvent({
      type: 'purchase_completed',
      timestamp: t0 + 300,
      payload: { productId: 'pro_monthly' },
    } as any);
    core.trackEvent({
      type: 'custom',
      custom_event_name: 'after_purchase',
      timestamp: t0 + 350,
      payload: {},
    } as any);

    await core.flush();

    const batch = mockedSendEvents.mock.calls[0]![0];
    const events = batch.events as Array<{
      event_name?: string;
      screen_name?: string | null;
      parent_modal?: string | null;
    }>;
    const modalOpen = events.find((e) => e.event_name === 'modal_open');
    const started = events.find((e) => e.event_name === 'purchase_started');
    const completed = events.find((e) => e.event_name === 'purchase_completed');
    const afterPurchase = events.find((e) => e.event_name === 'custom');

    expect(modalOpen?.screen_name).toBe('PaywallHost');
    expect(started?.screen_name).toBe('PaywallHost');
    expect(started?.parent_modal).toBe('RevenueCat Paywall');
    expect(completed?.screen_name).toBe('PaywallHost');
    expect(completed?.parent_modal).toBe('RevenueCat Paywall');
    expect(afterPurchase?.screen_name).toBe('HomeAfterDismiss');
  });
});
