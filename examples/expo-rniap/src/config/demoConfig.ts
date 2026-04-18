import { Platform } from 'react-native';

function normalize(value: string | undefined): string {
  return (value ?? '').trim();
}

export const demoConfig = {
  signalFoxApiKey: normalize(process.env.EXPO_PUBLIC_SIGNALFOX_API_KEY),
  //iosSubscriptionProductId: 'REPLACE_WITH_IOS_SUBSCRIPTION_PRODUCT_ID',
  iosSubscriptionProductId: 'com.asgami.ageme.subs14.monthly',
  androidSubscriptionProductId:
    'REPLACE_WITH_ANDROID_SUBSCRIPTION_PRODUCT_ID',
  storeNotes:
    'Configure StoreKit / Play Console and use a development build to test react-native-iap.',
};

export function hasSignalFoxApiKey(): boolean {
  return demoConfig.signalFoxApiKey.length > 0;
}

export function getActiveSubscriptionSku(): string {
  return Platform.select({
    ios: demoConfig.iosSubscriptionProductId,
    android: demoConfig.androidSubscriptionProductId,
    default: 'REPLACE_WITH_UNSUPPORTED_PLATFORM_PRODUCT_ID',
  });
}

export function isActiveSubscriptionSkuConfigured(): boolean {
  // return !getActiveSubscriptionSku().startsWith('REPLACE_WITH_');
  return true;
}
