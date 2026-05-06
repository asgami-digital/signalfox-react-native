import 'react-native-gesture-handler';
import '../bootstrap/signalfox';

import { useEffect, useMemo } from 'react';
import { Stack, useNavigationContainerRef } from 'expo-router';
import {
  SignalFox,
  expoRouterIntegration,
  reactNativeIapIntegration,
} from '@asgami-digital/signalfox-react-native';
import { demoConfig, hasSignalFoxApiKey } from '../config/demoConfig';

const reactNativeIapModule = require('react-native-iap');

export default function RootLayout() {
  const navigationRef = useNavigationContainerRef();

  const integrations = useMemo(
    () => [
      expoRouterIntegration({
        navigationRef,
      }),
      reactNativeIapIntegration({
        reactNativeIap: reactNativeIapModule,
      }),
    ],
    [navigationRef]
  );

  useEffect(() => {
    SignalFox.init({
      apiKey: hasSignalFoxApiKey()
        ? demoConfig.signalFoxApiKey
        : 'ak_dev__expo_demo_placeholder',
      logOnly: !hasSignalFoxApiKey(),
      integrations,
    }).catch((error) => {
      console.error('[expo-rniap] SignalFox init failed', error);
    });
  }, [integrations]);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="purchase" options={{ title: 'PurchaseScreen' }} />
      <Stack.Screen name="modal-example" options={{ title: 'ModalExample' }} />
      <Stack.Screen
        name="secondary-flow"
        options={{ title: 'SecondaryFlowScreen' }}
      />
      <Stack.Screen
        name="navigation-modal"
        options={{ presentation: 'modal', title: 'NavigationModal' }}
      />
    </Stack>
  );
}
