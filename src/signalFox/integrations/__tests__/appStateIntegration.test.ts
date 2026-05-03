let mockCurrentState: string = 'active';
let mockAppStateChangeListener: ((nextState: string) => void) | null = null;

jest.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mockCurrentState;
    },
    addEventListener: jest.fn(
      (_event: string, listener: (nextState: string) => void) => {
        mockAppStateChangeListener = listener;
        return { remove: jest.fn() };
      }
    ),
  },
  Platform: {
    OS: 'ios',
  },
}));

import { appStateIntegration } from '../appStateIntegration';
import { AppState } from 'react-native';

describe('appStateIntegration bootstrap lifecycle', () => {
  beforeEach(() => {
    mockCurrentState = 'active';
    mockAppStateChangeListener = null;
    (AppState.addEventListener as jest.Mock).mockClear();
  });

  it('emite app_open + session_start si arranca ya en active', () => {
    const trackEvent = jest.fn();
    const flush = jest.fn(() => Promise.resolve());
    const integration = appStateIntegration();

    integration.setup({ trackEvent, flush } as any, {} as any);

    expect(trackEvent).toHaveBeenNthCalledWith(1, { type: 'app_open' });
    expect(trackEvent).toHaveBeenNthCalledWith(2, { type: 'session_start' });
  });

  it('si arranca no-active, emite app_open + session_start al primer active', () => {
    mockCurrentState = 'unknown';
    const trackEvent = jest.fn();
    const flush = jest.fn(() => Promise.resolve());
    const integration = appStateIntegration();

    integration.setup({ trackEvent, flush } as any, {} as any);
    expect(trackEvent).not.toHaveBeenCalled();

    mockAppStateChangeListener?.('active');

    expect(trackEvent).toHaveBeenNthCalledWith(1, { type: 'app_open' });
    expect(trackEvent).toHaveBeenNthCalledWith(2, { type: 'session_start' });
  });

  it('renueva engagement session antes de app_foreground tras 30 minutos en background', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000);
    nowSpy.mockReturnValueOnce(1_000 + 30 * 60 * 1000);

    const trackEvent = jest.fn();
    const renewEngagementSession = jest.fn();
    const flush = jest.fn(() => Promise.resolve());
    const integration = appStateIntegration();

    integration.setup(
      { trackEvent, renewEngagementSession, flush } as any,
      {} as any
    );
    trackEvent.mockClear();

    mockAppStateChangeListener?.('background');
    mockAppStateChangeListener?.('active');

    expect(renewEngagementSession).toHaveBeenCalledTimes(1);
    const renewCallOrder =
      renewEngagementSession.mock.invocationCallOrder[0] ?? 0;
    const foregroundCallOrder = trackEvent.mock.invocationCallOrder[2] ?? 0;
    expect(renewCallOrder).toBeLessThan(foregroundCallOrder);
    expect(trackEvent).toHaveBeenNthCalledWith(1, { type: 'app_background' });
    expect(trackEvent).toHaveBeenNthCalledWith(2, { type: 'session_end' });
    expect(trackEvent).toHaveBeenNthCalledWith(3, { type: 'app_foreground' });
    expect(trackEvent).toHaveBeenNthCalledWith(4, { type: 'session_start' });

    nowSpy.mockRestore();
  });
});
