import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import {
  SignalFox,
  reactNavigationIntegration,
  revenueCatIntegration,
} from '@asgami-digital/signalfox-react-native';
import { demoConfig, hasSignalFoxApiKey } from './config/demoConfig';
import { navigationRef } from './navigation/navigationRef';

if (__DEV__ && !hasSignalFoxApiKey()) {
  console.warn(
    '[rn-revenuecat] Missing SIGNALFOX_EXAMPLE_API_KEY. Copy examples/rn-revenuecat/.env.example to .env and fill it in.'
  );
}

void SignalFox.init({
  apiKey: demoConfig.signalFoxApiKey,
  integrations: [
    reactNavigationIntegration({ navigationRef }),
    revenueCatIntegration({
      purchases: Purchases,
      revenueCatUI: RevenueCatUI,
    }),
  ],
});
