import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, View, StyleSheet } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import { hasRevenueCatApiKey, hasSignalFoxApiKey } from '../config/demoConfig';
import type { RootStackParamList } from '../navigation/types';
import { logDemoEvent } from '../utils/logger';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  return (
    <DemoScreen
      title="RN RevenueCat"
      subtitle="Navigation, modal, click, and purchase scenarios with React Native CLI + RevenueCat."
    >
      <InfoCard
        title="Quick Status"
        body={`SignalFox API key: ${
          hasSignalFoxApiKey() ? 'configured' : 'pending'
        }\nRevenueCat API key: ${
          hasRevenueCatApiKey() ? 'configured' : 'pending'
        }`}
      />

      <View style={styles.group}>
        <Text style={styles.groupTitle}>Main Flows</Text>
        <ActionButton
          label="Manual purchase"
          signalFoxId="home_go_manual_purchase"
          onPress={() => {
            logDemoEvent('navigate_purchase_manual');
            navigation.navigate('PurchaseManual');
          }}
        />
        <ActionButton
          label="Embedded paywall UI"
          signalFoxId="home_go_paywall_ui"
          variant="secondary"
          onPress={() => {
            logDemoEvent('navigate_purchase_paywall_ui');
            navigation.navigate('PurchasePaywallUI');
          }}
        />
        <ActionButton
          label="Present paywall"
          signalFoxId="home_go_present_paywall"
          onPress={() => {
            logDemoEvent('navigate_purchase_present_paywall');
            navigation.navigate('PurchasePresentPaywall');
          }}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>Modals and Interaction</Text>
        <ActionButton
          label="Modal examples"
          signalFoxId="home_go_modal_example"
          variant="ghost"
          onPress={() => {
            logDemoEvent('navigate_modal_example');
            navigation.navigate('ModalExample');
          }}
        />
        <ActionButton
          label="Open modal screen (stack)"
          signalFoxId="home_open_navigation_modal"
          variant="ghost"
          onPress={() => {
            logDemoEvent('navigate_navigation_modal');
            navigation.navigate('NavigationModal');
          }}
        />
        <ActionButton
          label="Test click without action"
          signalFoxId="home_idle_click"
          variant="ghost"
          onPress={() => {
            logDemoEvent('home_idle_click');
          }}
        />
      </View>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: 20,
  },
  groupTitle: {
    color: '#10213f',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
});
