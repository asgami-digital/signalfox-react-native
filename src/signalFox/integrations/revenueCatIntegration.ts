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

function extractCustomerInfoSummary(customerInfo: unknown): {
  entitlementIds?: string[];
  originalAppUserId?: string;
} {
  const ci = customerInfo as any;
  const active = ci?.entitlements?.active;
  const entitlementIds =
    active && typeof active === 'object' ? Object.keys(active) : undefined;
  const originalAppUserId = safeString(ci?.originalAppUserId);
  return {
    ...(entitlementIds?.length ? { entitlementIds } : {}),
    ...(originalAppUserId ? { originalAppUserId } : {}),
  };
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

      patchAsyncMethod(
        purchases,
        patches,
        core,
        'purchasePackage',
        {
          started: 'purchase_started',
          completed: 'purchase_completed',
          failed: 'purchase_failed',
        },
        (args, result, err) => {
          const pkg = args?.[0];
          const info = extractPackageInfo(pkg);
          const customerInfo =
            (result as any)?.customerInfo ?? (result as any)?.customerInfo;
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
        {
          started: 'purchase_started',
          completed: 'purchase_completed',
          failed: 'purchase_failed',
        },
        (args, result, err) => {
          const productId = safeString(args?.[0]);
          const customerInfo =
            (result as any)?.customerInfo ?? (result as any)?.customerInfo;
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
