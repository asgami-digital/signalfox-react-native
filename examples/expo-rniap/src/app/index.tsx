import { router } from 'expo-router';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import {
  demoConfig,
  hasSignalFoxApiKey,
  isActiveSubscriptionSkuConfigured,
} from '../config/demoConfig';
import { logDemoEvent } from '../utils/logger';

export default function HomeScreen() {
  return (
    <DemoScreen
      title="Expo RN IAP"
      subtitle="Flows equivalent to the RN CLI example, but using Expo Router and a basic react-native-iap purchase flow."
    >
      <InfoCard
        title="Quick Status"
        body={`SignalFox API key: ${hasSignalFoxApiKey() ? 'configured' : 'log-only placeholder'}\nSubscription SKU: ${isActiveSubscriptionSkuConfigured() ? 'configured' : 'pending'}\nNote: ${demoConfig.storeNotes}`}
      />

      <ActionButton
        label="PurchaseScreen"
        signalFoxId="expo_home_go_purchase"
        onPress={() => {
          logDemoEvent('navigate_purchase');
          router.push('/purchase');
        }}
      />
      <ActionButton
        label="ModalExample"
        signalFoxId="expo_home_go_modal_example"
        variant="secondary"
        onPress={() => {
          logDemoEvent('navigate_modal_example');
          router.push('/modal-example');
        }}
      />
      <ActionButton
        label="SecondaryFlowScreen"
        signalFoxId="expo_home_go_secondary_flow"
        onPress={() => {
          logDemoEvent('navigate_secondary_flow');
          router.push('/secondary-flow');
        }}
      />
      <ActionButton
        label="Open navigation modal"
        signalFoxId="expo_home_open_navigation_modal"
        variant="ghost"
        onPress={() => {
          logDemoEvent('navigate_navigation_modal');
          router.push('/navigation-modal');
        }}
      />
      <ActionButton
        label="Analytics click with no action"
        signalFoxId="expo_home_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('expo_home_idle_click');
        }}
      />
    </DemoScreen>
  );
}
