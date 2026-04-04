import { Platform } from 'react-native';
import {
  notifyPurchaseCancelled,
  notifyPurchaseStarted,
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

const PATCHABLE_METHODS = [
  'purchasePackage',
  'purchaseStoreProduct',
  'purchaseProduct',
  'purchaseSubscriptionOption',
  'purchaseDiscountedProduct',
  'purchaseDiscountedPackage',
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
        (result) => result,
        (err: unknown) => {
          if (isRevenueCatUserCancellation(err, Purchases)) {
            notifyPurchaseCancelled({
              productId,
              platform,
              store,
            } as any);
          }
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

let rcHookRefCount = 0;
let rcTeardown: (() => void) | null = null;

/**
 * Parchea métodos estáticos de `Purchases` para `purchase_started` / `purchase_cancelled`.
 * Debe llamarse después de `startListeningToNativePurchaseEvents` para que exista `activeCore`.
 */
export function startRevenueCatPurchaseAnalyticsIfAvailable(): void {
  if (rcHookRefCount === 0) {
    const Purchases = tryLoadPurchases();
    if (Purchases && typeof Purchases === 'function') {
      const teardown = installRevenueCatPurchaseHooks(Purchases);
      if (teardown) {
        rcTeardown = teardown;
        console.log(
          '[SignalfoxPurchaseAnalyticsBridge][TS] RevenueCat: hooks de compra activados'
        );
      }
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
}
