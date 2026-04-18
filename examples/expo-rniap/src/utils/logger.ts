export function logDemoEvent(
  eventName: string,
  details?: Record<string, unknown>
) {
  if (details) {
    console.log(`[expo-rniap] ${eventName}`, details);
    return;
  }

  console.log(`[expo-rniap] ${eventName}`);
}
