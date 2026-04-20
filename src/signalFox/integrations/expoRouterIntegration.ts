import type { AnalyticsIntegration } from '../types/integration';
import {
  reactNavigationIntegration,
  type NavigationRefLike,
} from './reactNavigationIntegration';

export const EXPO_ROUTER_INTEGRATION_NAME = 'expoRouter';

export interface ExpoRouterIntegrationOptions {
  /**
   * Expo Router root container ref.
   *
   * Typical usage:
   * `const navigationRef = useNavigationContainerRef()` desde `expo-router`.
   */
  navigationRef: NavigationRefLike;
}

/**
 * Navigation integration for Expo Router.
 *
 * Expo Router mounts React Navigation under the hood and exposes the root ref with
 * `useNavigationContainerRef()`, so we reuse the same `reactNavigationIntegration`
 * logic to preserve `intent_ts`, `screen_view`,
 * `stack_path`, `active_tab`, and screen resolution.
 */
export function expoRouterIntegration(
  options: ExpoRouterIntegrationOptions
): AnalyticsIntegration {
  const base = reactNavigationIntegration({
    navigationRef: options.navigationRef,
  });

  return {
    ...base,
    name: EXPO_ROUTER_INTEGRATION_NAME,
  };
}
