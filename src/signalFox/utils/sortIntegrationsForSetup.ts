import type { AnalyticsIntegration } from '../types/integration';

/**
 * Si usas ambas, `nativePurchaseAnalytics` antes que `revenueCatPurchaseAnalytics`:
 * la nativa puede registrar el core y extras antes de parchear Purchases (opcional).
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
