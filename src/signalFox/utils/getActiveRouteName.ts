/**
 * Nested route resolution: the React Navigation state can contain
 * state.routes[].state (nested navigator). Recorremos recursivamente
 * state → routes[index] → state → … hasta la ruta hoja y devolvemos su name.
 * This allows screen_view to work with nested stacks/tabs.
 */

export interface NavStateLike {
  /**
   * Navigator identifier if the version/runtime includes it in the state.
   * The `id` of `<Stack.Navigator id="...">` is usually NOT present in `getRootState()`;
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
