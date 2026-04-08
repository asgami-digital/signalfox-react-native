import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

function getRenderedPaywallNode(
  tree: ReactTestRenderer,
  testID: string
): { props: { onDismiss?: () => void } } {
  return tree.root
    .findAllByProps({ testID })
    .find((node) => typeof node.props.onDismiss === 'function') as {
    props: { onDismiss?: () => void };
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

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock(
      '../nativePurchaseEventBridge',
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

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: {},
      revenueCatUI: RevenueCatUI,
    });

    await (RevenueCatUI as any).presentPaywall();

    expect(notifyModalOpened).toHaveBeenCalledWith(
      'RevenueCat Paywall',
      expect.objectContaining({
        provider: 'revenuecat',
        trigger: 'revenuecat_ui.presentPaywall',
      })
    );
    expect(notifyModalClosed).toHaveBeenCalledWith(
      'RevenueCat Paywall',
      expect.objectContaining({
        provider: 'revenuecat',
        trigger: 'revenuecat_ui.presentPaywall',
      })
    );

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
      '../nativePurchaseEventBridge',
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

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalytics({
      purchases: {},
      revenueCatUI: RevenueCatUI,
    });

    let tree!: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(RevenueCatUI.Paywall, { testID: 'paywall' })
      );
    });

    expect(notifyModalOpened).toHaveBeenCalledWith(
      'RevenueCat Paywall',
      expect.objectContaining({
        provider: 'revenuecat',
        trigger: 'revenuecat_ui.Paywall',
      })
    );
    expect(notifyModalClosed).not.toHaveBeenCalled();

    act(() => {
      getRenderedPaywallNode(tree, 'paywall').props.onDismiss?.();
    });

    expect(notifyModalClosed).toHaveBeenCalledWith(
      'RevenueCat Paywall',
      expect.objectContaining({
        provider: 'revenuecat',
        trigger: 'revenuecat_ui.Paywall.onDismiss',
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
    const purchaseProduct = jest.fn(() =>
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
      '../nativePurchaseEventBridge',
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

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
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

  it('rellena price/currency desde el Package en args si el resultado no incluye StoreProduct', async () => {
    const notifyModalOpened = jest.fn();
    const notifyModalClosed = jest.fn();
    const notifyPurchaseStarted = jest.fn();
    const notifyPurchaseCancelled = jest.fn();
    const notifyPurchaseCompleted = jest.fn();
    const notifyPurchaseFailed = jest.fn();
    const notifyRestoreCompleted = jest.fn();

    const purchasePackage = jest.fn(() =>
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
      '../nativePurchaseEventBridge',
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

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
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
    const purchaseProduct = jest.fn(() =>
      Promise.reject({
        userCancelled: true,
      })
    );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
    }));
    jest.doMock(
      '../nativePurchaseEventBridge',
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

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
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
    const purchaseProduct = jest.fn(() =>
      Promise.reject({
        code: 'NETWORK_ERROR',
        message: 'timeout',
      })
    );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock(
      '../nativePurchaseEventBridge',
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

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
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
      '../nativePurchaseEventBridge',
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

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
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
