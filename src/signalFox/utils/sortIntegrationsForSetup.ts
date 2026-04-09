import type { AnalyticsIntegration } from '../types/integration';

/**
 * Garantiza que `nativePurchaseIntegration` corra antes que `revenueCatIntegration`
 * para que `activeCore` exista en el bridge cuando se instalen los parches de RevenueCat.
 */
export function sortIntegrationsForSetup(
  list: readonly AnalyticsIntegration[]
): AnalyticsIntegration[] {
  const priority = (name: string): number => {
    if (name === 'nativePurchaseAnalytics') return 0;
    if (name === 'revenueCatPurchaseAnalytics') return 1;
    return 2;
  };
  return [...list].sort(
    (a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name)
  );
}
