/**
 * Resolución de ruta anidada: el estado de React Navigation puede tener
 * state.routes[].state (nested navigator). Recorremos recursivamente
 * state → routes[index] → state → … hasta la ruta hoja y devolvemos su name.
 * Así screen_view funciona con stacks/tabs anidados.
 */

export interface NavStateLike {
  /**
   * Identificador del navigator si la versión/runtime lo incluye en el estado.
   * El `id` de `<Stack.Navigator id="...">` normalmente NO está en `getRootState()`;
   * suele bastar `type`.
   */
  id?: string;
  /** Tipo del navigator (p. ej. stack, tab, drawer). Lo expone React Navigation en el state. */
  type?: string;
  routes: Array<{ name: string; key?: string; state?: NavStateLike }>;
  index: number;
}

/**
 * Devuelve el nombre de la ruta actual en el nivel dado.
 * Si la ruta activa tiene estado anidado (nested navigator), sigue recursivamente.
 */
export function getActiveRouteName(
  state: NavStateLike | undefined
): string | undefined {
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
    return getActiveRouteName(nested) ?? route.name;
  }
  return route.name;
}
