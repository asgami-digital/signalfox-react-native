import {
  expoRouterIntegration,
  EXPO_ROUTER_INTEGRATION_NAME,
} from '../expoRouterIntegration';

type ListenerMap = Record<string, Array<(event?: unknown) => void>>;

function createNavigationRef(
  stateRef: { current: unknown },
  optionsRef: { current: unknown }
) {
  const listeners: ListenerMap = {};

  const addListener = (
    eventName: string,
    listener: (event?: unknown) => void
  ) => {
    listeners[eventName] ??= [];
    listeners[eventName].push(listener);
    return () => {
      listeners[eventName] = (listeners[eventName] ?? []).filter(
        (candidate) => candidate !== listener
      );
    };
  };

  return {
    ref: {
      current: {
        getRootState: () => stateRef.current,
        isReady: () => true,
        getCurrentOptions: () => optionsRef.current,
        addListener,
      },
      getCurrentOptions: () => optionsRef.current,
      addListener,
    },
    emit(eventName: string, event?: unknown) {
      for (const listener of listeners[eventName] ?? []) {
        listener(event);
      }
    },
  };
}

describe('expoRouterIntegration', () => {
  it('uses React Navigation logic and emits screen_view with intent timestamp', () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);

    const stateRef = {
      current: {
        type: 'stack',
        index: 0,
        routes: [{ name: 'index', key: 'index-key' }],
      },
    };
    const optionsRef = {
      current: undefined as unknown,
    };
    const navigation = createNavigationRef(stateRef, optionsRef);

    const core = {
      flush: jest.fn(),
      trackEvent: jest.fn(),
      track: jest.fn(),
      trackStep: jest.fn(),
      trackSubview: jest.fn(),
      markNavigationIntentPending: jest.fn(),
      clearNavigationIntentPending: jest.fn(),
      setNavigationIntentTimeoutListener: jest.fn(),
    };

    const integration = expoRouterIntegration({
      navigationRef: navigation.ref,
    });

    expect(integration.name).toBe(EXPO_ROUTER_INTEGRATION_NAME);

    const cleanup = integration.setup(core);

    stateRef.current = {
      type: 'stack',
      index: 1,
      routes: [
        { name: 'index', key: 'index-key' },
        { name: 'purchase', key: 'purchase-key' },
      ],
    };

    navigation.emit('__unsafe_action__', {
      data: { action: { type: 'NAVIGATE' } },
    });
    navigation.emit('state');

    expect(core.trackEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'screen_view',
        timestamp: 2000,
        payload: expect.objectContaining({
          screen_name: 'purchase',
          previous_screen_name: 'index',
          navigator_context: expect.objectContaining({
            root_navigator: 'stack',
            stack_path: ['index', 'purchase'],
          }),
        }),
      })
    );

    cleanup();
    jest.restoreAllMocks();
  });
});
