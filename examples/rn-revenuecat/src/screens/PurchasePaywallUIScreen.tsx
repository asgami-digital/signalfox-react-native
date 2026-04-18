import { Alert, StyleSheet, Text, View } from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import { logDemoEvent } from '../utils/logger';
import {
  ensureRevenueCatConfigured,
  formatCustomerInfoSummary,
} from '../utils/revenueCat';

export function PurchasePaywallUIScreen() {
  if (!ensureRevenueCatConfigured()) {
    return (
      <DemoScreen
        title="PurchasePaywallUIScreen"
        subtitle="This flow requires the RevenueCat API key to be configured."
      >
        <InfoCard
          title="Pending"
          body="Add RN_REVENUECAT_API_KEY to examples/rn-revenuecat/.env to render the real paywall."
        />
      </DemoScreen>
    );
  }

  const handlePurchaseCompleted = ({
    customerInfo,
  }: {
    customerInfo: CustomerInfo;
  }) => {
    logDemoEvent('paywall_ui_purchase_completed', {
      activeEntitlements: Object.keys(customerInfo.entitlements.active),
    });
    Alert.alert('Purchase completed', formatCustomerInfoSummary(customerInfo));
  };

  return (
    <DemoScreen
      title="PurchasePaywallUIScreen"
      subtitle="Embedded paywall using `react-native-purchases-ui`."
    >
      <InfoCard
        title="Notes"
        body="This screen is useful for testing internal modals, dismiss, restore, and purchase events from the RevenueCat component itself."
      />

      <ActionButton
        label="Test click before paywall"
        signalFoxId="paywall_ui_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('paywall_ui_idle_click');
        }}
      />

      <View style={styles.paywallContainer}>
        <RevenueCatUI.Paywall
          onPurchaseStarted={() => logDemoEvent('paywall_ui_purchase_started')}
          onPurchaseCompleted={handlePurchaseCompleted}
          onPurchaseError={({ error }) => {
            logDemoEvent('paywall_ui_purchase_error', {
              message: error.message,
            });
            Alert.alert('Purchase error', error.message);
          }}
          onPurchaseCancelled={() => {
            logDemoEvent('paywall_ui_purchase_cancelled');
          }}
          onRestoreStarted={() => {
            logDemoEvent('paywall_ui_restore_started');
          }}
          onRestoreCompleted={({ customerInfo }) => {
            logDemoEvent('paywall_ui_restore_completed');
            Alert.alert(
              'Restore completed',
              formatCustomerInfoSummary(customerInfo)
            );
          }}
          onRestoreError={({ error }) => {
            logDemoEvent('paywall_ui_restore_error', {
              message: error.message,
            });
            Alert.alert('Restore error', error.message);
          }}
          onDismiss={() => {
            logDemoEvent('paywall_ui_dismissed');
          }}
        />
      </View>

      <Text style={styles.caption}>
        If you want to force a specific offering, add the `options` prop with
        the offering loaded from `Purchases.getOfferings()`.
      </Text>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  paywallContainer: {
    borderColor: '#d8e2fb',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 420,
    overflow: 'hidden',
  },
  caption: {
    color: '#5b6780',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },
});
