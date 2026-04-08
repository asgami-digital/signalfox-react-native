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
    jest.doMock(
      'react-native-purchases',
      () => ({
        __esModule: true,
        default: function Purchases() {},
      }),
      { virtual: true }
    );
    jest.doMock(
      'react-native-purchases-ui',
      () => {
        class RevenueCatUI {}
        (RevenueCatUI as any).presentPaywall = presentPaywall;
        return {
          __esModule: true,
          default: RevenueCatUI,
        };
      },
      { virtual: true }
    );

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalyticsIfAvailable();

    const RevenueCatUI = require('react-native-purchases-ui').default as {
      presentPaywall: () => Promise<unknown>;
    };

    await RevenueCatUI.presentPaywall();

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
    jest.doMock(
      'react-native-purchases',
      () => ({
        __esModule: true,
        default: function Purchases() {},
      }),
      { virtual: true }
    );
    jest.doMock(
      'react-native-purchases-ui',
      () => {
        class RevenueCatUI {}
        (RevenueCatUI as any).Paywall = (props: Record<string, unknown>) =>
          React.createElement('rc-paywall', props);
        return {
          __esModule: true,
          default: RevenueCatUI,
        };
      },
      { virtual: true }
    );

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalyticsIfAvailable();

    const RevenueCatUI = require('react-native-purchases-ui').default as {
      Paywall: React.ComponentType<Record<string, unknown>>;
    };
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
        storeProduct: { identifier: 'pro_monthly' },
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
    jest.doMock(
      'react-native-purchases',
      () => ({
        __esModule: true,
        default: {
          purchaseProduct,
        },
      }),
      { virtual: true }
    );
    jest.doMock(
      'react-native-purchases-ui',
      () => ({
        __esModule: true,
        default: function RevenueCatUI() {},
      }),
      { virtual: true }
    );

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalyticsIfAvailable();

    const Purchases = require('react-native-purchases').default as {
      purchaseProduct: (productId: string) => Promise<unknown>;
    };

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
      })
    );
    expect(notifyPurchaseCancelled).not.toHaveBeenCalled();
    expect(notifyPurchaseFailed).not.toHaveBeenCalled();

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
    jest.doMock(
      'react-native-purchases',
      () => ({
        __esModule: true,
        default: {
          purchaseProduct,
        },
      }),
      { virtual: true }
    );
    jest.doMock(
      'react-native-purchases-ui',
      () => ({
        __esModule: true,
        default: function RevenueCatUI() {},
      }),
      { virtual: true }
    );

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalyticsIfAvailable();

    const Purchases = require('react-native-purchases').default as {
      purchaseProduct: (productId: string) => Promise<unknown>;
    };

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
    jest.doMock(
      'react-native-purchases',
      () => ({
        __esModule: true,
        default: {
          purchaseProduct,
        },
      }),
      { virtual: true }
    );
    jest.doMock(
      'react-native-purchases-ui',
      () => ({
        __esModule: true,
        default: function RevenueCatUI() {},
      }),
      { virtual: true }
    );

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalyticsIfAvailable();

    const Purchases = require('react-native-purchases').default as {
      purchaseProduct: (productId: string) => Promise<unknown>;
    };

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
    jest.doMock(
      'react-native-purchases',
      () => ({
        __esModule: true,
        default: {
          restorePurchases,
        },
      }),
      { virtual: true }
    );
    jest.doMock(
      'react-native-purchases-ui',
      () => ({
        __esModule: true,
        default: function RevenueCatUI() {},
      }),
      { virtual: true }
    );

    const analyticsModule = require('../revenueCatPurchaseAnalytics') as typeof import('../revenueCatPurchaseAnalytics');
    analyticsModule.startRevenueCatPurchaseAnalyticsIfAvailable();

    const Purchases = require('react-native-purchases').default as {
      restorePurchases: () => Promise<unknown>;
    };

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
