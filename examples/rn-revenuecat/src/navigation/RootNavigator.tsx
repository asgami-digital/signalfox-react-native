import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  SignalFoxProvider,
  reactNavigationIntegration,
  revenueCatIntegration,
} from '@asgami-digital/signalfox-react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { ModalExampleScreen } from '../screens/ModalExampleScreen';
import { NavigationModalScreen } from '../screens/NavigationModalScreen';
import { PurchaseManualScreen } from '../screens/PurchaseManualScreen';
import { PurchasePaywallUIScreen } from '../screens/PurchasePaywallUIScreen';
import { PurchasePresentPaywallScreen } from '../screens/PurchasePresentPaywallScreen';
import type { RootStackParamList } from './types';
import { demoConfig, hasSignalFoxApiKey } from '../config/demoConfig';
import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

if (__DEV__ && !hasSignalFoxApiKey()) {
  console.warn(
    '[rn-revenuecat] Missing SIGNALFOX_EXAMPLE_API_KEY. Copy examples/rn-revenuecat/.env.example to .env and fill it in.'
  );
}

export function RootNavigator() {
  return (
    <SignalFoxProvider
      apiKey={demoConfig.signalFoxApiKey}
      integrations={[
        reactNavigationIntegration({ navigationRef }),
        revenueCatIntegration({
          purchases: Purchases,
          revenueCatUI: RevenueCatUI,
        }),
      ]}
    >
      <NavigationContainer
        ref={navigationRef}
        onStateChange={() => {
          const route = navigationRef.getCurrentRoute();
          console.log('[rn-revenuecat] navigation_state_change', {
            name: route?.name,
          });
        }}
      >
        <Stack.Navigator>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'Home' }}
          />
          <Stack.Screen
            name="PurchaseManual"
            component={PurchaseManualScreen}
            options={{ title: 'Manual Purchase' }}
          />
          <Stack.Screen
            name="PurchasePaywallUI"
            component={PurchasePaywallUIScreen}
            options={{ title: 'Paywall UI' }}
          />
          <Stack.Screen
            name="PurchasePresentPaywall"
            component={PurchasePresentPaywallScreen}
            options={{ title: 'Present Paywall' }}
          />
          <Stack.Screen
            name="ModalExample"
            component={ModalExampleScreen}
            options={{ title: 'Native Modal' }}
          />
          <Stack.Screen
            name="NavigationModal"
            component={NavigationModalScreen}
            options={{
              title: 'Stack Modal',
              presentation: 'modal',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SignalFoxProvider>
  );
}
