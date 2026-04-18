import type { AnalyticsIntegration } from '../types/integration';
import {
  reactNavigationIntegration,
  type NavigationRefLike,
} from './reactNavigationIntegration';

export const EXPO_ROUTER_INTEGRATION_NAME = 'expoRouter';

export interface ExpoRouterIntegrationOptions {
  /**
   * Ref del contenedor raíz de Expo Router.
   *
   * Uso típico:
   * `const navigationRef = useNavigationContainerRef()` desde `expo-router`.
   */
  navigationRef: NavigationRefLike;
}

/**
 * Integración de navegación para Expo Router.
 *
 * Expo Router monta React Navigation por debajo y expone el ref raíz con
 * `useNavigationContainerRef()`, así que reutilizamos la misma lógica de
 * `reactNavigationIntegration` para conservar `intent_ts`, `screen_view`,
 * `stack_path`, `active_tab` y resolución de pantalla.
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
