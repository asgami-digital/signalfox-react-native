import 'react-native-gesture-handler';
import '../bootstrap/signalfox';

import { Stack } from 'expo-router';
import { SignalFoxExpoProvider } from '../providers/SignalFoxExpoProvider';

export default function RootLayout() {
  return (
    <SignalFoxExpoProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Home' }} />
        <Stack.Screen name="purchase" options={{ title: 'PurchaseScreen' }} />
        <Stack.Screen
          name="modal-example"
          options={{ title: 'ModalExample' }}
        />
        <Stack.Screen
          name="secondary-flow"
          options={{ title: 'SecondaryFlowScreen' }}
        />
        <Stack.Screen
          name="navigation-modal"
          options={{ presentation: 'modal', title: 'NavigationModal' }}
        />
      </Stack>
    </SignalFoxExpoProvider>
  );
}
