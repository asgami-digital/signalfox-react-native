import { destroy, init, trackModalShown } from '../SignalFox';

const mockInit = jest.fn().mockResolvedValue(undefined);
const mockStartSession = jest.fn();
const mockStartFlushTimer = jest.fn();
const mockDestroy = jest.fn();
const mockSetupCalls: string[] = [];

jest.mock('../../core/AnalyticsCore', () => ({
  AnalyticsCore: jest.fn().mockImplementation(() => ({
    init: mockInit,
    startSession: mockStartSession,
    startFlushTimer: mockStartFlushTimer,
    destroy: mockDestroy,
    track: jest.fn(),
    trackFunnelStep: jest.fn(),
    trackSubview: jest.fn(),
    trackEvent: jest.fn(),
    sendEvent: jest.fn(),
  })),
}));

jest.mock('../../integrations/appStateIntegration', () => ({
  appStateIntegration: jest.fn(() => ({
    name: 'appState',
    setup: jest.fn(() => {
      mockSetupCalls.push('appState');
      return jest.fn();
    }),
  })),
}));

jest.mock('../../integrations/reactNativeModalPatch', () => ({
  reactNativeModalPatchIntegration: jest.fn(() => ({
    name: 'reactNativeModalPatch',
    setup: jest.fn(() => {
      mockSetupCalls.push('reactNativeModalPatch');
      return jest.fn();
    }),
  })),
}));

jest.mock('../../integrations/reactNativeTouchablePatch', () => ({
  reactNativeTouchablePatchIntegration: jest.fn(() => ({
    name: 'reactNativeTouchablePatch',
    setup: jest.fn(() => {
      mockSetupCalls.push('reactNativeTouchablePatch');
      return jest.fn();
    }),
  })),
}));

const mockTrackModalShownBridge = jest.fn();

jest.mock('../../purchase/purchaseAnalyticsBridge', () => ({
  trackModalShown: (...args: unknown[]) => mockTrackModalShownBridge(...args),
}));

describe('SignalFox.init (imperative)', () => {
  beforeEach(() => {
    destroy();
    mockInit.mockClear();
    mockStartSession.mockClear();
    mockStartFlushTimer.mockClear();
    mockDestroy.mockClear();
    mockTrackModalShownBridge.mockClear();
    mockSetupCalls.length = 0;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    destroy();
    jest.restoreAllMocks();
  });

  it('registers internal integrations alongside user integrations', async () => {
    const customSetup = jest.fn(() => jest.fn());
    const customIntegration = {
      name: 'customIntegration',
      setup: customSetup,
    };

    await init({
      apiKey: 'ak_dev__test',
      integrations: [customIntegration],
    });

    expect(mockSetupCalls).toEqual([
      'appState',
      'reactNativeModalPatch',
      'reactNativeTouchablePatch',
    ]);
    expect(customSetup).toHaveBeenCalledTimes(1);
  });

  it('deduplicates internal integrations if they are passed explicitly', async () => {
    const duplicateAppState = {
      name: 'appState',
      setup: jest.fn(() => jest.fn()),
    };
    const duplicateModal = {
      name: 'reactNativeModalPatch',
      setup: jest.fn(() => jest.fn()),
    };
    const duplicateTouchable = {
      name: 'reactNativeTouchablePatch',
      setup: jest.fn(() => jest.fn()),
    };

    await init({
      apiKey: 'ak_dev__test',
      integrations: [duplicateAppState, duplicateModal, duplicateTouchable],
    });

    expect(mockSetupCalls).toEqual([
      'appState',
      'reactNativeModalPatch',
      'reactNativeTouchablePatch',
    ]);
    expect(duplicateAppState.setup).not.toHaveBeenCalled();
    expect(duplicateModal.setup).not.toHaveBeenCalled();
    expect(duplicateTouchable.setup).not.toHaveBeenCalled();
  });

  it('forwards trackModalShown to the purchase bridge', async () => {
    await init({ apiKey: 'ak_dev__test' });

    trackModalShown({
      signalFoxNodeId: 'export-sheet',
      visible: true,
    });

    expect(mockTrackModalShownBridge).toHaveBeenCalledWith({
      signalFoxNodeId: 'export-sheet',
      visible: true,
    });
  });

  it('does not run setup twice for the same configuration', async () => {
    await init({ apiKey: 'ak_dev__test', logOnly: true });
    await init({ apiKey: 'ak_dev__test', logOnly: true });

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockStartSession).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent init with the same configuration', async () => {
    const a = init({ apiKey: 'ak_dev__same', logOnly: false });
    const b = init({ apiKey: 'ak_dev__same', logOnly: false });
    await Promise.all([a, b]);

    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it('ignores a second init with a different configuration', async () => {
    await init({ apiKey: 'ak_dev__first' });
    await init({ apiKey: 'ak_dev__second' });

    expect(console.warn).toHaveBeenCalled();
    expect(mockInit).toHaveBeenCalledTimes(1);
  });
});
