import { router } from 'expo-router';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import { logDemoEvent } from '../utils/logger';

export default function SecondaryFlowScreen() {
  return (
    <DemoScreen
      title="SecondaryFlowScreen"
      subtitle="Secondary screen for testing additional navigation and clicks without duplicating the router modal flow."
    >
      <InfoCard
        title="Suggested Usage"
        body="Navigate between Home and PurchaseScreen to simulate realistic subscription app steps while keeping the router modal tied to a single entry point."
      />

      <ActionButton
        label="Go to PurchaseScreen"
        signalFoxNodeId="expo_secondary_go_purchase"
        onPress={() => {
          logDemoEvent('expo_secondary_go_purchase');
          router.push('/purchase');
        }}
      />
      <ActionButton
        label="Back to Home"
        signalFoxNodeId="expo_secondary_back_home"
        variant="secondary"
        onPress={() => {
          logDemoEvent('expo_secondary_back_home');
          router.replace('/');
        }}
      />
      <ActionButton
        label="Analytics click with no action"
        signalFoxNodeId="expo_secondary_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('expo_secondary_idle_click');
        }}
      />
    </DemoScreen>
  );
}
