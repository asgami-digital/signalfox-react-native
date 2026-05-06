import { router } from 'expo-router';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import { logDemoEvent } from '../utils/logger';

export default function NavigationModalScreen() {
  return (
    <DemoScreen
      title="NavigationModal"
      subtitle="Screen presented as a modal by Expo Router."
    >
      <InfoCard
        title="Details"
        body="This modal lets you compare modal navigation tracking against the native React Native modal."
      />
      <ActionButton
        label="Close modal"
        signalFoxNodeId="expo_navigation_modal_close"
        onPress={() => {
          logDemoEvent('expo_navigation_modal_close');
          router.back();
        }}
      />
      <ActionButton
        label="Test click"
        signalFoxNodeId="expo_navigation_modal_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('expo_navigation_modal_idle_click');
        }}
      />
    </DemoScreen>
  );
}
