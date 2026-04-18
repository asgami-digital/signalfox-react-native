import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

function getRenderedPaywallNode(
  tree: ReactTestRenderer,
  testID: string
): {
  props: {
    onDismiss?: () => void;
    onPurchaseStarted?: (e: unknown) => void;
    onPurchaseCompleted?: (e: unknown) => void;
    onPurchaseCancelled?: () => void;
    onPurchaseError?: (e: unknown) => void;
    onRestoreCompleted?: (e: unknown) => void;
  };
} {
  return tree.root
    .findAllByProps({ testID })
    .find((node) => typeof node.props.onDismiss === 'function') as {
    props: {
      onDismiss?: () => void;
      onPurchaseStarted?: (e: unknown) => void;
      onPurchaseCompleted?: (e: unknown) => void;
      onPurchaseCancelled?: () => void;
      onPurchaseError?: (e: unknown) => void;
      onRestoreCompleted?: (e: unknown) => void;
    };
  };
}

describe('revenueCatPurchaseAnalytics', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('emite modal_open y modal_close al invocar presentPaywall', async () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();
    const presentPaywall = jest.fn(() => Promise.resolve('PURCHASED'));
    const beginHeuristicPaywallSession = jest.fn(() => Promise.resolve());
    const endHeuristicPaywallSession = jest.fn(() =>
      Promise.resolve({ sawInactiveDuringPaywall: false })
    );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock('../../../NativeSignalfoxReactNative', () => ({
      __esModule: true,
      default: {
        beginHeuristicPaywallSession,
        endHeuristicPaywallSession,
      },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    class RevenueCatUI {}
    (RevenueCatUI as any).presentPaywall = presentPaywall;

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: {},
      revenueCatUI: RevenueCatUI,
    });

    await (RevenueCatUI as any).presentPaywall();

    expect(notifyModalOpened.mock.calls[0]?.[0]).toBe('RevenueCat Paywall');
    expect(notifyModalOpened.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        provider: 'revenuecat',
        trigger: 'revenuecat_ui.presentPaywall',
      })
    );
    expect(notifyModalClosed.mock.calls[0]?.[0]).toBe('RevenueCat Paywall');
    expect(notifyModalClosed.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        provider: 'revenuecat',
        trigger: 'revenuecat_ui.presentPaywall',
      })
    );
    expect(beginHeuristicPaywallSession).toHaveBeenCalledTimes(1);
    expect(endHeuristicPaywallSession).toHaveBeenCalledTimes(1);
    expect(notifyPurchaseStarted).not.toHaveBeenCalled();

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });

  it('emite modal_open y modal_close al montar y descartar RevenueCatUI.Paywall', () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    class RevenueCatUI {}
    (RevenueCatUI as any).Paywall = (props: Record<string, unknown>) =>
      React.createElement('rc-paywall', props);

    const RevenueCatUIMock = RevenueCatUI as unknown as {
      Paywall: React.ComponentType<Record<string, unknown>>;
    };

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: {},
      revenueCatUI: RevenueCatUI,
    });

    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(RevenueCatUIMock.Paywall, { testID: 'paywall' })
      );
    });

    expect(notifyModalOpened.mock.calls[0]?.[0]).toBe('RevenueCat Paywall');
    expect(notifyModalOpened.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        provider: 'revenuecat',
        trigger: 'revenuecat_ui.Paywall',
      })
    );
    expect(notifyModalClosed).not.toHaveBeenCalled();

    act(() => {
      getRenderedPaywallNode(tree, 'paywall').props.onDismiss?.();
    });

    expect(notifyModalClosed.mock.calls[0]?.[0]).toBe('RevenueCat Paywall');
    expect(notifyModalClosed.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        provider: 'revenuecat',
        trigger: 'revenuecat_ui.Paywall.onDismiss',
      })
    );

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });

  it('compone callbacks de RevenueCatUI.Paywall con purchase_* y restore_completed', () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();

    const userOnPurchaseStarted = jest.fn();
    const userOnPurchaseCompleted = jest.fn();

    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    const Purchases = {
      PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 1 },
    };

    class RevenueCatUI {}
    (RevenueCatUI as any).Paywall = (props: Record<string, unknown>) =>
      React.createElement('rc-paywall', props);

    const RevenueCatUIMock = RevenueCatUI as unknown as {
      Paywall: React.ComponentType<Record<string, unknown>>;
    };

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: Purchases,
      revenueCatUI: RevenueCatUI,
    });

    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(RevenueCatUIMock.Paywall, {
          testID: 'paywall',
          onPurchaseStarted: userOnPurchaseStarted,
          onPurchaseCompleted: userOnPurchaseCompleted,
        })
      );
    });

    const paywall = getRenderedPaywallNode(tree, 'paywall');

    act(() => {
      paywall.props.onPurchaseStarted?.({
        packageBeingPurchased: {
          product: { identifier: 'rc_pkg_sku' },
        },
      });
    });

    expect(notifyPurchaseStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'rc_pkg_sku',
        platform: 'android',
        store: 'google_play',
      })
    );
    expect(userOnPurchaseStarted).toHaveBeenCalledTimes(1);

    act(() => {
      paywall.props.onPurchaseCompleted?.({
        transaction: { productIdentifier: 'rc_pkg_sku' },
        storeProduct: { price: 4.99, currencyCode: 'EUR' },
      });
    });

    expect(notifyPurchaseCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'rc_pkg_sku',
        platform: 'android',
        store: 'google_play',
        price: 4.99,
        currency: 'EUR',
      })
    );
    expect(userOnPurchaseCompleted).toHaveBeenCalledTimes(1);

    act(() => {
      paywall.props.onPurchaseCancelled?.();
    });

    expect(notifyPurchaseCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'android',
        store: 'google_play',
      })
    );

    act(() => {
      paywall.props.onRestoreCompleted?.({
        customerInfo: {
          allPurchasedProductIdentifiers: ['a', 'b'],
        },
      });
    });

    expect(notifyRestoreCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'android',
        store: 'google_play',
        restoredProductIds: ['a', 'b'],
      })
    );

    act(() => {
      paywall.props.onPurchaseError?.({
        packageBeingPurchased: {
          product: { identifier: 'x' },
        },
        error: { userCancelled: true },
      });
    });

    expect(notifyPurchaseCancelled).toHaveBeenCalledTimes(2);

    act(() => {
      paywall.props.onPurchaseError?.({
        error: {
          readableErrorCode: 'STORE_PROBLEM',
          message: 'store down',
        },
      });
    });

    expect(notifyPurchaseFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'android',
        store: 'google_play',
        errorCode: 'STORE_PROBLEM',
        errorMessage: 'store down',
      })
    );

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });

  it('emite started y completed cuando una compra de RevenueCat se resuelve', async () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();
    const purchaseProduct = jest.fn(
      (_productId: string): Promise<unknown> =>
        Promise.resolve({
          storeProduct: {
            identifier: 'pro_monthly',
            price: 7.99,
            currencyCode: 'USD',
          },
        })
    );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    const Purchases = { purchaseProduct };

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: Purchases,
    });

    await Purchases.purchaseProduct('pro_monthly');

    expect(notifyPurchaseStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'pro_monthly',
        platform: 'ios',
        store: 'app_store',
      })
    );
    expect(notifyPurchaseCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'pro_monthly',
        platform: 'ios',
        store: 'app_store',
        price: 7.99,
        currency: 'USD',
      })
    );
    expect(notifyPurchaseCancelled).not.toHaveBeenCalled();
    expect(notifyPurchaseFailed).not.toHaveBeenCalled();

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });

  it('emite purchase_started heuristico al cerrar el paywall tras inactive y cancelacion', async () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();
    const beginHeuristicPaywallSession = jest.fn(() => Promise.resolve());
    const endHeuristicPaywallSession = jest.fn(() =>
      Promise.resolve({
        sawInactiveDuringPaywall: true,
        inactiveAt: 1_700_000_000_123,
      })
    );
    const presentPaywall = jest.fn(() => Promise.resolve('CANCELLED'));

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock('../../../NativeSignalfoxReactNative', () => ({
      __esModule: true,
      default: {
        beginHeuristicPaywallSession,
        endHeuristicPaywallSession,
      },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    class RevenueCatUI {}
    (RevenueCatUI as any).presentPaywall = presentPaywall;

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: {},
      revenueCatUI: RevenueCatUI,
    });

    await (RevenueCatUI as any).presentPaywall();

    expect(notifyModalOpened).toHaveBeenCalledTimes(1);
    expect(notifyModalClosed).toHaveBeenCalledTimes(1);
    expect(notifyPurchaseStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'ios',
        store: 'app_store',
        timestamp: 1_700_000_000_123,
      })
    );
    const modalCloseOrder = notifyModalClosed.mock.invocationCallOrder[0] ?? 0;
    const startedOrder = notifyPurchaseStarted.mock.invocationCallOrder[0] ?? 0;
    expect(startedOrder).toBeGreaterThan(modalCloseOrder);

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });

  it('no emite purchase_started heuristico tardio si Purchases ya emitio el flujo durante el paywall', async () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();
    const beginHeuristicPaywallSession = jest.fn(() => Promise.resolve());
    const endHeuristicPaywallSession = jest.fn(() =>
      Promise.resolve({
        sawInactiveDuringPaywall: true,
        inactiveAt: 1_700_000_000_123,
      })
    );
    const purchaseProduct = jest.fn((_productId: string) =>
      Promise.resolve({
        productIdentifier: 'pro_monthly',
      })
    );
    const Purchases = { purchaseProduct };

    class RevenueCatUI {}
    (RevenueCatUI as any).presentPaywall = jest.fn(async () => {
      await Purchases.purchaseProduct('pro_monthly');
      return 'PURCHASED';
    });

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock('../../../NativeSignalfoxReactNative', () => ({
      __esModule: true,
      default: {
        beginHeuristicPaywallSession,
        endHeuristicPaywallSession,
      },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: Purchases,
      revenueCatUI: RevenueCatUI,
    });

    await (RevenueCatUI as any).presentPaywall();

    expect(notifyPurchaseStarted).toHaveBeenCalledTimes(1);
    expect(notifyPurchaseStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'pro_monthly',
        platform: 'ios',
        store: 'app_store',
      })
    );
    expect(notifyPurchaseCompleted).toHaveBeenCalledTimes(1);
    expect(notifyPurchaseCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'pro_monthly',
        platform: 'ios',
        store: 'app_store',
      })
    );
    expect(notifyPurchaseCancelled).not.toHaveBeenCalled();
    expect(notifyPurchaseFailed).not.toHaveBeenCalled();

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });

  it('no emite eventos falsos si presentPaywallIfNeeded devuelve NOT_PRESENTED', async () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();
    const beginHeuristicPaywallSession = jest.fn(() => Promise.resolve());
    const endHeuristicPaywallSession = jest.fn(() =>
      Promise.resolve({ sawInactiveDuringPaywall: false })
    );
    const presentPaywallIfNeeded = jest.fn(() =>
      Promise.resolve('NOT_PRESENTED')
    );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock('../../../NativeSignalfoxReactNative', () => ({
      __esModule: true,
      default: {
        beginHeuristicPaywallSession,
        endHeuristicPaywallSession,
      },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    class RevenueCatUI {}
    (RevenueCatUI as any).presentPaywallIfNeeded = presentPaywallIfNeeded;

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: {},
      revenueCatUI: RevenueCatUI,
    });

    await (RevenueCatUI as any).presentPaywallIfNeeded({
      requiredEntitlementIdentifier: 'pro',
    });

    expect(beginHeuristicPaywallSession).toHaveBeenCalledTimes(1);
    expect(endHeuristicPaywallSession).toHaveBeenCalledTimes(1);
    expect(notifyModalOpened).not.toHaveBeenCalled();
    expect(notifyModalClosed).not.toHaveBeenCalled();
    expect(notifyPurchaseStarted).not.toHaveBeenCalled();

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });

  it('rellena price/currency desde el Package en args si el resultado no incluye StoreProduct', async () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();

    const purchasePackage = jest.fn(
      (_pkg: unknown): Promise<unknown> =>
        Promise.resolve({
          productIdentifier: 'annual',
          customerInfo: {},
          transaction: { productIdentifier: 'annual' },
        })
    );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    const pkg = {
      identifier: 'annual_pkg',
      product: { identifier: 'annual', price: 49.99, currencyCode: 'EUR' },
    };
    const Purchases = { purchasePackage };

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: Purchases,
    });

    await Purchases.purchasePackage(pkg);

    expect(notifyPurchaseCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'annual',
        price: 49.99,
        currency: 'EUR',
      })
    );

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });

  it('emite started y cancelled cuando RevenueCat devuelve cancelación de usuario', async () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();
    const purchaseProduct = jest.fn(
      (_productId: string): Promise<unknown> =>
        Promise.reject({
          userCancelled: true,
        })
    );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    const Purchases = { purchaseProduct };

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: Purchases,
    });

    await expect(Purchases.purchaseProduct('pro_annual')).rejects.toBeTruthy();

    expect(notifyPurchaseStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'pro_annual',
        platform: 'android',
        store: 'google_play',
      })
    );
    expect(notifyPurchaseCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'pro_annual',
        platform: 'android',
        store: 'google_play',
      })
    );
    expect(notifyPurchaseCompleted).not.toHaveBeenCalled();
    expect(notifyPurchaseFailed).not.toHaveBeenCalled();

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });

  it('emite failed cuando una compra falla sin cancelación', async () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();
    const purchaseProduct = jest.fn(
      (_productId: string): Promise<unknown> =>
        Promise.reject({
          code: 'NETWORK_ERROR',
          message: 'timeout',
        })
    );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    const Purchases = { purchaseProduct };

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: Purchases,
    });

    await expect(Purchases.purchaseProduct('pro_monthly')).rejects.toBeTruthy();

    expect(notifyPurchaseFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'pro_monthly',
        platform: 'ios',
        store: 'app_store',
        errorCode: 'NETWORK_ERROR',
        errorMessage: 'timeout',
      })
    );
    expect(notifyPurchaseCancelled).not.toHaveBeenCalled();
    expect(notifyPurchaseCompleted).not.toHaveBeenCalled();

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });

  it('emite restore_completed cuando RevenueCat restaura compras', async () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();
    const restorePurchases = jest.fn(() =>
      Promise.resolve({
        customerInfo: {
          activeSubscriptions: ['pro_monthly'],
          allPurchasedProductIdentifiers: ['pro_monthly', 'coins_100'],
        },
      })
    );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
    }));
    jest.doMock(
      '../purchaseAnalyticsBridge',
      () => ({
        notifyModalClosed,
        notifyModalOpened,
        notifyPurchaseStarted,
        notifyPurchaseCancelled,
        notifyPurchaseCompleted,
        notifyPurchaseFailed,
        notifyRestoreCompleted,
      }),
      { virtual: false }
    );

    const Purchases = { restorePurchases };

    const analyticsModule =
      require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: Purchases,
    });

    await Purchases.restorePurchases();

    expect(notifyRestoreCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'android',
        store: 'google_play',
        restoredProductIds: ['pro_monthly'],
      })
    );

    analyticsModule.stopRevenueCatPurchaseAnalyticsIfAvailable();
  });
});
