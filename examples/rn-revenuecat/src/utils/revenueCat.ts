import { Alert } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASE_TYPE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesStoreProduct,
} from 'react-native-purchases';
import RevenueCatUI, {
  PAYWALL_RESULT,
  type PAYWALL_RESULT as PaywallResultType,
} from 'react-native-purchases-ui';
import {
  demoConfig,
  hasRevenueCatApiKey,
  isRevenueCatEntitlementConfigured,
  isRevenueCatProductConfigured,
} from '../config/demoConfig';
import { logDemoEvent } from './logger';

let purchasesConfigured = false;

function showPlaceholderAlert(title: string, message: string) {
  Alert.alert(title, message);
}

export function ensureRevenueCatConfigured(): boolean {
  if (!hasRevenueCatApiKey()) {
    showPlaceholderAlert(
      'Configure RevenueCat',
      'Add RN_REVENUECAT_API_KEY to examples/rn-revenuecat/.env before testing purchases.'
    );
    return false;
  }

  if (!purchasesConfigured) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({
      apiKey: demoConfig.revenueCatApiKey,
    });
    purchasesConfigured = true;
    logDemoEvent('revenuecat_configured');
  }

  return true;
}

export async function loadRevenueCatProducts(): Promise<{
  offerings: PurchasesOffering | null;
  products: PurchasesStoreProduct[];
}> {
  if (!ensureRevenueCatConfigured()) {
    return { offerings: null, products: [] };
  }

  const offerings = await Purchases.getOfferings();
  const products = isRevenueCatProductConfigured()
    ? await Purchases.getProducts(
        [demoConfig.revenueCatProductId],
        PURCHASE_TYPE.SUBS
      )
    : [];

  logDemoEvent('revenuecat_products_loaded', {
    hasCurrentOffering: Boolean(offerings.current),
    products: products.map((product) => product.identifier),
  });

  return {
    offerings: offerings.current ?? null,
    products,
  };
}

export async function purchaseConfiguredProduct(): Promise<void> {
  if (!ensureRevenueCatConfigured()) {
    return;
  }

  if (!isRevenueCatProductConfigured()) {
    showPlaceholderAlert(
      'Missing productId',
      'Replace REPLACE_WITH_REVENUECAT_PRODUCT_ID in src/config/demoConfig.ts before purchasing.'
    );
    return;
  }

  logDemoEvent('manual_purchase_tapped', {
    productId: demoConfig.revenueCatProductId,
  });

  const result = await Purchases.purchaseProduct(
    demoConfig.revenueCatProductId,
    null,
    PURCHASE_TYPE.SUBS
  );

  logDemoEvent('manual_purchase_completed', {
    productIdentifier: result.productIdentifier,
  });
}

export async function restoreRevenueCatPurchases(): Promise<CustomerInfo | null> {
  if (!ensureRevenueCatConfigured()) {
    return null;
  }

  logDemoEvent('manual_restore_started');
  const customerInfo = await Purchases.restorePurchases();
  logDemoEvent('manual_restore_completed', {
    activeEntitlements: Object.keys(customerInfo.entitlements.active),
  });
  return customerInfo;
}

export async function presentRevenueCatPaywall(
  offering?: PurchasesOffering | null
): Promise<PaywallResultType> {
  if (!ensureRevenueCatConfigured()) {
    return PAYWALL_RESULT.NOT_PRESENTED;
  }

  logDemoEvent('present_paywall_started', {
    offeringIdentifier: offering?.identifier ?? 'current',
  });

  const result = offering
    ? await RevenueCatUI.presentPaywall({ offering })
    : await RevenueCatUI.presentPaywall();

  logDemoEvent('present_paywall_finished', { result });
  return result;
}

export async function presentRevenueCatPaywallIfNeeded(
  offering?: PurchasesOffering | null
): Promise<PaywallResultType> {
  if (!ensureRevenueCatConfigured()) {
    return PAYWALL_RESULT.NOT_PRESENTED;
  }

  if (!isRevenueCatEntitlementConfigured()) {
    showPlaceholderAlert(
      'Missing entitlementId',
      'Replace REPLACE_WITH_REVENUECAT_ENTITLEMENT_ID in src/config/demoConfig.ts if you want to use presentPaywallIfNeeded.'
    );
    return PAYWALL_RESULT.NOT_PRESENTED;
  }

  logDemoEvent('present_paywall_if_needed_started', {
    entitlementId: demoConfig.revenueCatEntitlementId,
    offeringIdentifier: offering?.identifier ?? 'current',
  });

  const result = offering
    ? await RevenueCatUI.presentPaywallIfNeeded({
        offering,
        requiredEntitlementIdentifier: demoConfig.revenueCatEntitlementId,
      })
    : await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: demoConfig.revenueCatEntitlementId,
      });

  logDemoEvent('present_paywall_if_needed_finished', { result });
  return result;
}

export function formatCustomerInfoSummary(
  customerInfo: CustomerInfo | undefined
): string {
  if (!customerInfo) {
    return 'No customerInfo available yet.';
  }

  const activeEntitlements = Object.keys(customerInfo.entitlements.active);
  if (activeEntitlements.length === 0) {
    return 'Purchase completed, but there are no active entitlements at the moment.';
  }

  return `Active entitlements: ${activeEntitlements.join(', ')}`;
}
