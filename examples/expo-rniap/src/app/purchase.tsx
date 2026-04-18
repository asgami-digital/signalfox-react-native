import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { ErrorCode, useIAP } from 'react-native-iap';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import {
  demoConfig,
  getActiveSubscriptionSku,
  isActiveSubscriptionSkuConfigured,
} from '../config/demoConfig';
import { logDemoEvent } from '../utils/logger';

export default function PurchaseScreen() {
  const [statusText, setStatusText] = useState(
    'Connect to the store to load products.'
  );

  const sku = getActiveSubscriptionSku();
  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
    restorePurchases,
    finishTransaction,
  } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      await finishTransaction({
        purchase,
        isConsumable: false,
      });

      setStatusText(
        purchase.purchaseToken
          ? `Purchase completed: ${purchase.purchaseToken}`
          : 'Purchase completed with no visible purchaseToken.'
      );
      logDemoEvent('iap_purchase_completed', {
        productId: purchase.productId,
        purchaseToken: purchase.purchaseToken ?? null,
      });
    },
    onPurchaseError: (error) => {
      if (error.code === ErrorCode.UserCancelled) {
        setStatusText('Purchase cancelled by the user.');
        logDemoEvent('iap_purchase_cancelled');
        return;
      }

      setStatusText(`Purchase failed: ${error.message}`);
      logDemoEvent('iap_purchase_error', {
        code: error.code,
        message: error.message,
      });
      Alert.alert('Purchase failed', error.message);
    },
  });

  const connectAndLoad = async () => {
    if (!isActiveSubscriptionSkuConfigured()) {
      Alert.alert(
        'Missing productId',
        'Replace the placeholder SKU in src/config/demoConfig.ts before testing purchases.'
      );
      return;
    }

    try {
      logDemoEvent('iap_connect_start', { sku });
      await fetchProducts({ skus: [sku], type: 'subs' });
      setStatusText(
        'Store query sent. Check the list of loaded products.'
      );
      logDemoEvent('iap_products_loaded', {
        requestedSkus: [sku],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusText(`Store loading error: ${message}`);
      logDemoEvent('iap_connect_error', { message });
      Alert.alert('Store error', message);
    }
  };

  const buySubscription = async () => {
    if (!isActiveSubscriptionSkuConfigured()) {
      Alert.alert(
        'Missing productId',
        'Replace the placeholder SKU in src/config/demoConfig.ts before purchasing.'
      );
      return;
    }

    try {
      logDemoEvent('iap_purchase_start', { sku });
      await requestPurchase({
        request: {
          apple: { sku },
          google: { skus: [sku] },
        },
        type: 'subs',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined;

      if (code === ErrorCode.UserCancelled) {
        setStatusText('Purchase cancelled by the user.');
        logDemoEvent('iap_purchase_cancelled');
        return;
      }

      setStatusText(`Purchase failed: ${message}`);
      logDemoEvent('iap_purchase_error', { code, message });
      Alert.alert('Purchase failed', message);
    }
  };

  const restoreStorePurchases = async () => {
    try {
      logDemoEvent('iap_restore_start');
      await restorePurchases();
      setStatusText(
        'Restore completed. Review restored purchases and analytics events.'
      );
      logDemoEvent('iap_restore_completed');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusText(`Restore failed: ${message}`);
      logDemoEvent('iap_restore_error', { message });
      Alert.alert('Restore failed', message);
    }
  };

  useEffect(() => {
    if (connected) {
      void connectAndLoad();
    }
  }, [connected]);

  return (
    <DemoScreen
      title="PurchaseScreen"
      subtitle="Basic react-native-iap flow: connection, purchase, and restore."
    >
      <InfoCard
        title="What You Need to Configure"
        body={`iOS SKU: ${demoConfig.iosSubscriptionProductId}\nAndroid SKU: ${demoConfig.androidSubscriptionProductId}\nYou need a development build, not Expo Go, to test native purchases.`}
      />
      <InfoCard
        title="Store Status"
        body={`Connected: ${connected ? 'yes' : 'no'}\n${statusText}`}
      />
      <InfoCard
        title="Loaded Products"
        body={
          subscriptions.length > 0
            ? subscriptions
                .map(
                  (item) =>
                    `${item.id} | ${item.title ?? 'untitled'} | ${item.displayPrice ?? 'no price'}`
                )
                .join('\n')
            : 'No subscriptions are available yet.'
        }
      />

      <ActionButton
        label="Reconnect and reload"
        signalFoxId="expo_purchase_reload_store"
        variant="ghost"
        onPress={() => {
          void connectAndLoad();
        }}
      />
      <ActionButton
        label="Buy subscription"
        signalFoxId="expo_purchase_buy_subscription"
        onPress={() => {
          void buySubscription();
        }}
      />
      <ActionButton
        label="Restore purchases"
        signalFoxId="expo_purchase_restore_purchases"
        variant="secondary"
        onPress={() => {
          void restoreStorePurchases();
        }}
      />
      <ActionButton
        label="Analytics click without purchase"
        signalFoxId="expo_purchase_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('expo_purchase_idle_click');
        }}
      />
    </DemoScreen>
  );
}
