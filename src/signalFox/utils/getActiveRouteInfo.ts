/**
 * Información de la ruta activa.
 * Soporta navegación anidada: se devuelve la ruta hoja (más profunda).
 */

import type { NavStateLike } from './getActiveRouteName';

export interface ActiveRouteInfo {
  name: string;
  key?: string;
}

const MODAL_PRESENTATIONS = new Set<string>([
  'modal',
  'fullScreenModal',
  'transparentModal',
]);

/**
 * Indica si una opción de presentación corresponde a un modal.
 * Basado en las opciones estándar de React Navigation (Stack).
 */
export function isRoutePresentedAsModal(
  presentation: string | undefined
): boolean {
  if (presentation == null) return false;
  return MODAL_PRESENTATIONS.has(presentation);
}

/** Obtiene la ruta activa más profunda. */
export function getActiveRouteInfo(
  state: NavStateLike | undefined
): ActiveRouteInfo | undefined {
  if (
    !state?.routes?.length ||
    state.index < 0 ||
    state.index >= state.routes.length
  ) {
    return undefined;
  }
  const route = state.routes[state.index];
  if (!route) return undefined;
  const nested = route.state;
  if (nested?.routes?.length) {
    return (
      getActiveRouteInfo(nested) ?? {
        name: route.name,
        key: route.key,
      }
    );
  }
  return {
    name: route.name,
    key: route.key,
  };
}
