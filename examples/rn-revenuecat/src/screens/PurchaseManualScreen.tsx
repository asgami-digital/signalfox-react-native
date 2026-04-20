import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import type {
  PurchasesOffering,
  PurchasesStoreProduct,
} from 'react-native-purchases';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import { demoConfig } from '../config/demoConfig';
import { logDemoEvent } from '../utils/logger';
import {
  loadRevenueCatProducts,
  purchaseConfiguredProduct,
  restoreRevenueCatPurchases,
  formatCustomerInfoSummary,
} from '../utils/revenueCat';

export function PurchaseManualScreen() {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [products, setProducts] = useState<PurchasesStoreProduct[]>([]);

  const refresh = async () => {
    try {
      const snapshot = await loadRevenueCatProducts();
      setOffering(snapshot.offerings);
      setProducts(snapshot.products);
    } catch (error) {
      logDemoEvent('manual_purchase_refresh_error', {
        message: error instanceof Error ? error.message : 'unknown',
      });
      Alert.alert('Could not load products', String(error));
    }
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  return (
    <DemoScreen
      title="PurchaseManualScreen"
      subtitle="Manual purchase and restore with `Purchases.*` using clear placeholders."
    >
      <InfoCard
        title="What You Need to Configure"
        body={`1. RN_REVENUECAT_API_KEY in .env\n2. revenueCatProductId in src/config/demoConfig.ts\n3. Active products in App Store / Play Store`}
      />
      <InfoCard
        title="Product Status"
        body={`Current offering: ${
          offering?.identifier ?? 'not available'
        }\nProduct placeholder: ${
          demoConfig.revenueCatProductId
        }\nLoaded products: ${
          products.map((item) => item.identifier).join(', ') || 'none yet'
        }`}
      />

      <ActionButton
        label="Reload products"
        signalFoxId="manual_purchase_reload_products"
        variant="ghost"
        onPress={() => {
          logDemoEvent('manual_reload_products');
          refresh().catch(() => {});
        }}
      />
      <ActionButton
        label="Buy subscription"
        signalFoxId="manual_purchase_buy_product"
        onPress={() => {
          purchaseConfiguredProduct().catch((error) => {
            logDemoEvent('manual_purchase_error', {
              message: error instanceof Error ? error.message : 'unknown',
            });
            Alert.alert('Purchase failed', String(error));
          });
        }}
      />
      <ActionButton
        label="Restore purchases"
        signalFoxId="manual_purchase_restore_purchases"
        variant="secondary"
        onPress={() => {
          restoreRevenueCatPurchases()
            .then((customerInfo) => {
              if (!customerInfo) {
                return;
              }
              Alert.alert(
                'Restore completed',
                formatCustomerInfoSummary(customerInfo)
              );
            })
            .catch((error) => {
              logDemoEvent('manual_restore_error', {
                message: error instanceof Error ? error.message : 'unknown',
              });
              Alert.alert('Restore failed', String(error));
            });
        }}
      />
      <ActionButton
        label="Analytics click with no action"
        signalFoxId="manual_purchase_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('manual_idle_click');
        }}
      />
      <Text style={styles.helperText}>
        If you prefer to purchase from a package/offer, you can extend this
        screen with `purchasePackage()` using
        `offerings.current.availablePackages`.
      </Text>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  helperText: {
    color: '#5b6780',
    fontSize: 13,
    lineHeight: 20,
  },
});
