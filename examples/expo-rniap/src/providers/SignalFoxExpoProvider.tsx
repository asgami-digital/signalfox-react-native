import { useMemo } from 'react';
import { useNavigationContainerRef } from 'expo-router';
import {
  SignalFoxProvider,
  expoRouterIntegration,
  reactNativeIapIntegration,
} from '@asgami-digital/signalfox-react-native';
import { demoConfig, hasSignalFoxApiKey } from '../config/demoConfig';

const reactNativeIapModule = require('react-native-iap');

type Props = {
  children: React.ReactNode;
};

export function SignalFoxExpoProvider({ children }: Props) {
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

  return (
    <SignalFoxProvider
      apiKey={
        hasSignalFoxApiKey()
          ? demoConfig.signalFoxApiKey
          : 'ak_dev__expo_demo_placeholder'
      }
      logOnly={!hasSignalFoxApiKey()}
      integrations={integrations}
    >
      {children}
    </SignalFoxProvider>
  );
}
