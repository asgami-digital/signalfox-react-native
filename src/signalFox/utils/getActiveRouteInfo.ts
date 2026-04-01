/**
 * Información de la ruta activa para screen_view y detección de modales.
 * Soporta navegación anidada: se devuelve la ruta hoja (más profunda).
 */

import type { NavStateLike } from './getActiveRouteName';

export interface ActiveRouteInfo {
  name: string;
  /** Presentación de la pantalla si está disponible (p. ej. 'fullScreenModal', 'modal').
   * React Navigation no incluye options en el state serializado; debe proveerse vía getPresentationForRoute. */
  presentation?: string;
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

/**
 * Obtiene la ruta activa más profunda y, si se pasa getter, su presentación.
 * getPresentationForRoute: opcional; en muchos setups las options no vienen en el state
 * y hay que resolverlas desde la configuración del navigator (ver limitaciones en comentarios del integration).
 */
export function getActiveRouteInfo(
  state: NavStateLike | undefined,
  getPresentationForRoute?: (routeName: string) => string | undefined
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
      getActiveRouteInfo(nested, getPresentationForRoute) ?? {
        name: route.name,
        presentation: getPresentationForRoute?.(route.name),
      }
    );
  }
  const name = route.name;
  return {
    name,
    presentation: getPresentationForRoute?.(name),
  };
}
