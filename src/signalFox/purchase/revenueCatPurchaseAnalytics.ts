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

function pickFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * `PurchasesStoreProduct`, objeto `Price` de fases de suscripción (amountMicros), o campos legacy Android.
 */
function extractPriceCurrencyFromProductLike(
  raw: unknown
): { price?: number; currency?: string } {
  const o = asRecord(raw);
  if (!o) return {};

  if (
    typeof o.amountMicros === 'number' &&
    Number.isFinite(o.amountMicros)
  ) {
    const currency = pickString(o.currencyCode);
    return {
      price: o.amountMicros / 1_000_000,
      ...(currency ? { currency } : {}),
    };
  }

  const micros = pickFiniteNumber(o.priceAmountMicros);
  const fromMicros =
    micros != null ? micros / 1_000_000 : undefined;

  const price = pickFiniteNumber(o.price) ?? fromMicros;
  const currency = pickString(
    o.currencyCode,
    o.currency,
    o.priceCurrencyCode
  );

  const out: { price?: number; currency?: string } = {};
  if (price != null && Number.isFinite(price)) out.price = price;
  if (currency) out.currency = currency;
  return out;
}

function inferPriceCurrencyFromPurchaseContext(
  result: unknown,
  method: (typeof PATCHABLE_METHODS)[number],
  args: unknown[]
): { price?: number; currency?: string } {
  const fromResult = (): { price?: number; currency?: string } => {
    const r = asRecord(result);
    if (!r) return {};
    for (const raw of [
      r.storeProduct,
      r.product,
      r.transaction,
      r.storeTransaction,
    ]) {
      const x = extractPriceCurrencyFromProductLike(raw);
      if (x.price != null || x.currency) return x;
    }
    return {};
  };

  const fromArgs = (): { price?: number; currency?: string } => {
    const a0 = args[0];
    if (method === 'purchasePackage' || method === 'purchaseDiscountedPackage') {
      const pkg = asRecord(a0);
      return extractPriceCurrencyFromProductLike(
        pkg?.product ?? pkg?.storeProduct
      );
    }
    if (
      method === 'purchaseStoreProduct' ||
      method === 'purchaseDiscountedProduct'
    ) {
      return extractPriceCurrencyFromProductLike(a0);
    }
    if (method === 'purchaseSubscriptionOption') {
      const opt = asRecord(a0);
      const phases = opt?.pricingPhases;
      if (Array.isArray(phases)) {
        for (const ph of phases) {
          const phase = asRecord(ph);
          const x = extractPriceCurrencyFromProductLike(phase?.price);
          if (x.price != null || x.currency) return x;
        }
      }
      return extractPriceCurrencyFromProductLike(opt);
    }
    return {};
  };

  const r = fromResult();
  if (r.price != null || r.currency) return r;
  return fromArgs();
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

function installRevenueCatPurchaseHooks(Purchases: any): {
  teardown: () => void;
  patchedMethods: string[];
} | null {
  const originals = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const patchedMethods: string[] = [];

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const store = platform === 'ios' ? 'app_store' : 'google_play';

  for (const name of PATCHABLE_METHODS) {
    const original = Purchases[name];
    if (typeof original !== 'function') continue;

    const boundOriginal = original.bind(Purchases) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    originals.set(name, boundOriginal);
    patchedMethods.push(name);

    Purchases[name] = (...args: unknown[]) => {
      const productId = purchaseProductIdFromArgs(name, args);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[SignalFox][RevenueCat] compra interceptada', name, {
          productId: productId ?? '(sin id)',
        });
      }
      notifyPurchaseStarted({
        productId,
        platform,
        store,
      } as any);

      return boundOriginal(...args).then(
        (result) => {
          const { price, currency } = inferPriceCurrencyFromPurchaseContext(
            result,
            name,
            args
          );
          notifyPurchaseCompleted({
            productId: inferProductIdFromResult(result, productId),
            platform,
            store,
            ...(price != null && Number.isFinite(price) ? { price } : {}),
            ...(currency ? { currency } : {}),
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
    patchedMethods.push(name);

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

  const teardown = () => {
    for (const [name, fn] of originals) {
      Purchases[name] = fn;
    }
  };

  return { teardown, patchedMethods };
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

export type StartRevenueCatPurchaseAnalyticsOptions = {
  purchases: unknown;
  revenueCatUI?: unknown;
};

function isPurchasesModule(value: unknown): value is Record<string, unknown> {
  return (
    value != null &&
    (typeof value === 'object' || typeof value === 'function')
  );
}

/**
 * Parchea métodos de `Purchases` (y opcionalmente `RevenueCatUI`) usando referencias inyectadas.
 * Debe llamarse después de `startListeningToNativePurchaseEvents` para que exista `activeCore`.
 */
export function startRevenueCatPurchaseAnalytics(
  options: StartRevenueCatPurchaseAnalyticsOptions
): void {
  if (rcHookRefCount === 0) {
    const teardowns: Array<() => void> = [];

    if (isPurchasesModule(options.purchases)) {
      const purchaseInstall = installRevenueCatPurchaseHooks(
        options.purchases as any
      );
      if (purchaseInstall) {
        teardowns.push(purchaseInstall.teardown);
        console.log(
          '[SignalfoxPurchaseAnalyticsBridge][TS] RevenueCat: hooks de compra activados:',
          purchaseInstall.patchedMethods.join(', ')
        );
      } else if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const p = options.purchases as Record<string, unknown> | null;
        const seemedPurchasesSdk =
          p != null &&
          (typeof p.configure === 'function' ||
            typeof p.purchasePackage === 'function' ||
            typeof p.purchaseProduct === 'function');
        if (seemedPurchasesSdk) {
          console.warn(
            '[SignalFox][RevenueCat] No se parcheó ningún método en el objeto `Purchases`. Revisa la versión del SDK o que uses el default export. Buscados:',
            [...PATCHABLE_METHODS, ...RESTORE_PATCHABLE_METHODS].join(', ')
          );
        }
      }
    } else {
      console.warn(
        '[SignalFox] revenueCatIntegration: `purchases` no es un módulo válido; se omiten hooks de compra'
      );
    }

    const RevenueCatUI = options.revenueCatUI;
    if (RevenueCatUI != null && typeof RevenueCatUI === 'function') {
      const paywallTeardown = installRevenueCatPaywallHooks(RevenueCatUI);
      if (paywallTeardown) {
        teardowns.push(paywallTeardown);
        console.log(
          '[SignalfoxPurchaseAnalyticsBridge][TS] RevenueCat: hooks de paywall activados'
        );
      }
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

export function stopRevenueCatPurchaseAnalyticsIfAvailable(): void {
  if (rcHookRefCount <= 0) return;
  rcHookRefCount -= 1;
  if (rcHookRefCount > 0) return;
  rcTeardown?.();
  rcTeardown = null;
  activeRevenueCatPaywallSources = 0;
}
