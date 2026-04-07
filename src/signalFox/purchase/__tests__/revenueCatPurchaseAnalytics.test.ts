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
});
