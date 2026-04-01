/**
 * Integración RevenueCat — solo eventos canónicos: purchase_*, customer_info_*.
 */

import type {
  AnalyticsIntegration,
  IAnalyticsCore,
} from '../types/integration';

export interface RevenueCatIntegrationOptions {
  purchases: unknown;
}

type PatchRecord = {
  name: string;
  original: unknown;
};

const REVENUECAT_PATCH_MARKER: unique symbol = Symbol(
  'signalFox.revenueCatPatched'
);

function isFn(x: unknown): x is (...args: any[]) => any {
  return typeof x === 'function';
}

function safeString(x: unknown): string | undefined {
  return typeof x === 'string' && x.length > 0 ? x : undefined;
}

function extractErrorInfo(err: unknown): {
  errorCode?: string;
  errorMessage?: string;
} {
  const anyErr = err as any;
  const code =
    safeString(anyErr?.code) ??
    safeString(anyErr?.errorCode) ??
    safeString(anyErr?.userInfo?.code) ??
    safeString(anyErr?.userInfo?.readableErrorCode);
  const message =
    safeString(anyErr?.message) ??
    safeString(anyErr?.localizedDescription) ??
    safeString(anyErr?.userInfo?.message);
  return {
    ...(code ? { errorCode: code } : {}),
    ...(message ? { errorMessage: message } : {}),
  };
}

function keysOfEntitlementMap(raw: unknown): string[] {
  if (raw == null || typeof raw !== 'object') return [];
  if (raw instanceof Map) {
    return [...raw.keys()].filter((k) => typeof k === 'string' && k.length > 0);
  }
  return Object.keys(raw as Record<string, unknown>);
}

function getEntitlementEntry(container: unknown, id: string): unknown {
  if (container instanceof Map) return container.get(id);
  if (container != null && typeof container === 'object') {
    return (container as Record<string, unknown>)[id];
  }
  return undefined;
}

/**
 * Resume CustomerInfo de RevenueCat para analytics (entitlements, subs, productos).
 * Cubre RN/bridge donde `entitlements.active` puede venir vacío pero `all` + `isActive` sí informa.
 */
function extractCustomerInfoSummary(
  customerInfo: unknown
): Record<string, unknown> {
  const ci = customerInfo as any;
  if (ci == null || typeof ci !== 'object') return {};

  const out: Record<string, unknown> = {};

  const originalAppUserId = safeString(ci.originalAppUserId);
  if (originalAppUserId) out.originalAppUserId = originalAppUserId;

  const entitlements = ci.entitlements;
  const activeRaw = entitlements?.active;
  let entitlementIds = keysOfEntitlementMap(activeRaw).filter(
    (id) => getEntitlementEntry(activeRaw, id) != null
  );

  const allRaw = entitlements?.all;
  if (entitlementIds.length === 0 && allRaw && typeof allRaw === 'object') {
    entitlementIds = keysOfEntitlementMap(allRaw).filter((id) => {
      const e = getEntitlementEntry(allRaw, id);
      return (
        e != null &&
        typeof e === 'object' &&
        (e as { isActive?: boolean }).isActive === true
      );
    });
  }

  if (entitlementIds.length > 0) out.entitlementIds = entitlementIds;

  const activeSubscriptions = ci.activeSubscriptions;
  if (Array.isArray(activeSubscriptions) && activeSubscriptions.length > 0) {
    const ids = activeSubscriptions.filter(
      (x) => typeof x === 'string'
    ) as string[];
    if (ids.length > 0) out.activeSubscriptionProductIds = ids;
  }

  const allPurchased = ci.allPurchasedProductIdentifiers;
  if (Array.isArray(allPurchased) && allPurchased.length > 0) {
    const ids = allPurchased.filter((x) => typeof x === 'string') as string[];
    if (ids.length > 0) out.allPurchasedProductIdentifiers = ids;
  }

  const latestExp = safeString(ci.latestExpirationDate);
  if (latestExp) out.latestExpirationDate = latestExp;

  const firstSeen = safeString(ci.firstSeen);
  if (firstSeen) out.customerFirstSeen = firstSeen;

  return out;
}

/** MakePurchaseResult trae `customerInfo`; en algunos flujos el resultado puede ser el propio CustomerInfo. */
function pickCustomerInfoFromPurchaseResult(result: unknown): unknown {
  if (result == null || typeof result !== 'object') return undefined;
  const r = result as any;
  if (r.customerInfo != null) return r.customerInfo;
  if (r.entitlements != null && typeof r.entitlements === 'object') return r;
  return undefined;
}

function extractPackageInfo(pkg: unknown): {
  packageIdentifier?: string;
  offeringIdentifier?: string;
  productId?: string;
} {
  const p = pkg as any;
  const packageIdentifier = safeString(p?.identifier);
  const offeringIdentifier = safeString(p?.offeringIdentifier);
  const productId =
    safeString(p?.product?.identifier) ??
    safeString(p?.product?.productIdentifier) ??
    safeString(p?.storeProduct?.identifier) ??
    safeString(p?.storeProduct?.productIdentifier);
  return {
    ...(packageIdentifier ? { packageIdentifier } : {}),
    ...(offeringIdentifier ? { offeringIdentifier } : {}),
    ...(productId ? { productId } : {}),
  };
}

function extractStoreProductInfo(product: unknown): {
  productId?: string;
} {
  const p = product as any;
  const productId =
    safeString(p?.identifier) ??
    safeString(p?.productIdentifier) ??
    safeString(p?.productId);
  return productId ? { productId } : {};
}

function extractSubscriptionOptionInfo(opt: unknown): {
  productId?: string;
} {
  const o = opt as any;
  const productId =
    safeString(o?.productId) ??
    safeString(o?.id) ??
    safeString(o?.product?.identifier) ??
    safeString(o?.product?.productIdentifier);
  return productId ? { productId } : {};
}

function patchAsyncMethod(
  purchases: any,
  patches: PatchRecord[],
  core: IAnalyticsCore,
  methodName: string,
  events: { started: string; completed: string; failed: string },
  getPayload: (
    args: any[],
    result?: unknown,
    err?: unknown
  ) => Record<string, unknown>
): void {
  const original = (purchases as any)[methodName];
  if (!isFn(original)) return;

  patches.push({ name: methodName, original });

  (purchases as any)[methodName] = async (...args: any[]) => {
    core.trackEvent({
      type: events.started as any,
      payload: {
        source: 'revenuecat',
        method: methodName,
        ...getPayload(args),
      },
    });

    try {
      const result = await original.apply(purchases, args);
      core.trackEvent({
        type: events.completed as any,
        payload: {
          source: 'revenuecat',
          method: methodName,
          ...getPayload(args, result),
        },
      });
      return result;
    } catch (err) {
      core.trackEvent({
        type: events.failed as any,
        payload: {
          source: 'revenuecat',
          method: methodName,
          ...getPayload(args, undefined, err),
        },
      });
      throw err;
    }
  };
}

function patchCustomerInfoOnly(
  purchases: any,
  patches: PatchRecord[],
  core: IAnalyticsCore,
  methodName: string,
  getPayload: (
    args: any[],
    result?: unknown,
    err?: unknown
  ) => Record<string, unknown>
): void {
  const original = (purchases as any)[methodName];
  if (!isFn(original)) return;

  patches.push({ name: methodName, original });

  (purchases as any)[methodName] = async (...args: any[]) => {
    core.trackEvent({
      type: 'customer_info_requested',
      payload: {
        source: 'revenuecat',
        method: methodName,
        ...getPayload(args),
      },
    });

    try {
      const result = await original.apply(purchases, args);
      core.trackEvent({
        type: 'customer_info_received',
        payload: {
          source: 'revenuecat',
          method: methodName,
          ...getPayload(args, result),
        },
      });
      return result;
    } catch (err) {
      throw err;
    }
  };
}

export function revenueCatIntegration(
  options: RevenueCatIntegrationOptions
): AnalyticsIntegration {
  const purchases = options.purchases as any;

  return {
    name: 'revenueCat',

    setup(core) {
      if (purchases && (purchases as any)[REVENUECAT_PATCH_MARKER]) {
        return () => {};
      }
      if (purchases) {
        (purchases as any)[REVENUECAT_PATCH_MARKER] = true;
      }

      const patches: PatchRecord[] = [];

      const purchaseEvents = {
        started: 'purchase_started',
        completed: 'purchase_completed',
        failed: 'purchase_failed',
      } as const;

      patchAsyncMethod(
        purchases,
        patches,
        core,
        'purchasePackage',
        purchaseEvents,
        (args, result, err) => {
          const pkg = args?.[0];
          const info = extractPackageInfo(pkg);
          const customerInfo =
            err != null
              ? undefined
              : pickCustomerInfoFromPurchaseResult(result);
          return {
            ...info,
            ...extractCustomerInfoSummary(customerInfo),
            ...extractErrorInfo(err),
          };
        }
      );

      patchAsyncMethod(
        purchases,
        patches,
        core,
        'purchaseStoreProduct',
        purchaseEvents,
        (args, result, err) => {
          const product = args?.[0];
          const info = extractStoreProductInfo(product);
          const customerInfo =
            err != null
              ? undefined
              : pickCustomerInfoFromPurchaseResult(result);
          return {
            ...info,
            ...extractCustomerInfoSummary(customerInfo),
            ...extractErrorInfo(err),
          };
        }
      );

      patchAsyncMethod(
        purchases,
        patches,
        core,
        'purchaseSubscriptionOption',
        purchaseEvents,
        (args, result, err) => {
          const opt = args?.[0];
          const info = extractSubscriptionOptionInfo(opt);
          const customerInfo =
            err != null
              ? undefined
              : pickCustomerInfoFromPurchaseResult(result);
          return {
            ...info,
            ...extractCustomerInfoSummary(customerInfo),
            ...extractErrorInfo(err),
          };
        }
      );

      patchAsyncMethod(
        purchases,
        patches,
        core,
        'purchaseDiscountedPackage',
        purchaseEvents,
        (args, result, err) => {
          const pkg = args?.[0];
          const info = extractPackageInfo(pkg);
          const customerInfo =
            err != null
              ? undefined
              : pickCustomerInfoFromPurchaseResult(result);
          return {
            ...info,
            ...extractCustomerInfoSummary(customerInfo),
            ...extractErrorInfo(err),
          };
        }
      );

      patchAsyncMethod(
        purchases,
        patches,
        core,
        'purchaseDiscountedProduct',
        purchaseEvents,
        (args, result, err) => {
          const product = args?.[0];
          const info = extractStoreProductInfo(product);
          const customerInfo =
            err != null
              ? undefined
              : pickCustomerInfoFromPurchaseResult(result);
          return {
            ...info,
            ...extractCustomerInfoSummary(customerInfo),
            ...extractErrorInfo(err),
          };
        }
      );

      patchAsyncMethod(
        purchases,
        patches,
        core,
        'purchaseProduct',
        purchaseEvents,
        (args, result, err) => {
          const productId = safeString(args?.[0]);
          const customerInfo =
            err != null
              ? undefined
              : pickCustomerInfoFromPurchaseResult(result);
          return {
            ...(productId ? { productId } : {}),
            ...extractCustomerInfoSummary(customerInfo),
            ...extractErrorInfo(err),
          };
        }
      );

      patchCustomerInfoOnly(
        purchases,
        patches,
        core,
        'getCustomerInfo',
        (_args, result, err) => ({
          ...extractCustomerInfoSummary(result),
          ...extractErrorInfo(err),
        })
      );

      return () => {
        for (const p of patches) {
          (purchases as any)[p.name] = p.original;
        }
        if (purchases) {
          try {
            delete (purchases as any)[REVENUECAT_PATCH_MARKER];
          } catch {
            // ignore
          }
        }
      };
    },
  };
}
