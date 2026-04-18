import { router } from 'expo-router';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import { logDemoEvent } from '../utils/logger';

export default function SecondaryFlowScreen() {
  return (
    <DemoScreen
      title="SecondaryFlowScreen"
      subtitle="Secondary screen for testing additional navigation, clicks, and router modal opening."
    >
      <InfoCard
        title="Suggested Usage"
        body="Navigate between Home, PurchaseScreen, and the router modal to simulate realistic subscription app steps."
      />

      <ActionButton
        label="Go to PurchaseScreen"
        signalFoxId="expo_secondary_go_purchase"
        onPress={() => {
          logDemoEvent('expo_secondary_go_purchase');
          router.push('/purchase');
        }}
      />
      <ActionButton
        label="Open router modal"
        signalFoxId="expo_secondary_open_navigation_modal"
        variant="secondary"
        onPress={() => {
          logDemoEvent('expo_secondary_open_navigation_modal');
          router.push('/navigation-modal');
        }}
      />
      <ActionButton
        label="Back to Home"
        signalFoxId="expo_secondary_back_home"
        variant="ghost"
        onPress={() => {
          logDemoEvent('expo_secondary_back_home');
          router.replace('/');
        }}
      />
      <ActionButton
        label="Analytics click with no action"
        signalFoxId="expo_secondary_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('expo_secondary_idle_click');
        }}
      />
    </DemoScreen>
  );
}
