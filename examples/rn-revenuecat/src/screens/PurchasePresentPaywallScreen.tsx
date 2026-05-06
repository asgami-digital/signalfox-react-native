import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { PurchasesOffering } from 'react-native-purchases';
import { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import { demoConfig } from '../config/demoConfig';
import { logDemoEvent } from '../utils/logger';
import {
  loadRevenueCatProducts,
  presentRevenueCatPaywall,
  presentRevenueCatPaywallIfNeeded,
} from '../utils/revenueCat';

export function PurchasePresentPaywallScreen() {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);

  useEffect(() => {
    loadRevenueCatProducts()
      .then((snapshot) => setOffering(snapshot.offerings))
      .catch((error) => {
        logDemoEvent('present_paywall_load_error', {
          message: error instanceof Error ? error.message : 'unknown',
        });
      });
  }, []);

  const handlePaywallResult = (result: PAYWALL_RESULT) => {
    Alert.alert('Paywall result', `RevenueCat returned: ${result}`);
  };

  return (
    <DemoScreen
      title="PurchasePresentPaywallScreen"
      subtitle="Modal paywall presentation with `presentPaywall()` and the optional `presentPaywallIfNeeded()` variant."
    >
      <InfoCard
        title="Current Status"
        body={`Current offering: ${
          offering?.identifier ?? 'no offering'
        }\nEntitlement placeholder: ${demoConfig.revenueCatEntitlementId}`}
      />

      <ActionButton
        label="Present paywall"
        signalFoxNodeId="present_paywall_button"
        onPress={() => {
          presentRevenueCatPaywall(offering)
            .then(handlePaywallResult)
            .catch((error) => {
              logDemoEvent('present_paywall_error', {
                message: error instanceof Error ? error.message : 'unknown',
              });
              Alert.alert('Error presenting paywall', String(error));
            });
        }}
      />

      <ActionButton
        label="Present paywall if needed"
        signalFoxNodeId="present_paywall_if_needed_button"
        variant="secondary"
        onPress={() => {
          presentRevenueCatPaywallIfNeeded(offering)
            .then(handlePaywallResult)
            .catch((error) => {
              logDemoEvent('present_paywall_if_needed_error', {
                message: error instanceof Error ? error.message : 'unknown',
              });
              Alert.alert('Error presenting paywall', String(error));
            });
        }}
      />

      <ActionButton
        label="Analytics click without purchase"
        signalFoxNodeId="present_paywall_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('present_paywall_idle_click');
        }}
      />
    </DemoScreen>
  );
}
