/**
 * Information about the active route.
 * Supports nested navigation: returns the leaf route (the deepest one).
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
 * Indicates whether a presentation option corresponds to a modal.
 * Based on standard React Navigation (Stack) options.
 */
export function isRoutePresentedAsModal(
  presentation: string | undefined
): boolean {
  if (presentation == null) return false;
  return MODAL_PRESENTATIONS.has(presentation);
}

/** Gets the deepest active route. */
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
