import React from 'react';
import { Platform } from 'react-native';
import {
  notifyModalClosed,
  notifyModalOpened,
  notifyPurchaseCancelled,
  notifyPurchaseCompleted,
  notifyPurchaseFailed,
  notifyPurchaseStarted,
  notifyRestoreCompleted,
} from './nativePurchaseEventBridge';

/**
 * Carga opcional de RevenueCat. Si no está instalado en la app host, Metro puede fallar al
 * resolver el módulo; en ese caso instala `react-native-purchases` o aliasa el módulo.
 */
function tryLoadPurchases(): any {
  try {
    const mod = require('react-native-purchases');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

function tryLoadRevenueCatUI(): any {
  try {
    const mod = require('react-native-purchases-ui');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

const REVENUECAT_PAYWALL_MODAL_NAME = 'RevenueCat Paywall';
const PAYWALL_PATCHABLE_METHODS = [
  'presentPaywall',
  'presentPaywallIfNeeded',
] as const;

let activeRevenueCatPaywallSources = 0;

function openRevenueCatPaywallSource(trigger: string): void {
  const shouldEmitOpen = activeRevenueCatPaywallSources === 0;
  activeRevenueCatPaywallSources += 1;

  if (!shouldEmitOpen) {
    return;
  }

  notifyModalOpened(REVENUECAT_PAYWALL_MODAL_NAME, {
    provider: 'revenuecat',
    trigger,
    paywall_name: REVENUECAT_PAYWALL_MODAL_NAME,
  });
}

function closeRevenueCatPaywallSource(trigger: string): void {
  if (activeRevenueCatPaywallSources <= 0) {
    return;
  }

  activeRevenueCatPaywallSources -= 1;
  if (activeRevenueCatPaywallSources > 0) {
    return;
  }

  notifyModalClosed(REVENUECAT_PAYWALL_MODAL_NAME, {
    provider: 'revenuecat',
    trigger,
    paywall_name: REVENUECAT_PAYWALL_MODAL_NAME,
  });
}

const PATCHABLE_METHODS = [
  'purchasePackage',
  'purchaseStoreProduct',
  'purchaseProduct',
  'purchaseSubscriptionOption',
  'purchaseDiscountedProduct',
  'purchaseDiscountedPackage',
] as const;

const RESTORE_PATCHABLE_METHODS = [
  'restorePurchases',
  'restoreTransactions',
] as const;

function purchaseProductIdFromArgs(
  method: (typeof PATCHABLE_METHODS)[number],
  args: unknown[]
): string | undefined {
  const a0 = args[0];
  if (method === 'purchaseProduct' && typeof a0 === 'string' && a0.trim()) {
    return a0.trim();
  }
  if (!a0 || typeof a0 !== 'object') return undefined;
  const o = a0 as Record<string, unknown>;
  const storeProduct = o.storeProduct as Record<string, unknown> | undefined;
  if (storeProduct) {
    const id =
      (typeof storeProduct.identifier === 'string' &&
        storeProduct.identifier) ||
      (typeof storeProduct.productIdentifier === 'string' &&
        storeProduct.productIdentifier);
    if (id) return id.trim();
  }
  if (typeof o.productId === 'string' && o.productId.trim()) {
    return o.productId.trim();
  }
  const product = o.product as Record<string, unknown> | undefined;
  if (
    product &&
    typeof product.identifier === 'string' &&
    product.identifier.trim()
  ) {
    return product.identifier.trim();
  }
  if (typeof o.identifier === 'string' && o.identifier.trim()) {
    return o.identifier.trim();
  }
  return undefined;
}

function isRevenueCatUserCancellation(err: unknown, Purchases: any): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  if (e.userCancelled === true) return true;

  const readable = e.readableErrorCode;
  if (typeof readable === 'string') {
    const u = readable.toUpperCase();
    if (u.includes('PURCHASE') && u.includes('CANCEL')) return true;
  }

  const codes = Purchases?.PURCHASES_ERROR_CODE;
  const code = e.code;
  if (codes && code != null && typeof codes === 'object') {
    for (const key of Object.keys(codes)) {
      if (/CANCEL/i.test(key) && codes[key] === code) return true;
    }
  }
  return false;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function extractCustomerInfo(result: unknown): Record<string, unknown> | null {
  const obj = asRecord(result);
  if (!obj) return null;
  const direct = asRecord(obj.customerInfo);
  if (direct) return direct;
  return obj;
}

function inferProductIdFromResult(
  result: unknown,
  fallbackProductId?: string
): string | undefined {
  const obj = asRecord(result);
  if (!obj) return fallbackProductId;
  return pickString(
    obj.productIdentifier,
    obj.productId,
    asRecord(obj.storeProduct)?.identifier,
    asRecord(obj.storeProduct)?.productIdentifier,
    asRecord(obj.product)?.identifier,
    asRecord(obj.transaction)?.productIdentifier,
    fallbackProductId
  );
}

function inferRestoreProductIds(result: unknown): string[] | undefined {
  const info = extractCustomerInfo(result);
  if (!info) return undefined;

  const candidateArrays: unknown[] = [
    info.activeSubscriptions,
    info.allPurchasedProductIdentifiers,
    info.nonSubscriptionTransactions,
  ];
  for (const candidate of candidateArrays) {
    if (!Array.isArray(candidate)) continue;
    const ids = candidate
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        const rec = asRecord(item);
        return pickString(rec?.productIdentifier, rec?.productId);
      })
      .filter((item): item is string => !!item);
    if (ids.length > 0) {
      return Array.from(new Set(ids));
    }
  }
  return undefined;
}

function installRevenueCatPurchaseHooks(Purchases: any): (() => void) | null {
  const originals = new Map<string, (...args: unknown[]) => Promise<unknown>>();

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const store = platform === 'ios' ? 'app_store' : 'google_play';

  for (const name of PATCHABLE_METHODS) {
    const original = Purchases[name];
    if (typeof original !== 'function') continue;

    const boundOriginal = original.bind(Purchases) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    originals.set(name, boundOriginal);

    Purchases[name] = (...args: unknown[]) => {
      const productId = purchaseProductIdFromArgs(name, args);
      notifyPurchaseStarted({
        productId,
        platform,
        store,
      } as any);

      return boundOriginal(...args).then(
        (result) => {
          notifyPurchaseCompleted({
            productId: inferProductIdFromResult(result, productId),
            platform,
            store,
          } as any);
          return result;
        },
        (err: unknown) => {
          if (isRevenueCatUserCancellation(err, Purchases)) {
            notifyPurchaseCancelled({
              productId,
              platform,
              store,
            } as any);
          } else {
            const error = asRecord(err);
            notifyPurchaseFailed({
              productId,
              platform,
              store,
              errorCode: pickString(error?.readableErrorCode, error?.code),
              errorMessage: pickString(error?.message, error?.description),
            } as any);
          }
          throw err;
        }
      );
    };
  }

  for (const name of RESTORE_PATCHABLE_METHODS) {
    const original = Purchases[name];
    if (typeof original !== 'function') continue;

    const boundOriginal = original.bind(Purchases) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    originals.set(name, boundOriginal);

    Purchases[name] = (...args: unknown[]) => {
      return boundOriginal(...args).then(
        (result) => {
          notifyRestoreCompleted({
            platform,
            store,
            restoredProductIds: inferRestoreProductIds(result),
          } as any);
          return result;
        },
        (err: unknown) => {
          throw err;
        }
      );
    };
  }

  if (originals.size === 0) return null;

  return () => {
    for (const [name, fn] of originals) {
      Purchases[name] = fn;
    }
  };
}

function installRevenueCatPaywallHooks(
  RevenueCatUI: any
): (() => void) | null {
  if (!RevenueCatUI || typeof RevenueCatUI !== 'function') {
    return null;
  }

  const restoreEntries: Array<[string, unknown]> = [];

  for (const name of PAYWALL_PATCHABLE_METHODS) {
    const original = RevenueCatUI[name];
    if (typeof original !== 'function') continue;

    restoreEntries.push([name, original]);
    RevenueCatUI[name] = (...args: unknown[]) => {
      const trigger = `revenuecat_ui.${name}`;
      openRevenueCatPaywallSource(trigger);

      try {
        return Promise.resolve(original.apply(RevenueCatUI, args)).then(
          (result) => {
            closeRevenueCatPaywallSource(trigger);
            return result;
          },
          (error) => {
            closeRevenueCatPaywallSource(trigger);
            throw error;
          }
        );
      } catch (error) {
        closeRevenueCatPaywallSource(trigger);
        throw error;
      }
    };
  }

  const OriginalPaywall = RevenueCatUI.Paywall;
  if (typeof OriginalPaywall === 'function') {
    restoreEntries.push(['Paywall', OriginalPaywall]);
    RevenueCatUI.Paywall = class SignalFoxRevenueCatPaywall extends React.Component<Record<
      string,
      unknown
    >> {
      private isTrackingOpen = false;

      componentDidMount(): void {
        openRevenueCatPaywallSource('revenuecat_ui.Paywall');
        this.isTrackingOpen = true;
      }

      componentWillUnmount(): void {
        this.closeTrackingIfNeeded('revenuecat_ui.Paywall.unmount');
      }

      private closeTrackingIfNeeded(trigger: string): void {
        if (!this.isTrackingOpen) {
          return;
        }
        this.isTrackingOpen = false;
        closeRevenueCatPaywallSource(trigger);
      }

      render(): React.ReactNode {
        const props = this.props as Record<string, unknown>;
        const originalOnDismiss = props.onDismiss;

        return React.createElement(OriginalPaywall, {
          ...props,
          onDismiss: (...args: unknown[]) => {
            this.closeTrackingIfNeeded('revenuecat_ui.Paywall.onDismiss');
            if (typeof originalOnDismiss === 'function') {
              originalOnDismiss(...args);
            }
          },
        });
      }
    };
  }

  if (restoreEntries.length === 0) return null;

  return () => {
    for (const [name, value] of restoreEntries) {
      RevenueCatUI[name] = value;
    }
  };
}

let rcHookRefCount = 0;
let rcTeardown: (() => void) | null = null;

/**
 * Parchea métodos estáticos de `Purchases` para eventos de compra y restore.
 * Debe llamarse después de `startListeningToNativePurchaseEvents` para que exista `activeCore`.
 */
export function startRevenueCatPurchaseAnalyticsIfAvailable(): void {
  if (rcHookRefCount === 0) {
    const Purchases = tryLoadPurchases();
    const RevenueCatUI = tryLoadRevenueCatUI();
    const teardowns: Array<() => void> = [];

    if (Purchases && (typeof Purchases === 'function' || typeof Purchases === 'object')) {
      const purchaseTeardown = installRevenueCatPurchaseHooks(Purchases);
      if (purchaseTeardown) {
        teardowns.push(purchaseTeardown);
        console.log(
          '[SignalfoxPurchaseAnalyticsBridge][TS] RevenueCat: hooks de compra activados'
        );
      }
    }

    const paywallTeardown = installRevenueCatPaywallHooks(RevenueCatUI);
    if (paywallTeardown) {
      teardowns.push(paywallTeardown);
      console.log(
        '[SignalfoxPurchaseAnalyticsBridge][TS] RevenueCat: hooks de paywall activados'
      );
    }

    if (teardowns.length > 0) {
      rcTeardown = () => {
        for (const teardown of teardowns) {
          teardown();
        }
      };
    }
  }
  rcHookRefCount += 1;
}

export function isRevenueCatPurchasesAvailable(): boolean {
  const Purchases = tryLoadPurchases();
  return !!Purchases && (typeof Purchases === 'function' || typeof Purchases === 'object');
}

export function stopRevenueCatPurchaseAnalyticsIfAvailable(): void {
  if (rcHookRefCount <= 0) return;
  rcHookRefCount -= 1;
  if (rcHookRefCount > 0) return;
  rcTeardown?.();
  rcTeardown = null;
  activeRevenueCatPaywallSources = 0;
}
