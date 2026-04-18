import TestRenderer, { act } from 'react-test-renderer';
import { SignalFoxProvider } from '../SignalFoxProvider';

const mockInit = jest.fn().mockResolvedValue(undefined);
const mockStartSession = jest.fn();
const mockStartFlushTimer = jest.fn();
const mockDestroy = jest.fn();
const mockTrack = jest.fn();
const mockTrackStep = jest.fn();
const mockTrackSubview = jest.fn();
const mockTrackEvent = jest.fn();
const mockSendEvent = jest.fn();

const mockSetupCalls: string[] = [];

jest.mock('../../core/AnalyticsCore', () => ({
  AnalyticsCore: jest.fn().mockImplementation(() => ({
    init: mockInit,
    startSession: mockStartSession,
    startFlushTimer: mockStartFlushTimer,
    destroy: mockDestroy,
    track: mockTrack,
    trackStep: mockTrackStep,
    trackSubview: mockTrackSubview,
    trackEvent: mockTrackEvent,
    sendEvent: mockSendEvent,
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

describe('SignalFoxProvider internal integrations', () => {
  beforeEach(() => {
    mockInit.mockClear();
    mockStartSession.mockClear();
    mockStartFlushTimer.mockClear();
    mockDestroy.mockClear();
    mockTrack.mockClear();
    mockTrackStep.mockClear();
    mockTrackSubview.mockClear();
    mockTrackEvent.mockClear();
    mockSendEvent.mockClear();
    mockSetupCalls.length = 0;
  });

  it('always registers internal integrations alongside user integrations', async () => {
    const customSetup = jest.fn(() => jest.fn());
    const customIntegration = {
      name: 'customIntegration',
      setup: customSetup,
    };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SignalFoxProvider apiKey="ak_dev__test" integrations={[customIntegration]}>
          <></>
        </SignalFoxProvider>
      );
      await Promise.resolve();
    });

    expect(mockSetupCalls).toEqual([
      'appState',
      'reactNativeModalPatch',
      'reactNativeTouchablePatch',
    ]);
    expect(customSetup).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer!.unmount();
    });
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

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SignalFoxProvider
          apiKey="ak_dev__test"
          integrations={[duplicateAppState, duplicateModal, duplicateTouchable]}
        >
          <></>
        </SignalFoxProvider>
      );
      await Promise.resolve();
    });

    expect(mockSetupCalls).toEqual([
      'appState',
      'reactNativeModalPatch',
      'reactNativeTouchablePatch',
    ]);
    expect(duplicateAppState.setup).not.toHaveBeenCalled();
    expect(duplicateModal.setup).not.toHaveBeenCalled();
    expect(duplicateTouchable.setup).not.toHaveBeenCalled();

    await act(async () => {
      renderer!.unmount();
    });
  });
});
