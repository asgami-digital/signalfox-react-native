import {
  modalStackPush,
  resetModalStack,
  getModalStackSnapshot,
} from '../../core/modalStack';
import {
  reactNavigationIntegration,
  type NavigationRefLike,
  type ReactNavigationIntegrationOptions,
} from '../reactNavigationIntegration';
import type { ExpoRouterIntegrationOptions } from '../expoRouterIntegration';

function expectTypeToBeTrue<T extends true>(value: T) {
  expect(value).toBe(true);
}

expectTypeToBeTrue<
  'getRoutePresentation' extends keyof ReactNavigationIntegrationOptions
    ? false
    : true
>(true);
expectTypeToBeTrue<
  'getRoutePresentation' extends keyof ExpoRouterIntegrationOptions
    ? false
    : true
>(true);

type ListenerMap = Record<string, Array<(event?: unknown) => void>>;

type NavigationHarness = {
  emit(eventName: string, event?: unknown): void;
  navigationRef: NavigationRefLike & {
    current: NonNullable<NavigationRefLike['current']> & {
      addListener: (
        eventName: string,
        listener: (event?: unknown) => void
      ) => () => void;
    };
  };
  optionsRef: { current: unknown };
  stateRef: { current: unknown };
};

function createNavigationHarness(): NavigationHarness {
  const listeners: ListenerMap = {};
  const stateRef = {
    current: {
      type: 'stack',
      index: 0,
      routes: [{ name: 'Home', key: 'home-key' }],
    },
  };
  const optionsRef = {
    current: undefined as unknown,
  };

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
    navigationRef: {
      current: {
        getRootState: () => stateRef.current,
        isReady: () => true,
        getCurrentOptions: () => optionsRef.current,
        addListener,
      },
      getCurrentOptions: () => optionsRef.current,
      addListener,
    },
    optionsRef,
    stateRef,
    emit(eventName: string, event?: unknown) {
      for (const listener of listeners[eventName] ?? []) {
        listener(event);
      }
    },
  };
}

function createCoreMock() {
  return {
    flush: jest.fn(),
    trackEvent: jest.fn(),
    track: jest.fn(),
    trackStep: jest.fn(),
    trackSubview: jest.fn(),
    markNavigationIntentPending: jest.fn(),
    clearNavigationIntentPending: jest.fn(),
    setNavigationIntentTimeoutListener: jest.fn(),
  };
}

function getEventsByType(trackEvent: jest.Mock, type: string) {
  return trackEvent.mock.calls
    .map(([event]) => event)
    .filter((event) => event?.type === type);
}

function navigate(
  harness: NavigationHarness,
  params: {
    options?: Record<string, unknown>;
    state: unknown;
    type?: string;
  }
) {
  harness.stateRef.current = params.state;
  harness.optionsRef.current = params.options;
  harness.emit('__unsafe_action__', {
    data: { action: { type: params.type ?? 'NAVIGATE' } },
  });
  harness.emit('state');
}

describe('reactNavigationIntegration', () => {
  afterEach(() => {
    resetModalStack();
    jest.restoreAllMocks();
  });

  it('detects opening and closing of navigation modals from getCurrentOptions()', () => {
    const harness = createNavigationHarness();
    const core = createCoreMock();
    const cleanup = reactNavigationIntegration({
      navigationRef: harness.navigationRef,
    }).setup(core as any);

    expect(getEventsByType(core.trackEvent, 'screen_view')).toHaveLength(1);

    navigate(harness, {
      state: {
        type: 'stack',
        index: 1,
        routes: [
          { name: 'Home', key: 'home-key' },
          { name: 'ProfileModal', key: 'profile-modal-key' },
        ],
      },
      options: { presentation: 'modal' },
    });

    const modalOpenEvents = getEventsByType(core.trackEvent, 'modal_open');
    expect(modalOpenEvents).toHaveLength(1);
    expect(modalOpenEvents[0]).toEqual(
      expect.objectContaining({
        signalFoxId: 'ProfileModal',
        payload: expect.objectContaining({
          source: 'react_navigation',
          presentation: 'modal',
          parent_modal: null,
        }),
      })
    );
    expect(getModalStackSnapshot()).toEqual([
      expect.objectContaining({
        id: 'ProfileModal',
        stackKey: 'profile-modal-key',
        source: 'react_navigation',
      }),
    ]);

    const screenViewsAfterOpen = getEventsByType(
      core.trackEvent,
      'screen_view'
    );
    expect(screenViewsAfterOpen[1]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          screen_name: 'ProfileModal',
          previous_screen_name: 'Home',
          navigator_context: expect.objectContaining({
            presentation: 'modal',
            parent_modal: 'ProfileModal',
          }),
        }),
      })
    );

    navigate(harness, {
      state: {
        type: 'stack',
        index: 0,
        routes: [{ name: 'Home', key: 'home-key' }],
      },
      options: undefined,
      type: 'GO_BACK',
    });

    const modalCloseEvents = getEventsByType(core.trackEvent, 'modal_close');
    expect(modalCloseEvents).toHaveLength(1);
    expect(modalCloseEvents[0]).toEqual(
      expect.objectContaining({
        signalFoxId: 'ProfileModal',
        payload: expect.objectContaining({
          source: 'react_navigation',
          parent_modal: null,
          currentScreen: 'Home',
        }),
      })
    );
    expect(getModalStackSnapshot()).toEqual([]);

    cleanup();
  });

  it('coexists with a native modal underneath and preserves the real parent_modal', () => {
    modalStackPush({
      id: 'native-paywall',
      source: 'react_native_modal',
    });

    const harness = createNavigationHarness();
    const core = createCoreMock();
    const cleanup = reactNavigationIntegration({
      navigationRef: harness.navigationRef,
    }).setup(core as any);

    navigate(harness, {
      state: {
        type: 'stack',
        index: 1,
        routes: [
          { name: 'Home', key: 'home-key' },
          { name: 'CheckoutModal', key: 'checkout-modal-key' },
        ],
      },
      options: { presentation: 'transparentModal' },
    });

    const modalOpenEvent = getEventsByType(core.trackEvent, 'modal_open')[0];
    expect(modalOpenEvent).toEqual(
      expect.objectContaining({
        signalFoxId: 'CheckoutModal',
        payload: expect.objectContaining({
          parent_modal: 'native-paywall',
          presentation: 'transparentModal',
        }),
      })
    );
    expect(getModalStackSnapshot()).toEqual([
      expect.objectContaining({
        id: 'native-paywall',
        source: 'react_native_modal',
      }),
      expect.objectContaining({
        id: 'CheckoutModal',
        source: 'react_navigation',
      }),
    ]);

    navigate(harness, {
      state: {
        type: 'stack',
        index: 0,
        routes: [{ name: 'Home', key: 'home-key' }],
      },
      options: undefined,
      type: 'GO_BACK',
    });

    const modalCloseEvent = getEventsByType(core.trackEvent, 'modal_close')[0];
    expect(modalCloseEvent).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          parent_modal: 'native-paywall',
        }),
      })
    );
    expect(getModalStackSnapshot()).toEqual([
      expect.objectContaining({
        id: 'native-paywall',
        source: 'react_native_modal',
      }),
    ]);

    cleanup();
  });

  it('apila y desapila navigation modals sobre otros navigation modals sin duplicar aperturas', () => {
    const harness = createNavigationHarness();
    const core = createCoreMock();
    const cleanup = reactNavigationIntegration({
      navigationRef: harness.navigationRef,
    }).setup(core as any);

    navigate(harness, {
      state: {
        type: 'stack',
        index: 1,
        routes: [
          { name: 'Home', key: 'home-key' },
          { name: 'ModalA', key: 'modal-a-key' },
        ],
      },
      options: { presentation: 'modal' },
    });

    navigate(harness, {
      state: {
        type: 'stack',
        index: 2,
        routes: [
          { name: 'Home', key: 'home-key' },
          { name: 'ModalA', key: 'modal-a-key' },
          { name: 'ModalB', key: 'modal-b-key' },
        ],
      },
      options: { presentation: 'modal' },
    });

    const modalOpenEvents = getEventsByType(core.trackEvent, 'modal_open');
    expect(modalOpenEvents).toHaveLength(2);
    expect(modalOpenEvents[1]).toEqual(
      expect.objectContaining({
        signalFoxId: 'ModalB',
        payload: expect.objectContaining({
          parent_modal: 'ModalA',
        }),
      })
    );
    expect(getModalStackSnapshot()).toEqual([
      expect.objectContaining({
        id: 'ModalA',
        source: 'react_navigation',
      }),
      expect.objectContaining({
        id: 'ModalB',
        source: 'react_navigation',
      }),
    ]);

    navigate(harness, {
      state: {
        type: 'stack',
        index: 1,
        routes: [
          { name: 'Home', key: 'home-key' },
          { name: 'ModalA', key: 'modal-a-key' },
        ],
      },
      options: { presentation: 'modal' },
      type: 'GO_BACK',
    });

    const modalCloseEvents = getEventsByType(core.trackEvent, 'modal_close');
    expect(modalCloseEvents).toHaveLength(1);
    expect(modalCloseEvents[0]).toEqual(
      expect.objectContaining({
        signalFoxId: 'ModalB',
        payload: expect.objectContaining({
          parent_modal: 'ModalA',
          currentScreen: 'ModalA',
        }),
      })
    );
    expect(getModalStackSnapshot()).toEqual([
      expect.objectContaining({
        id: 'ModalA',
        source: 'react_navigation',
      }),
    ]);

    cleanup();
  });
});
