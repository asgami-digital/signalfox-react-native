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
});
