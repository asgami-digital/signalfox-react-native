import {
  REACT_NATIVE_IAP_ANALYTICS_INTEGRATION_NAME,
  reactNativeIapIntegration,
} from '../reactNativeIapIntegration';

describe('reactNativeIapIntegration', () => {
  it('emite started, cancelled, failed, completed y restore_completed al parchear useIAP', async () => {
    let receivedOptions: Record<string, unknown> | undefined;

    const reactNativeIapModule = {
      ErrorCode: {
        UserCancelled: 'user-cancelled',
      },
      useIAP: jest.fn((options?: Record<string, unknown>) => {
        receivedOptions = options;
        return {
          availablePurchases: [{ productId: 'pro_yearly' }],
          requestPurchase: jest.fn(async () => undefined),
          restorePurchases: jest.fn(async () => undefined),
        };
      }),
    };

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

    const integration = reactNativeIapIntegration({
      reactNativeIap: reactNativeIapModule,
    });

    expect(integration.name).toBe(REACT_NATIVE_IAP_ANALYTICS_INTEGRATION_NAME);

    const cleanup = integration.setup(core as any);
    const hookResult = reactNativeIapModule.useIAP({}) as Record<
      string,
      unknown
    >;

    await (hookResult.requestPurchase as Function)({
      request: { apple: { sku: 'pro_monthly' } },
      type: 'subs',
    });

    (receivedOptions?.onPurchaseError as Function)?.({
      code: 'user-cancelled',
      message: 'cancelled by user',
      productId: 'pro_monthly',
    });

    (receivedOptions?.onPurchaseError as Function)?.({
      code: 'network-error',
      message: 'backend timeout',
      productId: 'pro_monthly',
    });

    (receivedOptions?.onPurchaseSuccess as Function)?.({
      productId: 'pro_monthly',
      transactionId: 'tx_123',
    });

    await (hookResult.restorePurchases as Function)();

    expect(core.trackEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'purchase_started',
        payload: expect.objectContaining({
          productId: 'pro_monthly',
          store: 'app_store',
        }),
      })
    );

    expect(core.trackEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'purchase_cancelled',
        payload: expect.objectContaining({
          productId: 'pro_monthly',
        }),
      })
    );

    expect(core.trackEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: 'purchase_failed',
        payload: expect.objectContaining({
          productId: 'pro_monthly',
          errorCode: 'network-error',
        }),
      })
    );

    expect(core.trackEvent).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        type: 'purchase_completed',
        payload: expect.objectContaining({
          productId: 'pro_monthly',
          transactionId: 'tx_123',
        }),
      })
    );

    expect(core.trackEvent).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        type: 'restore_completed',
        payload: expect.objectContaining({
          restoredProductIds: ['pro_yearly'],
        }),
      })
    );

    cleanup();
  });

  it('emite purchase_started via Nitro cuando los exports publicos son inmutables', async () => {
    const remove = jest.fn();
    const purchaseUpdatedListener = jest.fn(() => ({ remove }));
    const purchaseErrorListener = jest.fn(() => ({ remove }));
    const nitroRequestPurchase = jest.fn(async () => undefined);
    const nitroModules = {
      createHybridObject: jest.fn((name: string) => {
        if (name === 'RnIap') {
          return {
            requestPurchase: nitroRequestPurchase,
          };
        }
        return {};
      }),
    };

    jest.doMock(
      'react-native-nitro-modules',
      () => ({
        NitroModules: nitroModules,
      }),
      { virtual: true }
    );

    const immutableModule: Record<string, unknown> = {
      ErrorCode: {
        UserCancelled: 'user-cancelled',
      },
    };

    Object.defineProperty(immutableModule, 'requestPurchase', {
      configurable: false,
      enumerable: true,
      get: () =>
        jest.fn(async () => {
          const hybridObject = nitroModules.createHybridObject(
            'RnIap'
          ) as Record<string, unknown>;
          await (hybridObject.requestPurchase as Function)({
            ios: { sku: 'pro_monthly' },
          });
        }),
    });

    Object.defineProperty(immutableModule, 'useIAP', {
      configurable: false,
      enumerable: true,
      get: () =>
        jest.fn(() => ({
          requestPurchase: async () => {
            const hybridObject = nitroModules.createHybridObject(
              'RnIap'
            ) as Record<string, unknown>;
            await (hybridObject.requestPurchase as Function)({
              ios: { sku: 'pro_monthly' },
            });
          },
        })),
    });

    Object.defineProperty(immutableModule, 'purchaseUpdatedListener', {
      configurable: false,
      enumerable: true,
      get: () => purchaseUpdatedListener,
    });

    Object.defineProperty(immutableModule, 'purchaseErrorListener', {
      configurable: false,
      enumerable: true,
      get: () => purchaseErrorListener,
    });

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

    const integration = reactNativeIapIntegration({
      reactNativeIap: immutableModule,
    });

    const cleanup = integration.setup(core as any);
    const hookResult = (immutableModule.useIAP as Function)({}) as Record<
      string,
      unknown
    >;

    await (hookResult.requestPurchase as Function)({
      request: { apple: { sku: 'pro_monthly' } },
      type: 'subs',
    });

    expect(core.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'purchase_started',
        payload: expect.objectContaining({
          productId: 'pro_monthly',
          store: 'app_store',
        }),
      })
    );

    cleanup();
  });

  it('emite restore_completed via Nitro cuando useIAP es inmutable en iOS', async () => {
    jest.resetModules();

    const remove = jest.fn();
    const purchaseUpdatedListener = jest.fn(() => ({ remove }));
    const purchaseErrorListener = jest.fn(() => ({ remove }));
    const syncIOS = jest.fn(async () => true);
    const getAvailablePurchases = jest.fn(async () => [
      { productId: 'pro_monthly' },
      { productId: 'pro_yearly' },
    ]);
    const nitroModules = {
      createHybridObject: jest.fn((name: string) => {
        if (name === 'RnIap') {
          return {
            syncIOS,
            getAvailablePurchases,
          };
        }
        return {};
      }),
    };

    jest.doMock(
      'react-native-nitro-modules',
      () => ({
        NitroModules: nitroModules,
      }),
      { virtual: true }
    );

    const immutableModule: Record<string, unknown> = {
      ErrorCode: {
        UserCancelled: 'user-cancelled',
      },
    };

    Object.defineProperty(immutableModule, 'useIAP', {
      configurable: false,
      enumerable: true,
      get: () =>
        jest.fn(() => ({
          restorePurchases: async () => {
            const hybridObject = nitroModules.createHybridObject(
              'RnIap'
            ) as Record<string, unknown>;
            await (hybridObject.syncIOS as Function)();
            await (hybridObject.getAvailablePurchases as Function)({
              alsoPublishToEventListenerIOS: false,
              onlyIncludeActiveItemsIOS: true,
            });
          },
        })),
    });

    Object.defineProperty(immutableModule, 'requestPurchase', {
      configurable: false,
      enumerable: true,
      get: () => jest.fn(async () => undefined),
    });

    Object.defineProperty(immutableModule, 'purchaseUpdatedListener', {
      configurable: false,
      enumerable: true,
      get: () => purchaseUpdatedListener,
    });

    Object.defineProperty(immutableModule, 'purchaseErrorListener', {
      configurable: false,
      enumerable: true,
      get: () => purchaseErrorListener,
    });

    const { reactNativeIapIntegration: freshReactNativeIapIntegration } =
      require('../reactNativeIapIntegration') as typeof import('../reactNativeIapIntegration');

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

    const integration = freshReactNativeIapIntegration({
      reactNativeIap: immutableModule,
    });

    const cleanup = integration.setup(core as any);
    const hookResult = (immutableModule.useIAP as Function)({}) as Record<
      string,
      unknown
    >;

    await (hookResult.restorePurchases as Function)();

    expect(core.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'restore_completed',
        payload: expect.objectContaining({
          restoredProductIds: ['pro_monthly', 'pro_yearly'],
          store: 'app_store',
        }),
      })
    );

    cleanup();
  });

  it('deduplica purchase_completed repetido con el mismo transactionId', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    let purchaseUpdatedCallback:
      | ((purchase: Record<string, unknown>) => void)
      | undefined;

    const reactNativeIapModule = {
      purchaseUpdatedListener: jest.fn(
        (listener: (purchase: Record<string, unknown>) => void) => {
          purchaseUpdatedCallback = listener;
          return { remove: jest.fn() };
        }
      ),
      purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
      requestPurchase: jest.fn(async () => undefined),
      useIAP: jest.fn(),
    };

    Object.defineProperty(reactNativeIapModule, 'requestPurchase', {
      configurable: false,
      enumerable: true,
      get: () => jest.fn(async () => undefined),
    });

    Object.defineProperty(reactNativeIapModule, 'useIAP', {
      configurable: false,
      enumerable: true,
      get: () => jest.fn(() => ({})),
    });

    Object.defineProperty(reactNativeIapModule, 'purchaseUpdatedListener', {
      configurable: false,
      enumerable: true,
      get: () =>
        jest.fn((listener: (purchase: Record<string, unknown>) => void) => {
          purchaseUpdatedCallback = listener;
          return { remove: jest.fn() };
        }),
    });

    Object.defineProperty(reactNativeIapModule, 'purchaseErrorListener', {
      configurable: false,
      enumerable: true,
      get: () => jest.fn(() => ({ remove: jest.fn() })),
    });

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

    const integration = reactNativeIapIntegration({
      reactNativeIap: reactNativeIapModule,
    });

    const cleanup = integration.setup(core as any);

    purchaseUpdatedCallback?.({
      productId: 'pro_monthly',
      transactionId: 'tx_123',
    });

    dateNowSpy.mockReturnValue(4000);

    purchaseUpdatedCallback?.({
      productId: 'pro_monthly',
      transactionId: 'tx_123',
    });

    expect(
      core.trackEvent.mock.calls.filter(
        ([event]) => event?.type === 'purchase_completed'
      )
    ).toHaveLength(1);

    cleanup();
    dateNowSpy.mockRestore();
  });
});
