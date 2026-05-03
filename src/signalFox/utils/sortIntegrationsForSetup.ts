export function sortIntegrationsForSetup<T extends { name: string }>(
  list: readonly T[]
): T[] {
  const priority = (name: string): number => {
    if (name === 'appState') return 0;
    if (name === 'revenueCatPurchaseAnalytics') return 1;
    return 2;
  };
  return [...list].sort(
    (a, b) =>
      priority(a.name) - priority(b.name) || a.name.localeCompare(b.name)
  );
}
