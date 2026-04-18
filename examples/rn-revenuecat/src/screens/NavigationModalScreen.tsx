import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import type { RootStackParamList } from '../navigation/types';
import { logDemoEvent } from '../utils/logger';

type Props = NativeStackScreenProps<RootStackParamList, 'NavigationModal'>;

export function NavigationModalScreen({ navigation }: Props) {
  return (
    <DemoScreen
      title="NavigationModalScreen"
      subtitle="Screen presented as a modal from React Navigation."
    >
      <InfoCard
        title="Usage"
        body="This screen uses `presentation: modal` to test modal navigation analytics in addition to the native modal."
      />

      <ActionButton
        label="Close modal"
        signalFoxId="navigation_modal_close"
        onPress={() => {
          logDemoEvent('close_navigation_modal');
          navigation.goBack();
        }}
      />
      <ActionButton
        label="Test click"
        signalFoxId="navigation_modal_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('navigation_modal_idle_click');
        }}
      />
    </DemoScreen>
  );
}
