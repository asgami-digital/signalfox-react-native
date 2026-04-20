import {
  SIGNALFOX_EXAMPLE_API_KEY,
  RN_REVENUECAT_API_KEY,
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_PRODUCT_ID,
} from '@env';

function normalize(value: string | undefined): string {
  return (value ?? '').trim();
}

export const demoConfig = {
  signalFoxApiKey: normalize(SIGNALFOX_EXAMPLE_API_KEY),
  revenueCatApiKey: normalize(RN_REVENUECAT_API_KEY),
  revenueCatProductId: normalize(REVENUECAT_PRODUCT_ID),
  revenueCatEntitlementId: normalize(REVENUECAT_ENTITLEMENT_ID),
};

export function hasSignalFoxApiKey(): boolean {
  return demoConfig.signalFoxApiKey.length > 0;
}

export function hasRevenueCatApiKey(): boolean {
  return demoConfig.revenueCatApiKey.length > 0;
}

export function isRevenueCatProductConfigured(): boolean {
  return !demoConfig.revenueCatProductId.startsWith('REPLACE_WITH_');
}

export function isRevenueCatEntitlementConfigured(): boolean {
  return !demoConfig.revenueCatEntitlementId.startsWith('REPLACE_WITH_');
}
