export function logDemoEvent(eventName: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`[rn-revenuecat] ${eventName}`, details);
    return;
  }

  console.log(`[rn-revenuecat] ${eventName}`);
}
